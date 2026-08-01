import {describe, expect, test} from "vitest";

import {tv} from "../index";
import {defineSlots, defineVariants} from "./support/loose.js";
import {gcAvailable, isRetainedAfter} from "./support/reachability.js";

// Retention is invisible to every assertion about class strings, so it needs its own instrument.
// `reachability-harness.test.ts` proves that instrument can report BOTH outcomes; these cases
// use it on the memoisation layer. Run with `pnpm test:leak`.
describe.skipIf(!gcAvailable)("retention", () => {
  test("a dropped component does not stay reachable through module state", async () => {
    const retained = await isRetainedAfter(
      () => {
        const marker = {payload: "x".repeat(8192)};
        const component = defineVariants(tv, {
          base: "base",
          variants: {tone: {a: "text-a"}},
          compoundVariants: [{tone: "a", class: marker}],
          defaultVariants: {tone: "a"},
        });

        // Warm past the cold invoke so every cache and the tracker are live.
        for (let call = 0; call < 4; call++) component({tone: "a"});

        return marker;
      },
      () => undefined,
    );

    expect(retained).toBe(false);
  });

  test("a cached slots result does not retain the caller's props object", async () => {
    const menu = defineSlots(tv, {
      slots: {root: "root"},
      variants: {tone: {a: {root: "tone-a"}, b: {root: "tone-b"}}},
      defaultVariants: {tone: "a"},
    });

    // Warmed on `tone: "b"`, probed on `tone: "a"` — a DIFFERENT key on purpose. Warming and
    // probing the same key made the probe call a cache HIT, which returns before
    // `createSlotsResult` runs and therefore before the capture this test is about ever executes.
    // It passed against a build that held the caller's object outright.
    for (let call = 0; call < 4; call++) menu({tone: "b"});

    const retained = await isRetainedAfter(
      () => ({tone: "a", children: {payload: "x".repeat(8192)}}),
      (props) => {
        menu(props).root();
      },
    );

    // The cache holds the RESULT for the definition's life; holding the caller's object with it
    // would pin whatever else that object carries — in React, children, handlers and refs.
    expect(retained).toBe(false);
  });

  test("even the FIRST slots result does not retain the caller's props object", async () => {
    // The cold invoke skips the cache, so the case above — which warms first — never reaches it.
    // It still hands the consumer a result, and that result still holds whatever the computers
    // were given. In React the first render is the one that matters most: it is where `children`,
    // handlers and refs are freshest and largest.
    let held: unknown;

    const retained = await isRetainedAfter(
      () => ({tone: "a", children: {payload: "x".repeat(8192)}}),
      (props) => {
        const menu = defineSlots(tv, {
          slots: {root: "root"},
          variants: {tone: {a: {root: "tone-a"}}},
          defaultVariants: {tone: "a"},
        });

        // Held past the probe, so the RESULT is what keeps anything alive rather than a local.
        held = menu(props);
      },
    );

    expect(held).toBeDefined();
    expect(retained).toBe(false);
  });

  test("an UNKEYABLE slots call does not retain the caller's props either", async () => {
    // The bypass path returns a result without caching it, which makes it look like the one path
    // where holding the caller's object would be harmless. It is not: the consumer keeps the
    // result, and an object variant value — a reactive box, a store slice — is exactly the shape
    // that both makes a call unkeyable AND rides on a props object carrying everything else.
    const menu = defineSlots(tv, {
      slots: {root: "root"},
      variants: {tone: {a: {root: "tone-a"}}, boxed: {}},
      defaultVariants: {tone: "a"},
    });
    let held: unknown;

    // Warmed, so the bypass is taken because the value cannot be keyed rather than because this
    // is the cold invoke.
    for (let call = 0; call < 3; call++) menu({tone: "a"});

    const retained = await isRetainedAfter(
      () => ({tone: "a", boxed: {}, children: {payload: "x".repeat(8192)}}),
      (props) => {
        held = menu(props);
      },
    );

    expect(held).toBeDefined();
    expect(retained).toBe(false);
  });

  test("a NESTED resolve's accumulator is released too", async () => {
    // The pools are indexed by resolve depth, so depth 1 is not coverage for depth 2: a change
    // that released only the current frame would leave depth 2 holding its values, and nothing
    // ever re-takes that index unless another nested resolve happens.
    const retained = await isRetainedAfter(
      () => ({payload: `inner-${"x".repeat(8192)}`}),
      (marker) => {
        const inner = defineVariants(tv, {
          base: "inner",
          variants: {tone: {a: "inner-a"}},
          compoundVariants: [{tone: "a", class: marker}],
          defaultVariants: {tone: "a"},
        });
        const conditions: Record<string, unknown> = {tone: "a", class: "outer-cv"};

        Object.defineProperty(conditions, "gate", {
          enumerable: true,
          get() {
            inner({tone: "a"});

            return "open";
          },
        });

        const outer = defineVariants(tv, {
          base: "outer",
          variants: {tone: {a: "outer-a"}},
          compoundVariants: [conditions],
          defaultVariants: {tone: "a"},
        });

        for (let call = 0; call < 3; call++) outer({tone: "a", gate: "open"});
      },
    );

    expect(retained).toBe(false);
  });

  test("the OUTER frame is released after a nested resolve returns", async () => {
    // A nested resolve raises the depth and lowers it again, and the outer resolve has to be left
    // holding its OWN accumulators afterwards. If it is not, the outer's release empties the
    // inner's frame instead — which was already empty — and the outer's own values stay in place
    // at module level for the life of the process.
    //
    // The case below is the one that reaches it: the marker is pushed by compound matching, which
    // runs BEFORE variant lookup, and the nested resolve fires from a variant-value getter. So the
    // outer has already filled an accumulator by the time the depth moves under it. The existing
    // nested case triggers from a compound CONDITION, which runs earlier and so cannot see this.
    const retained = await isRetainedAfter(
      () => ({payload: `outer-${"x".repeat(8192)}`}),
      (marker) => {
        const inner = defineVariants(tv, {
          base: "inner",
          variants: {tone: {a: "inner-a"}},
          defaultVariants: {tone: "a"},
        });
        const values: Record<string, unknown> = {};

        Object.defineProperty(values, "a", {
          enumerable: true,
          get() {
            inner({tone: "a"});

            return "outer-a";
          },
        });

        const outer = defineVariants(tv, {
          base: "outer",
          variants: {tone: values},
          compoundVariants: [{tone: "a", class: marker}],
          defaultVariants: {tone: "a"},
        });

        for (let call = 0; call < 3; call++) outer({tone: "a"});
      },
    );

    expect(retained).toBe(false);
  });

  test("the VARIANT accumulator is released, not only the compound ones", async () => {
    // `releaseResolveFrame` empties four accumulators and only two of them were guarded. This one
    // covers `frame.variantClasses`: deleting its clear left every test green, so the last resolve's
    // variant values stayed pinned at module level for the life of the process — values belonging
    // to a component the caller may already have dropped.
    //
    // The marker has to arrive as a VARIANT value rather than a compound class, because the
    // compound paths fill a different accumulator and would pass this vacuously.
    const retained = await isRetainedAfter(
      () => ({payload: `variant-${"x".repeat(8192)}`}),
      (marker) => {
        const button = defineVariants(tv, {
          base: "base",
          variants: {tone: {a: marker}},
          defaultVariants: {tone: "a"},
        });

        for (let call = 0; call < 3; call++) button({tone: "a"});
      },
    );

    expect(retained).toBe(false);
  });

  test("the COMPOUND SLOT accumulator is released, not only the compound variant one", async () => {
    // The fourth accumulator, `frame.compoundSlotClasses`, filled only by `getCompoundSlotClasses`
    // — so the marker arrives through `compoundSlots`, which is the one route to it. The
    // compound-VARIANT accumulator is a different array and its clear is guarded elsewhere.
    const retained = await isRetainedAfter(
      () => ({payload: `compound-slot-${"x".repeat(8192)}`}),
      (marker) => {
        const menu = defineSlots(tv, {
          slots: {root: "root", tail: "tail"},
          variants: {tone: {a: {}}},
          compoundSlots: [{slots: ["tail"], tone: "a", class: marker}],
          defaultVariants: {tone: "a"},
        });

        for (let call = 0; call < 3; call++) {
          const styles = menu({tone: "a"});

          styles.root();
          styles.tail();
        }
      },
    );

    expect(retained).toBe(false);
  });

  test("the accumulator for the LAST slot is released, not just an early one", async () => {
    // Anchoring on the first slot passes vacuously: later slots in the same call re-take the
    // pool and clear it as a side effect. Only the final slot's values are still in place when
    // the call ends, so that is where a missing release actually shows.
    const retained = await isRetainedAfter(
      () => ({payload: `last-${"x".repeat(8192)}`}),
      (marker) => {
        const menu = defineSlots(tv, {
          slots: {first: "first", middle: "middle", last: "last"},
          variants: {tone: {a: {}}},
          compoundVariants: [{tone: "a", class: {last: marker}}],
          defaultVariants: {tone: "a"},
        });

        for (let call = 0; call < 3; call++) {
          const styles = menu({tone: "a"});

          styles.first();
          styles.middle();
          styles.last();
        }
      },
    );

    expect(retained).toBe(false);
  });

  test("a replaced function-valued condition is released", async () => {
    // Conditions compare by identity, so a function has to be distinguishable in the snapshot —
    // but recording the function itself keeps its whole closure alive. For a component that is
    // mutated and then never called again, "until the next walk" means forever.
    const compound: Record<string, unknown> = {handler: () => undefined, class: "cv"};
    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [compound],
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 3; call++) button({tone: "a"});

    const retained = await isRetainedAfter(
      () => {
        const heavy = {payload: `closure-${"x".repeat(8192)}`};

        return Object.assign(() => heavy, {marker: heavy});
      },
      (replacement) => {
        compound.handler = replacement;
        // Recorded by this call...
        button({tone: "a"});
        // ...then replaced with NO further call, which is the shape that pins it: the snapshot
        // still names the old function and nothing will overwrite that slot until the component
        // is resolved again, which may never happen.
        compound.handler = () => undefined;
      },
    );

    expect(retained).toBe(false);
  });

  test("a throw part-way through a walk does not pin what the walk had reached", async () => {
    // The walk builds a set of the objects it has visited, to make cycles terminate. That set is
    // emptied when the walk finishes — but a getter in consumer metadata can throw at any point,
    // and an exception skips anything not in a `finally`. For metadata a getter MINTED, the set
    // is then the only thing referencing it, and it holds until the next ask, which for a
    // component nobody calls again is forever.
    const compound: Record<string, unknown> = {tone: "a", class: "cv"};
    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [compound],
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 3; call++) button({tone: "a"});

    const retained = await isRetainedAfter(
      () => ({payload: `walked-${"x".repeat(8192)}`}),
      (reached) => {
        // Two calls, because the walk stops at the first mismatch: a marker introduced and
        // thrown over in ONE call is never walked into at all, and the case passes vacuously.
        // This call is the one that puts it in the snapshot, so the next walk matches its way
        // PAST it — visiting it — before reaching the getter that throws.
        compound.reached = reached;
        button({tone: "a"});

        Object.defineProperty(compound, "className", {
          configurable: true,
          enumerable: true,
          get() {
            throw new Error("transient");
          },
        });

        expect(() => button({tone: "a"})).toThrow("transient");

        // The consumer drops it, and never calls the component again. Nothing the library holds
        // should keep it alive.
        compound.reached = undefined;
      },
    );

    expect(retained).toBe(false);
  });

  test("many distinct components do not accumulate", async () => {
    const registry = new FinalizationRegistry(() => undefined);
    let survivors = 0;
    const probes: WeakRef<object>[] = [];

    for (let index = 0; index < 200; index++) {
      const marker = {payload: `component-${index}-${"x".repeat(256)}`};
      const component = defineVariants(tv, {
        base: `base-${index}`,
        variants: {tone: {a: `text-a-${index}`}},
        compoundVariants: [{tone: "a", class: marker}],
        defaultVariants: {tone: "a"},
      });

      for (let call = 0; call < 3; call++) component({tone: "a"});

      registry.register(marker, index);
      probes.push(new WeakRef(marker));
    }

    // One collection cycle, then count what a module-level structure is still holding.
    await isRetainedAfter(
      () => ({}),
      () => undefined,
    );

    for (const probe of probes) {
      if (probe.deref() !== undefined) survivors++;
    }

    // A per-component cache is expected; a module-level structure that grows with the NUMBER of
    // components is not. Anything beyond a couple of stragglers is accumulation.
    expect(survivors).toBeLessThanOrEqual(2);
  });
});
