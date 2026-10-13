import {describe, expect, test} from "vitest";

import {cn, createTV, tv} from "../index";
import {createBoundedCache, createLazyOverrideMerge} from "../internal/cache.js";
import {defineSlots, defineVariants} from "./support/loose.js";
import {countRetained, gcAvailable, measureRetainedBytes} from "./support/reachability.js";

/**
 * What stays held once work churns through something that does NOT go away.
 *
 * `retention.test.ts` asks whether a DROPPED component becomes collectable. These cases ask the
 * opposite question of the caches, trackers and components that live for the whole process: as
 * calls, props, overrides, children and class strings churn through them, does anything grow
 * without a bound? A bound that only holds for LOOKUPS is not a bound on memory — an entry no key
 * can reach is still an entry something is holding — so these assert reachability and bytes,
 * never hit rate.
 *
 * Run with `pnpm test:leak`.
 */

// V8 deduplicates byte-identical strings, so a payload repeated verbatim understates retention:
// a thousand copies collapse onto one and a real leak weighs almost nothing. Every payload here
// carries its index inside every repeat, so no two are ever the same bytes.
const distinctPayload = (label: string, index: number): string => `${label}-${index}-`.repeat(48);
const distinctClassName = (label: string, index: number): string => `${label}-${index}-`.repeat(16);

// The limits live in `cache.ts` and are private to it; `bounded-cache.test.ts` mirrors the
// override one the same way.
const OVERRIDE_LIMIT = 128;
const VARIANT_LIMIT = 256;
// Two generations is the design, so the ceiling on live entries is twice the limit — a constant,
// never a fraction of however many calls a test happens to make.
const RESULT_CEILING = VARIANT_LIMIT * 2;
// Comfortably above the tens of kilobytes a heap measurement moves by here, and far below the
// megabytes a cache adds within one loop once it stops evicting.
const PLATEAU_SLACK_BYTES = 1_000_000;

describe.skipIf(!gcAvailable)("steady-state retention", () => {
  test("a rotated-out generation is released, not merely unreachable by key", async () => {
    const LIMIT = 8;
    const cache = createBoundedCache<object>(LIMIT);
    const firstGeneration: WeakRef<object>[] = [];

    // Filled from a helper so the loop's frame — which can pin the value it last held — is gone
    // before anything is counted.
    const fill = (label: string, probes: WeakRef<object>[] | null): void => {
      for (let index = 0; index < LIMIT; index++) {
        const value = {payload: distinctPayload(label, index)};

        cache.set(`${label}-${index}`, value);
        probes?.push(new WeakRef(value));
      }
    };

    fill("first", firstGeneration);
    // The first write of each later generation rotates: the first becomes secondary, and is
    // dropped outright when the third arrives.
    fill("second", null);
    fill("third", null);

    // `bounded-cache.test.ts` pins the LOOKUP bound, which a leak satisfies without effort: a
    // generation no key can reach but something still references passes every hit-rate assertion
    // there is. This is the half that cannot be satisfied by accident.
    expect(await countRetained(firstGeneration)).toBe(0);
  });

  test("clear releases both generations, not only the one it can reach by key", async () => {
    const LIMIT = 8;
    const cache = createBoundedCache<object>(LIMIT);
    const probes: WeakRef<object>[] = [];

    const fill = (label: string): void => {
      for (let index = 0; index < LIMIT; index++) {
        const value = {payload: distinctPayload(label, index)};

        cache.set(`${label}-${index}`, value);
        probes.push(new WeakRef(value));
      }
    };

    fill("first");
    fill("second");

    // This is the invalidation path: a component whose compound metadata mutates clears its cache
    // on every call. Emptying only the generation `get` reads first would leave the other one
    // holding every superseded result, for exactly the components that churn most.
    cache.clear();

    expect(await countRetained(probes)).toBe(0);
  });

  test("the override cache releases the overrides it evicts", async () => {
    // Its keys and values are strings, which no WeakRef can observe, so this one is weighed
    // rather than counted. The claim is a PLATEAU: thirty-two generations of distinct overrides
    // must retain no more than two, because two generations is all the cache may hold.
    const measureOverrideChurn = async (distinctOverrides: number): Promise<number> => {
      let merge: ReturnType<typeof createLazyOverrideMerge> | null = null;

      const bytes = await measureRetainedBytes(() => {
        merge = createLazyOverrideMerge((_config, ...classnames) => classnames.join(" "), {});

        for (let index = 0; index < distinctOverrides; index++) {
          merge("core", {className: distinctPayload("override", index)});
        }
      });

      // Read after the measurement, so the cache is alive across the collection that weighs it.
      expect(typeof merge).toBe("function");

      return bytes;
    };

    const twoGenerations = await measureOverrideChurn(OVERRIDE_LIMIT * 2);
    const thirtyTwoGenerations = await measureOverrideChurn(OVERRIDE_LIMIT * 32);

    // A cache that stopped caching would plateau at nothing and satisfy the ceiling for the wrong
    // reason, so the baseline is asserted to be a real one.
    expect(twoGenerations).toBeGreaterThan(0);
    expect(thirtyTwoGenerations).toBeLessThan(twoGenerations + PLATEAU_SLACK_BYTES);
  });

  test("a live slots component holds a bounded number of results under prop churn", async () => {
    const row = defineSlots(tv, {
      slots: {root: "flex items-center", label: "truncate"},
      variants: {
        tone: {neutral: {root: "bg-white"}, danger: {root: "bg-red-500"}},
        // A data-driven value the definition does not enumerate resolves to no class, but it is
        // still part of the cache key — which is exactly the traffic a bound exists to survive.
        status: {idle: {label: "text-gray-500"}, busy: {label: "text-blue-500"}},
      },
      defaultVariants: {tone: "neutral", status: "idle"},
    });

    const probes: WeakRef<object>[] = [];

    const churn = (calls: number): void => {
      for (let index = 0; index < calls; index++) {
        // React-shaped: the props the key reads sit beside children, handlers and refs it must
        // not, and the whole result object is what the parent cache keeps.
        const result = row({
          tone: index % 2 === 0 ? "neutral" : "danger",
          status: `status-${index}`,
          children: {payload: distinctPayload("children", index)},
          onPress: () => index,
        });

        result.root();
        result.label();
        probes.push(new WeakRef(result));
      }
    };

    churn(4000);

    const retained = await countRetained(probes);

    // Both halves matter. A component that cached nothing would satisfy the ceiling and quietly
    // stop being memoised at all, so the floor is asserted in the same breath.
    expect(retained).toBeGreaterThan(0);
    expect(retained).toBeLessThanOrEqual(RESULT_CEILING);
  });

  test("the compounds tracker snapshots values, never the objects it walked", async () => {
    const card = defineSlots(tv, {
      slots: {root: "rounded"},
      variants: {tone: {a: {root: "tone-a"}}},
      compoundVariants: [{tone: "a", class: {root: "compound-a"}}],
      defaultVariants: {tone: "a"},
    });

    card({tone: "a"});
    // The first call is the cold invoke; this is the one where the tracker takes its first
    // snapshot, and its output is what proves the compound is being walked at all.
    expect(card({tone: "a"}).root()).toHaveClass(["rounded", "tone-a", "compound-a"]);

    // Installed from a helper so the only strong reference to it dies with that frame.
    const installSuperseded = (): WeakRef<object> => {
      const superseded = {root: "superseded-root"};

      card.compoundVariants[0].class = superseded;

      return new WeakRef(superseded);
    };

    const probe = installSuperseded();

    // Detecting the change is what re-records the snapshot over the map just installed, so this
    // assertion is also what guarantees the probe was walked and recorded.
    expect(card({tone: "a"}).root()).toHaveClass(["rounded", "tone-a", "superseded-root"]);

    // Replaced in the metadata, with no call after it: from here the snapshot is the only thing
    // that could still be holding the superseded map.
    card.compoundVariants[0].class = {root: "current-root"};

    // Two things have to hold for this to come back zero, and a walk keeps both: the snapshot
    // records the object's CONTENTS rather than the object, and the visited set the walk builds is
    // emptied before it returns. Either one holding on makes the tracker a second owner of
    // metadata the consumer has already replaced — and for a component that is mutated and then
    // never called again, "until the next walk" means forever.
    expect(await countRetained([probe])).toBe(0);
  });

  test("extending a live component never writes into it", async () => {
    const parent = defineSlots(tv, {
      slots: {root: "parent-root", label: "parent-label"},
      variants: {tone: {a: {root: "tone-a"}}},
      defaultVariants: {tone: "a"},
    });
    const probes: WeakRef<object>[] = [];

    const extendOnce = (index: number): void => {
      const child = defineSlots(tv, {extend: parent, slots: {root: `child-${index}`}});

      child({tone: "a"}).root();
      probes.push(new WeakRef(child));
    };

    for (let index = 0; index < 300; index++) extendOnce(index);

    // Asked of a sibling built AFTER the churn, so the answer comes from the parent's own
    // definition rather than from any cache. A merge that writes into the parent appends every
    // child's classes to a slot string the parent owns — unbounded growth on the longest-lived
    // object in the tree, invisible to every assertion about a CHILD's classes.
    const sibling = defineSlots(tv, {extend: parent, slots: {root: "sibling-root"}});

    expect(sibling({tone: "a"}).root()).toHaveClass(["parent-root", "sibling-root", "tone-a"]);

    // And the children go the moment they are dropped: `extend` is a link a child holds to its
    // parent, never one the parent holds back.
    expect(await countRetained(probes)).toBeLessThanOrEqual(1);
  });

  test("a factory per merge config keeps at most the newest config alive", async () => {
    const probes: WeakRef<object>[] = [];

    const buildWithConfig = (index: number): void => {
      const twMergeConfig = {
        extend: {classGroups: {[`group-${index}`]: [distinctPayload("class-group", index)]}},
      };
      const configuredTv = createTV({twMergeConfig});
      const button = defineVariants(configuredTv, {
        base: `base-${index} p-2 p-4`,
        variants: {tone: {a: `tone-a-${index}`}},
        defaultVariants: {tone: "a"},
      });

      button({tone: "a"});
      probes.push(new WeakRef(twMergeConfig));
    };

    for (let index = 0; index < 100; index++) buildWithConfig(index);

    // One configured merger is kept, so the newest config is legitimately still reachable. Every
    // earlier one has to go: a theme switch, an HMR reload, or a suite that builds a factory per
    // case would otherwise pin every merger config the process has ever seen.
    expect(await countRetained(probes)).toBeLessThanOrEqual(1);
  });

  test("module state plateaus across an HMR-like create-and-drop loop", async () => {
    const ROUNDS = 4000;
    let reload = 0;

    // A reload hands the module class strings it has never seen, from components that are already
    // gone. Per-component caches die with their component; the module-level merge caches do not,
    // which makes them the only structures here that have to plateau on their own — so every
    // round's classes carry the reload counter, and no pass ever re-warms the previous pass's
    // entries. The tag is fixed-width, so both passes weigh strings of the same size.
    const runRounds = (rounds: number): void => {
      const tag = `r${reload++}`;

      for (let round = 0; round < rounds; round++) {
        const reloaded = defineVariants(tv, {
          base: `${distinctClassName(`${tag}base`, round)} p-2`,
          variants: {tone: {a: `${distinctClassName(`${tag}tone`, round)} p-4`}},
          defaultVariants: {tone: "a"},
        });

        reloaded({tone: "a"});
        reloaded({tone: "a", class: distinctClassName(`${tag}over`, round)});
        // The call-site helper keeps a module-level cache of its own, and this is the only entry
        // point that reaches it.
        cn(distinctClassName(`${tag}call`, round), distinctClassName(`${tag}site`, round));
      }
    };

    // Warmed at the size it is measured at: the merge caches are built lazily and hold two
    // generations, so a smaller warm-up leaves the measured pass paying for the difference.
    await measureRetainedBytes(() => runRounds(ROUNDS));

    const secondReload = await measureRetainedBytes(() => runRounds(ROUNDS));

    // Thousands of never-before-seen class strings, every one of them from a component that no
    // longer exists. A module holding two bounded generations comes out of the second pass no
    // heavier than it went in; one that keeps them all keeps every string it was ever handed.
    expect(secondReload).toBeLessThan(PLATEAU_SLACK_BYTES);
  });
});
