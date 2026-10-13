import {describe, expect, test} from "vitest";

import {type CompoundsTracker, createCompoundsTracker} from "../internal/compounds-tracker.js";
import type {CompiledCompoundSlot, CompiledCompoundVariant} from "../internal/types.js";
import {asRecord, type LooseRecord} from "./support/loose.js";

// Driven directly rather than through tv(), for two reasons. Some of what it guarantees is
// invisible from outside — detection that always reports a change disables the cache while
// still producing correct output — and some of it cannot be reached through tv() at all,
// because the compiled compound array is built once and never resized afterwards.
const compound = (source: LooseRecord): CompiledCompoundVariant => ({
  conditionKeys: Object.keys(source).filter((key) => key !== "class" && key !== "className"),
  source,
});

/**
 * Supplies the apply step a tracker takes on every change it reports.
 *
 * Defaulted because most cases here are about DETECTION, and threading an identical no-op through
 * each of them would assert nothing. The cases that ARE about the apply step pass their own.
 */
const trackChanges = (
  compoundVariants: CompiledCompoundVariant[],
  compoundSlots: CompiledCompoundSlot[] = [],
  applyChange: () => void = () => undefined,
): CompoundsTracker => createCompoundsTracker(compoundVariants, compoundSlots, applyChange);

describe("compounds tracker", () => {
  test("reports a change on the first ask, then holds steady", () => {
    const tracker = trackChanges([compound({color: "a", class: "cv"})], []);

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");
    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("reports an in-place value change exactly once", () => {
    const source = {color: "a", class: "cv-old"};
    const tracker = trackChanges([compound(source)], []);

    tracker.takeChange();

    source.class = "cv-new";

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("reports a nested change and a reversal", () => {
    const source: LooseRecord = {color: "a", class: {root: "cv-a"}};
    const tracker = trackChanges([compound(source)], []);

    tracker.takeChange();
    asRecord(source.class).root = "cv-b";

    expect(tracker.takeChange()).toBe("changed");

    asRecord(source.class).root = "cv-a";

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("holds steady with NaN in the metadata", () => {
    // NaN is not equal to itself. Compared with a bare `!==` this reports a change on every
    // ask, so the cache is cleared on every call and silently stops existing — with correct
    // output throughout, which is why nothing above this layer can catch it.
    const tracker = trackChanges([compound({count: Number.NaN, class: "cv"})], []);

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");
    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("reports a change away from NaN", () => {
    // The NaN-tolerant compare must not swallow a real change: `previous !== value` is true here
    // and exactly one side is NaN, so the guard has to admit the mismatch rather than treat any
    // NaN involvement as equality. Getting this wrong hides the change forever.
    const source: LooseRecord = {count: Number.NaN, class: "cv"};
    const tracker = trackChanges([compound(source)], []);

    tracker.takeChange();
    source.count = 5;

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");

    source.count = Number.NaN;

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("a re-entrant ask reports that it cannot tell", () => {
    // The guard's RETURN VALUE is the decision, not just the fact that it returns early. The
    // outer walk is mid-flight, so the tracker knows neither that the metadata changed nor that
    // it did not — and both of the two-state answers are wrong: "unchanged" risks serving output
    // a mutation invalidated, "changed" drops the cache on every call so results never settle.
    // The caller answers a third outcome by resolving fresh and not touching the cache at all.
    const source: LooseRecord = {color: "a", class: "cv"};
    let tracker: ReturnType<typeof createCompoundsTracker> | undefined;
    const reentrantResults: string[] = [];
    let inside = false;

    Object.defineProperty(source, "className", {
      enumerable: true,
      get() {
        if (!inside && tracker) {
          inside = true;

          try {
            reentrantResults.push(tracker.takeChange());
          } finally {
            inside = false;
          }
        }

        return undefined;
      },
    });

    tracker = trackChanges([compound(source)], []);

    tracker.takeChange();
    tracker.takeChange();

    expect(reentrantResults.length).toBeGreaterThan(0);
    expect(reentrantResults.every((result) => result === "indeterminate")).toBe(true);
  });

  test("treats 0 and -0 as unchanged, as resolution does", () => {
    const source = {count: 0, class: "cv"};
    const tracker = trackChanges([compound(source)], []);

    tracker.takeChange();
    source.count = -0;

    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("reports the compound list growing or shrinking", () => {
    // Not reachable through tv() today — the compiled array is built once — so the length
    // check is pinned here instead of being left as an untested branch.
    const compounds = [compound({color: "a", class: "cv-a"})];
    const tracker = trackChanges(compounds, []);

    tracker.takeChange();
    compounds.push(compound({color: "b", class: "cv-b"}));

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");

    compounds.length = 1;

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("separates compounds whose fields would otherwise flatten together", () => {
    // Each compound emits its condition values then its class and className, so two different
    // groupings can produce the identical flat sequence: one compound with two conditions and
    // both class fields set, versus two compounds with no conditions and one field each. The
    // per-compound terminator is the only thing keeping those apart, since the total length
    // matches and every value matches.
    const compounds: CompiledCompoundVariant[] = [
      {conditionKeys: ["a", "b"], source: {a: "P", b: "Q", class: "R", className: "S"}},
    ];
    const tracker = trackChanges(compounds, []);

    tracker.takeChange();

    compounds.length = 0;
    compounds.push(
      {conditionKeys: [], source: {class: "P", className: "Q"}},
      {conditionKeys: [], source: {class: "R", className: "S"}},
    );

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("reports a key disappearing from a class object", () => {
    const source: LooseRecord = {color: "a", class: {root: "cv", title: "cv-title"}};
    const tracker = trackChanges([compound(source)], []);

    tracker.takeChange();

    delete asRecord(source.class).title;

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("metadata past the depth the walk descends is never claimed unchanged", () => {
    // A bound buys termination by ceasing to look, and everything past it stops being watched.
    // The failure that makes silent is the worst one available: a truncated walk is a fixed
    // prefix plus a fixed ending, so it compares equal to ITSELF for ever and the cache goes on
    // serving output the metadata no longer supports.
    //
    // Nested class values are in the public contract and resolution recurses them with no limit
    // at all, so this is reachable with a definition that renders perfectly well. The only honest
    // answer is that the tracker cannot tell — which both resolvers read as "resolve fresh".
    const deep: LooseRecord = {leaf: "cv-old"};
    let node = deep;

    for (let level = 0; level < 300; level++) {
      const next: LooseRecord = {leaf: "cv-old"};

      node.nested = next;
      node = next;
    }

    const tracker = trackChanges([compound({color: "a", class: deep})], []);

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("changed");

    node.leaf = "cv-new";

    expect(tracker.takeChange()).toBe("changed");
  });

  test("survives a cycle that branches, in bounded time", () => {
    // One self-reference revisits a node once per level; TWO revisit it 2^level times, so a
    // depth cap of N is 2^N visits and the walk never returns. Bounding depth is not bounding
    // work — the total number of values visited is what has to be capped.
    const branching: LooseRecord = {root: "cv"};

    branching.first = branching;
    branching.second = branching;

    const tracker = trackChanges([compound({color: "a", class: branching})], []);
    // No clock here. A wall-clock ceiling on a loaded machine fails against correct code, and
    // "did the walk terminate" already has an exact answer: these two calls RETURNING is it. A
    // walk that did not terminate never reaches the assertion at all — the run dies on the
    // suite's own timeout, and says so, rather than reporting a wrong verdict about the code.
    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("survives cyclic metadata", () => {
    const cyclic: LooseRecord = {root: "cv"};

    cyclic.self = cyclic;

    const tracker = trackChanges([compound({color: "a", class: cyclic})], []);

    expect(() => {
      tracker.takeChange();
      tracker.takeChange();
      tracker.takeChange();
    }).not.toThrow();
  });

  test("survives metadata deeper than the walk descends", () => {
    const deep: LooseRecord = {root: "cv"};
    let node = deep;

    for (let level = 0; level < 6000; level++) {
      const next: LooseRecord = {};

      node.nested = next;
      node = next;
    }

    const tracker = trackChanges([compound({color: "a", class: deep})], []);

    expect(() => {
      tracker.takeChange();
      tracker.takeChange();
    }).not.toThrow();
  });

  test("a throw while re-recording leaves the baseline invalid, not falsely matching", () => {
    let armed = false;
    const source: LooseRecord = {color: "a", class: "cv-old"};

    Object.defineProperty(source, "className", {
      enumerable: true,
      get() {
        if (armed) {
          armed = false;

          throw new Error("transient");
        }

        return undefined;
      },
    });

    const tracker = trackChanges([compound(source)], []);

    tracker.takeChange();
    expect(tracker.takeChange()).toBe("unchanged");

    source.class = "cv-new";
    // `class` is read before `className` and mismatches, which settles the verdict and stops the
    // compare walk — so the next read of this getter is the one inside the RE-RECORD walk, which
    // is the one that would leave a half-written snapshot behind.
    armed = true;

    expect(() => tracker.takeChange()).toThrow("transient");

    // The change must still be reported — a half-written snapshot would have swallowed it.
    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("a settled verdict stops the walk reading further consumer getters", () => {
    // Every read runs consumer code, and once a mismatch is found nothing later in the walk can
    // change the answer. Reading on is then a side effect with no purpose — it can throw, mutate,
    // or re-enter, all after the tracker already knows what it will return.
    let reads = 0;
    const source: LooseRecord = {color: "a", class: "cv-old"};

    Object.defineProperty(source, "className", {
      enumerable: true,
      get() {
        reads++;

        return undefined;
      },
    });

    const tracker = trackChanges([compound(source)], []);

    tracker.takeChange();
    expect(tracker.takeChange()).toBe("unchanged");

    const beforeMutation = reads;

    // `color` is walked first, so the verdict is settled before `class` and `className` are
    // reached at all. Exactly one further read happens: the one in the re-record walk.
    source.color = "b";

    expect(tracker.takeChange()).toBe("changed");
    expect(reads).toBe(beforeMutation + 1);
  });

  test("metadata that mints a fresh object on every read terminates, once", () => {
    // The third bound, and the one the other two cannot stand in for. A visited set cannot help
    // when nothing is ever revisited, and the depth cap bounds the STACK rather than the work: a
    // fresh two-way branch at every level is 2^256 nodes below a cap of 256. Only a work ceiling
    // ends this walk, which is why this case is worth the time it costs — it is the only thing
    // standing between a reactive `computed` in a compound and a walk that never returns.
    //
    // "Once" is the other half. Spending the ceiling is expensive, and a definition that spends
    // it will spend it on every call unless the verdict is latched — so the second ask must be
    // answered without walking at all, and both asks must refuse to claim the metadata unchanged.
    const minting = (): LooseRecord => ({
      get left() {
        return minting();
      },
      get right() {
        return minting();
      },
    });
    // `tone` sits AFTER the key that exhausts the budget, so the compound's own key loop has to
    // stop as well — the recursion breaking out of itself is not enough.
    const source: LooseRecord = {color: "a", nested: minting(), tone: "b", class: "cv"};
    let reads = 0;

    Object.defineProperty(source, "watched", {
      enumerable: true,
      get() {
        reads++;

        return "x";
      },
    });

    const tracker = trackChanges([compound(source)], []);

    expect(tracker.takeChange()).toBe("changed");

    const readsAfterFirst = reads;

    expect(tracker.takeChange()).toBe("changed");
    expect(reads).toBe(readsAfterFirst);
  });

  test("a WIDE definition spends the step ceiling without ever reaching the depth cap", () => {
    // The two bounds are separate flags and the depth one is far easier to trip, so a deep case
    // covers both by accident and leaves the step ceiling's report untested. This one is two
    // levels deep and a million wide: only the work ceiling can end it, so only the work
    // ceiling's own flag can produce the verdict below.
    const wide = new Array<string>(1_100_000).fill("cv");
    const tracker = trackChanges([compound({color: "a", class: wide})], []);

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("changed");
  });

  test("an oversized definition is walked once, not once per ask", () => {
    // Spending the ceiling costs a second of real time, and a definition that spends it spends it
    // on EVERY call unless the verdict is latched. Counting reads is the only way to see the
    // difference: the verdict is identical either way, so a class-string assertion cannot tell a
    // latched tracker from one that re-walks a million steps to reach the same answer.
    const wide = new Array<string>(1_100_000).fill("cv");
    const source: LooseRecord = {color: "a", class: wide};
    let reads = 0;

    Object.defineProperty(source, "watched", {
      enumerable: true,
      get() {
        reads++;

        return "x";
      },
    });

    const tracker = trackChanges([compound(source)], []);

    tracker.takeChange();

    const readsAfterFirst = reads;

    tracker.takeChange();
    tracker.takeChange();

    expect(reads).toBe(readsAfterFirst);
  });

  test("a change is not accepted until it has been applied", () => {
    // Detection and the act it triggers are one step. Every part of applying a change runs
    // consumer code — re-deriving key sets enumerates the compound, rebuilding the slot index
    // reads `slots` — so any of it can throw. Accepting on DETECTION would drop the invalidation
    // on the floor: the tracker would answer `unchanged` forever over metadata it knows moved,
    // and the resolver would keep serving results the mutation invalidated.
    let applications = 0;
    let failNext = false;
    const source: LooseRecord = {color: "a", class: "cv-old"};
    const tracker = trackChanges([compound(source)], [], () => {
      applications++;

      if (failNext) {
        failNext = false;

        throw new Error("apply failed");
      }
    });

    expect(tracker.takeChange()).toBe("changed");
    expect(applications).toBe(1);

    source.class = "cv-new";
    failNext = true;

    expect(() => tracker.takeChange()).toThrow("apply failed");

    // Still reported, because it was never applied. The snapshot already matches the new
    // metadata, so only the unaccepted flag can carry this.
    expect(tracker.takeChange()).toBe("changed");
    expect(applications).toBe(3);
    expect(tracker.takeChange()).toBe("unchanged");
    expect(applications).toBe(3);
  });

  test("survives a re-entrant ask from a getter in the metadata", () => {
    // Metadata is consumer-supplied, so any property on it can be a getter — a Vue `reactive()`
    // proxy, a Solid prop, a MobX observable — and a getter can call back into the component
    // that owns this tracker. A re-entrant walk that reset the cursor underneath the outer one
    // would leave a snapshot spliced from two traversals, and that state never converges:
    // every later call reports a change, so the cache is cleared on every call forever.
    const first: LooseRecord = {color: "a", class: "cv-a"};
    const second: LooseRecord = {color: "b", class: "cv-b"};
    let tracker: ReturnType<typeof createCompoundsTracker> | undefined;
    let inside = false;
    let reentries = 0;

    // Re-enters on EVERY walk, not once: a getter on live metadata fires each time the walk
    // reaches it, so the corruption repeats and never settles.
    Object.defineProperty(first, "className", {
      enumerable: true,
      get() {
        if (!inside && tracker) {
          inside = true;
          reentries++;

          try {
            tracker.takeChange();
          } finally {
            inside = false;
          }
        }

        return undefined;
      },
    });

    tracker = trackChanges([compound(first), compound(second)], []);

    tracker.takeChange();
    tracker.takeChange();

    expect(reentries).toBeGreaterThan(1);

    // Settles, rather than reporting a change on every call from here on — which would clear
    // the cache on every call and quietly remove it.
    expect(tracker.takeChange()).toBe("unchanged");
    expect(tracker.takeChange()).toBe("unchanged");

    // And still notices a real change afterwards.
    second.class = "cv-new";

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("reports a nested boundary moving with the value set unchanged", () => {
    // Same values, different shape: without a terminator closing each nested object the two
    // flatten to the same walk.
    const source: LooseRecord = {color: "a", class: {a: {b: "1"}, c: "2"}};
    const tracker = trackChanges([compound(source)], []);

    tracker.takeChange();
    source.class = {a: {b: "1", c: "2"}};

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("reports a key renamed inside a class object", () => {
    // The value is untouched; only the slot it belongs to changes.
    const source: LooseRecord = {color: "a", class: {root: "cv"}};
    const tracker = trackChanges([compound(source)], []);

    tracker.takeChange();
    source.class = {title: "cv"};

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("reports a change nested inside a list of classes", () => {
    // Arrays are a legal class value, so the walk has to descend into them rather than stop at
    // the container. Every container identity is kept and the innermost string is what moves;
    // assigning a fresh array instead is caught by the new container alone, so such a case
    // passes even when the descent is removed.
    const innermost = ["nested-old"];
    const source: LooseRecord = {color: "a", class: {root: ["cv", innermost]}};
    const tracker = trackChanges([compound(source)], []);

    tracker.takeChange();
    innermost[0] = "nested-new";

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");
  });

  test("a throwing getter does not exhaust the depth budget", () => {
    // The walk tracks depth as it descends and unwinds on the way out. A throw skips the
    // unwind, so without a reset at the start of each walk the budget ratchets to the cap and
    // every later walk stops at the first nested value.
    const nested: LooseRecord = {inner: "cv"};
    let throwing = true;

    Object.defineProperty(nested, "boom", {
      enumerable: true,
      get() {
        if (throwing) throw new Error("always");

        return "settled";
      },
    });

    const source: LooseRecord = {color: "a", class: {root: nested}};
    const tracker = trackChanges([compound(source)], []);

    for (let attempt = 0; attempt < 400; attempt++) {
      expect(() => tracker.takeChange()).toThrow("always");
    }

    throwing = false;

    // The budget must be intact: if it had ratcheted to the cap, the walk would stop at the
    // first nested value and never see this change at all.
    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");

    nested.inner = "cv-new";

    expect(tracker.takeChange()).toBe("changed");
  });

  test("a compound slot with no slots list is inert rather than fatal", () => {
    const slotSource: LooseRecord = {color: "a", class: "cs"};
    const tracker = trackChanges([], [compound(slotSource)]);

    expect(() => {
      tracker.takeChange();
      tracker.takeChange();
    }).not.toThrow();

    slotSource.class = "cs-new";

    expect(tracker.takeChange()).toBe("changed");
  });

  test("tracks compound slots alongside compound variants", () => {
    const slotSource: LooseRecord = {slots: ["title"], color: "a", class: "cs-old"};
    const tracker = trackChanges(
      [compound({color: "a", class: "cv"})],
      [{conditionKeys: ["color"], source: slotSource}],
    );

    tracker.takeChange();
    slotSource.class = "cs-new";

    expect(tracker.takeChange()).toBe("changed");
    expect(tracker.takeChange()).toBe("unchanged");

    slotSource.slots = ["title", "subtitle"];

    expect(tracker.takeChange()).toBe("changed");
  });
});
