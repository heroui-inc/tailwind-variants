import {describe, expect, test} from "vitest";

import {tv} from "../index";
import {defineSlots, defineVariants, readSlot} from "./support/loose.js";

/*
 * The performance contract, asserted as COUNTS and SHAPES rather than durations.
 *
 * No case asserts a duration. A wall-clock ceiling on a shared machine fails against correct code
 * and passes against broken code on a quiet one — it measures the machine, not the library. What
 * these count instead has an exact answer: how many times did the caller's getter run, what
 * prototype does the result carry. A regression changes those by construction, on any hardware.
 *
 * Every case here has been watched to FAIL with its optimization removed. That is the whole bar,
 * because a caching layer produces correct output whether or not it works: a test that names a fast
 * path and measures something else passes either way and is worse than no test, since it reads as
 * cover.
 *
 * Four optimizations in this file's neighbourhood are DELIBERATELY not tested here, because nothing
 * a consumer can reach distinguishes them from their own absence. They belong to a benchmark, and a
 * unit test claiming to guard them would be asserting nothing:
 *
 * - The L1 single-entry memo on either resolver. It short-circuits to the value the keyed cache
 *   below it would have returned, and returns the same object identity, having run no consumer code
 *   in between. Removing both leaves every returned string, every result-object identity and every
 *   consumer getter count byte-identical.
 * - The `hasCompounds` gate on CHANGE DETECTION. A tracker over zero compounds reads nothing from
 *   consumer metadata, so ungating it costs reads nobody can count and flips one verdict on one
 *   call, at a point where no cache entry exists to be invalidated.
 * - The guarded accumulator clear in `releaseResolveFrame`. Truncating an already-empty array and
 *   skipping the truncation leave the same empty array. It is identical by construction.
 * - Restricting `defineProperty` to the one slot name that needs it. The __proto__ case below
 *   guards the correctness half of that guard; its cost half is unobservable, and says so there.
 */

/** A record whose reads are counted, for asserting a key is NEVER read rather than read N times. */
const countingRecord = (entries: Record<string, unknown>) => {
  const record: Record<string, unknown> = {};
  const counts: Record<string, number> = {};

  for (const [key, value] of Object.entries(entries)) {
    counts[key] = 0;
    Object.defineProperty(record, key, {
      configurable: true,
      enumerable: true,
      get() {
        counts[key] += 1;

        return value;
      },
    });
  }

  return {record, reads: (key: string): number => counts[key]};
};

/** A props object whose single dependency prop is a counted getter over a settable value. */
const countingProps = (key: string) => {
  const state = {value: "a" as unknown, reads: 0};
  const props: Record<string, unknown> = {};

  Object.defineProperty(props, key, {
    configurable: true,
    enumerable: true,
    get() {
      state.reads += 1;

      return state.value;
    },
  });

  return {
    props,
    set: (value: unknown): void => {
      state.value = value;
    },
    reset: (): void => {
      state.reads = 0;
    },
    reads: (): number => state.reads,
  };
};

describe("performance contract", () => {
  test("a variants call reads each dependency prop once, on a miss, on a keyed hit and on a repeat", () => {
    // Reading twice is a correctness defect before it is a cost: a prop is under no obligation to
    // answer the same way each time, so building the KEY from one read and the CLASSES from another
    // files one call's output under another call's key, for the life of the component. Counting the
    // reads is the only way to see it — both builds produce correct-looking output.
    //
    // All three cache regimes, because measuring only repeats measures the L1 instead: a repeat
    // returns before the key is ever built, so a second read added below that point never runs on
    // the one shape a naive test exercises.
    const tone = countingProps("tone");
    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a", b: "text-b"}},
      defaultVariants: {tone: "a"},
    });

    // Past the cold invoke, and with both "a" and "b" resolved into the keyed cache.
    button(tone.props);
    tone.set("b");
    button(tone.props);
    tone.set("a");
    button(tone.props);

    // A repeat of the last call: answerable without building a key at all.
    tone.reset();
    button(tone.props);
    expect(tone.reads()).toBe(1);

    // An alternation between two cached values: the key is built, the Map answers.
    for (const value of ["b", "a", "b", "a"]) {
      tone.set(value);
      tone.reset();
      button(tone.props);
      expect(tone.reads()).toBe(1);
    }

    // Values never seen before: the key is built AND the classes are resolved, both from the one
    // read. This is the regime a second read is most tempting in and least visible in.
    for (let index = 0; index < 5; index++) {
      tone.set(`fresh-${index}`);
      tone.reset();
      button(tone.props);
      expect(tone.reads()).toBe(1);
    }
  });

  test("a slots parent call reads each dependency prop once, on a miss, on a keyed hit and on a repeat", () => {
    // The same contract on the other resolver. Scoped to the PARENT call: a slot function is handed
    // the caller's own object deliberately, and reads a prop on it twice — once to decide whether
    // any variant is overridden, once to resolve it — which is a documented trade, not a defect.
    const tone = countingProps("tone");
    const menu = defineSlots(tv, {
      slots: {base: "menu", label: "label"},
      variants: {tone: {a: {base: "tone-a"}, b: {base: "tone-b"}}},
      defaultVariants: {tone: "a"},
    });

    menu(tone.props);
    tone.set("b");
    menu(tone.props);
    tone.set("a");
    menu(tone.props);

    tone.reset();
    menu(tone.props);
    expect(tone.reads()).toBe(1);

    for (const value of ["b", "a", "b", "a"]) {
      tone.set(value);
      tone.reset();
      menu(tone.props);
      expect(tone.reads()).toBe(1);
    }

    for (let index = 0; index < 5; index++) {
      tone.set(`fresh-${index}`);
      tone.reset();
      menu(tone.props);
      expect(tone.reads()).toBe(1);
    }
  });

  test("a definition with no compounds never assembles the props a compound would be matched against", () => {
    // Assembling that record walks `defaultVariants` and the caller's props whole. With no compound
    // to match, every class it could produce is empty, so the walk is pure cost — and it is the cost
    // the components that declare no compounds at all would otherwise pay on every uncached call.
    //
    // Observable as an exact ZERO rather than a count: a `defaultVariants` key that is not a variant
    // key and not a compound condition is not a dependency, so nothing on the resolve path reads it
    // — except the assembly, which copies every key it can enumerate.
    const slotsDefaults = countingRecord({tone: "a", unrelated: "x"});
    const menu = defineSlots(tv, {
      slots: {base: "menu", label: "label"},
      variants: {tone: {a: {base: "tone-a"}, b: {base: "tone-b"}}},
      defaultVariants: slotsDefaults.record,
    });

    for (const value of ["a", "b", "a", "b"]) {
      const parts = menu({tone: value});

      readSlot(parts, "base")();
      readSlot(parts, "label")({tone: "b"});
    }

    expect(slotsDefaults.reads("unrelated")).toBe(0);

    // The variants resolver gates the same assembly on the same emptiness.
    const variantsDefaults = countingRecord({tone: "a", unrelated: "x"});
    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a", b: "text-b"}},
      defaultVariants: variantsDefaults.record,
    });

    for (const value of ["a", "b", "a", "b"]) button({tone: value});

    expect(variantsDefaults.reads("unrelated")).toBe(0);

    // The same definition with one compound added reads that key, which is what makes the two zeros
    // above evidence: the instrument is live, and the gate is what silences it. Without this a
    // counter wired to a key nothing ever reads would report zero for ever and pass either way.
    const compoundDefaults = countingRecord({tone: "a", unrelated: "x"});
    const withCompound = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a", b: "text-b"}},
      compoundVariants: [{tone: "a", class: "cv"}],
      defaultVariants: compoundDefaults.record,
    });

    for (const value of ["a", "b", "a", "b"]) withCompound({tone: value});

    expect(compoundDefaults.reads("unrelated")).toBeGreaterThan(0);
  });

  test("a slot named __proto__ is an own property and does not re-parent the result", () => {
    // `result[key] = value` runs the INHERITED setter for this one name: nothing is stored, and the
    // result is re-parented onto the slot function. The slot then vanishes from `Object.keys`, and
    // the next slot whose name collides with a function's own read-only members — `name`, `length`
    // — fails to assign, which in a module is a throw.
    //
    // This guards the guard's CORRECTNESS half only. That the other slots are assigned rather than
    // defined is the cost half, and it is not observable: `defineProperty` with a plain
    // configurable/enumerable/writable data descriptor produces a property indistinguishable from
    // an assignment, so applying it to every slot — the regression this shape was written after —
    // changes nothing a consumer can read.
    const menu = defineSlots(tv, {
      slots: {["__proto__"]: "proto-slot", base: "base", name: "name-slot", length: "length-slot"},
    });

    const parts = menu({});

    expect(Object.getPrototypeOf(parts)).toBe(Object.prototype);
    expect(Object.keys(parts).sort()).toEqual(["__proto__", "base", "length", "name"]);
    expect(Object.getOwnPropertyDescriptor(parts, "__proto__")).toMatchObject({
      configurable: true,
      enumerable: true,
      writable: true,
    });
    expect(readSlot(parts, "__proto__")()).toBe("proto-slot");
    expect(readSlot(parts, "name")()).toBe("name-slot");
    expect(readSlot(parts, "length")()).toBe("length-slot");
  });
});
