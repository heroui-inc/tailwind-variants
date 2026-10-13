import {describe, expect, test} from "vitest";

import {tv} from "../index";
import {tv as tvLite} from "../lite";
import {defineSlots, defineVariants, type LooseRecord, type LooseSlots} from "./support/loose.js";

const reentrantValue = (value: string, resolve: () => unknown): LooseRecord => {
  const values: LooseRecord = {};

  Object.defineProperty(values, "on", {
    enumerable: true,
    get() {
      resolve();

      return value;
    },
  });

  return values;
};

describe.each([
  ["tv", tv],
  ["tv/lite", tvLite],
] as const)("%s re-entrant resolution", (_label, createTv) => {
  test("a nested resolve does not steal the outer component's variant classes", () => {
    const inner = defineVariants(createTv, {
      base: "inner-base",
      variants: {tone: {x: "inner-x", y: "inner-y"}},
      defaultVariants: {tone: "x"},
    });
    const outer = defineVariants(createTv, {
      base: "outer-base",
      variants: {
        first: {on: "first-on"},
        middle: reentrantValue("middle-on", () => inner({tone: "y"})),
        last: {on: "last-on"},
      },
      defaultVariants: {first: "on", middle: "on", last: "on"},
    });

    // `first-on` is pushed before the nested resolve runs and `last-on` after it, so a shared
    // accumulator loses the first and keeps the second — and the inner component's own class
    // appears on the outer one.
    expect(outer({})).toHaveClass(["outer-base", "first-on", "middle-on", "last-on"]);
  });

  test("a nested resolve does not steal the outer component's compound classes", () => {
    const inner = defineVariants(createTv, {
      base: "inner-base",
      variants: {tone: {x: "inner-x"}},
      compoundVariants: [{tone: "x", class: "inner-cv"}],
      defaultVariants: {tone: "x"},
    });
    // The getter sits on the compound's CONDITION value, so it fires while `matchesConditions`
    // is reading it — that is, part-way through assembling the outer component's compound
    // classes, after the first has been pushed and before the last is.
    const middle: LooseRecord = {tone: "a", class: "outer-cv-middle"};

    Object.defineProperty(middle, "gate", {
      enumerable: true,
      get() {
        inner({});

        return "open";
      },
    });

    const outer = defineVariants(createTv, {
      base: "outer-base",
      variants: {tone: {a: "tone-a"}},
      compoundVariants: [
        {tone: "a", class: "outer-cv-first"},
        middle,
        {tone: "a", class: "outer-cv-last"},
      ],
      defaultVariants: {tone: "a"},
    });

    expect(outer({gate: "open"})).toHaveClass([
      "outer-base",
      "tone-a",
      "outer-cv-first",
      "outer-cv-middle",
      "outer-cv-last",
    ]);
  });

  test("a mutation made while the cache key is being built lands on that same call", () => {
    // Building the key reads the caller's props, so a getter there runs BEFORE the cache is
    // consulted. If change detection has already accepted the old metadata by then, this call
    // is served from an entry computed under metadata that no longer exists.
    const compound: LooseRecord = {tone: "red", class: {root: "cv-old"}};
    const styles = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {tone: {red: {root: "tone-red"}}},
      compoundVariants: [compound],
    });

    for (let warm = 0; warm < 3; warm++) styles({tone: "red"}).root();

    const mutatingProps: LooseRecord = {};

    Object.defineProperty(mutatingProps, "tone", {
      enumerable: true,
      get() {
        compound.class = {root: "cv-new"};

        return "red";
      },
    });

    expect(styles(mutatingProps).root()).toHaveClass(["root", "tone-red", "cv-new"]);
  });

  test("a self-re-entrant metadata getter does not destroy result identity", () => {
    // Re-entry means the tracker cannot say whether the metadata changed, so it must not claim
    // it DID: treating "cannot tell" as "changed" clears the cache on every call, and a slots
    // result with a fresh identity every render defeats downstream memoisation.
    const compound: LooseRecord = {tone: "red", class: {root: "cv"}};
    let styles: LooseSlots | undefined;
    let inside = false;

    Object.defineProperty(compound, "className", {
      enumerable: true,
      get() {
        if (!inside && styles) {
          inside = true;

          try {
            styles({tone: "red"});
          } finally {
            inside = false;
          }
        }

        return undefined;
      },
    });

    styles = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {tone: {red: {root: "tone-red"}}},
      compoundVariants: [compound],
    });

    for (let warm = 0; warm < 3; warm++) styles({tone: "red"});

    expect(styles({tone: "red"})).toBe(styles({tone: "red"}));
    expect(styles({tone: "red"}).root()).toHaveClass(["root", "tone-red", "cv"]);
  });

  test("a nested resolve does not steal an outer slot's classes", () => {
    const inner = defineSlots(createTv, {
      slots: {root: "inner-root"},
      variants: {tone: {x: {root: "inner-x"}}},
      defaultVariants: {tone: "x"},
    });
    const outer = defineSlots(createTv, {
      slots: {root: "outer-root"},
      variants: {
        first: {on: {root: "first-on"}},
        middle: reentrantValue("middle-on", () => inner({}).root()),
        last: {on: {root: "last-on"}},
      },
      defaultVariants: {first: "on", middle: "on", last: "on"},
    });

    expect(outer({}).root()).toHaveClass(["outer-root", "first-on", "last-on"]);
  });

  test("a nested resolve that invalidates mid-compute is not overwritten by the outer call", () => {
    // Resolving runs consumer code, and consumer code can mutate metadata and re-enter. When it
    // does, the INNER call runs the whole cycle correctly — it detects the change, clears the
    // cache and stores the right answer. The outer call is still holding classes it collected
    // BEFORE the mutation, so writing them lands a stale value on top of the correct one. That is
    // permanent, not transient: the change has been ACCEPTED, so no later call reports it again.
    //
    // The two compounds are ordered so the mutation lands on one the outer call has ALREADY
    // collected. Classes are read live, so mutating a compound the outer has not reached yet
    // would simply be picked up — it is the part of the resolve already behind us that goes stale.
    const first: LooseRecord = {class: "first-old"};
    let reads = 0;
    let armAtRead = Number.POSITIVE_INFINITY;
    const second: LooseRecord = {
      get class() {
        reads++;

        if (reads === armAtRead) {
          first.class = "first-new";
          button({tone: "d"});
        }

        return "second";
      },
    };
    const button = defineVariants(createTv, {
      base: "root",
      variants: {tone: {a: "v-a", b: "v-b", c: "v-c", d: "v-d"}},
      compoundVariants: [first, second],
    });

    // Warmed past the cold invoke, which skips the cache and so has nothing to overwrite.
    for (let call = 0; call < 3; call++) button({tone: "a"});

    // Calibrated rather than hardcoded. Change detection reads this getter too, and a mutation
    // made THERE is seen by the walk in progress — a different case, already covered. The read
    // that matters is the last of a cache MISS, which is the one inside resolution, after the
    // compound before it has already been collected.
    reads = 0;
    button({tone: "b"});

    const readsPerMiss = reads;

    reads = 0;
    armAtRead = readsPerMiss;

    button({tone: "c"});

    expect(button({tone: "c"})).toHaveClass(["root", "v-c", "first-new", "second"]);
    expect(button({tone: "d"})).toHaveClass(["root", "v-d", "first-new", "second"]);
  });

  test("the same holds on the slots path, whose cache holds a whole result", () => {
    // The two resolvers keep separate caches and separate detection state, so the variants case
    // above is not coverage for this one. Here the entry is the whole result object rather than a
    // string, which makes a superseded write worse: every slot on it is stale at once.
    const first: LooseRecord = {class: {root: "first-old"}};
    let reads = 0;
    let armAtRead = Number.POSITIVE_INFINITY;
    const second: LooseRecord = {
      get class() {
        reads++;

        if (reads === armAtRead) {
          first.class = {root: "first-new"};
          menu({tone: "d"});
        }

        return {root: "second"};
      },
    };
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {tone: {a: {root: "v-a"}, b: {root: "v-b"}, c: {root: "v-c"}, d: {root: "v-d"}}},
      compoundVariants: [first, second],
    });

    for (let call = 0; call < 3; call++) menu({tone: "a"}).root();

    reads = 0;
    menu({tone: "b"}).root();

    const readsPerMiss = reads;

    reads = 0;
    armAtRead = readsPerMiss;

    menu({tone: "c"}).root();

    expect(menu({tone: "c"}).root()).toHaveClass(["root", "v-c", "first-new", "second"]);
    expect(menu({tone: "d"}).root()).toHaveClass(["root", "v-d", "first-new", "second"]);
  });

  test("a component re-entered while it is APPLYING a change resolves rather than deadlocks", () => {
    // Applying a change reads `slots` to rebuild the per-slot index, and that read runs consumer
    // code — so the re-entrancy point is not only the walk. The inner call finds the walk still in
    // flight, is told `indeterminate`, and resolves fresh against the index as it stands. What it
    // must NOT do is recurse into the walk, cache a result built from a half-rebuilt index, or
    // leave the outer call without its own change applied.
    let inner = "";
    let reads = 0;
    let reenterAtRead = Number.POSITIVE_INFINITY;
    const compound: LooseRecord = {color: "a", class: "cs-old"};

    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {root: "text-a"}}},
      compoundSlots: [compound],
      defaultVariants: {color: "a"},
    });

    Object.defineProperty(compound, "slots", {
      enumerable: true,
      get() {
        reads++;

        if (reads === reenterAtRead) inner = menu({color: "a"}).root();

        return ["root"];
      },
    });

    for (let call = 0; call < 3; call++) menu({color: "a"}).root();

    // Calibrated rather than hardcoded: how many times a change cycle reads `slots` is an
    // implementation detail, but the LAST read of one is always the index rebuild — the read that
    // happens after detection has recorded the change and before it has been accepted.
    const beforeCalibration = reads;

    compound.class = "cs-mid";
    menu({color: "a"}).root();

    const readsPerChange = reads - beforeCalibration;

    compound.class = "cs-new";
    reenterAtRead = reads + readsPerChange;

    // The outer call applies its own change whatever the inner one did.
    expect(menu({color: "a"}).root()).toHaveClass(["root", "text-a", "cs-new"]);

    // And the inner call saw the CURRENT metadata. Being told `indeterminate` is what forces
    // that: it resolves fresh instead of taking the entry the outer call has not cleared yet,
    // which still holds the pre-mutation string.
    expect(inner).toHaveClass(["root", "text-a", "cs-new"]);

    reenterAtRead = Number.POSITIVE_INFINITY;

    // Still usable — no latch left held, nothing half-applied.
    expect(menu({color: "a"}).root()).toHaveClass(["root", "text-a", "cs-new"]);
  });
});
