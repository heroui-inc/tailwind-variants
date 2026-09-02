import {describe, expect, test} from "vitest";

import {tv} from "../index";
import {tv as tvLite} from "../lite";
import {defineSlots, type LooseRecord} from "./support/loose.js";

/*
 * How a nullish-or-false compound CONDITION matches a nullish-or-false PROP, for both compound
 * kinds, as one table.
 *
 * This is a characterization test, not a claim that the behaviour is right. 3.2.2 matched a
 * `compoundSlots` condition on exact equality; 3.3.0 routes both kinds through one matcher whose
 * nullish arm treats every nullish-or-false condition as matching every nullish-or-false prop,
 * including a prop that was never passed. Ten of the forty cells below changed, all of them in
 * `compoundSlots`, and it shipped in a minor release with no note — a component that used
 * `onPress: null` to mean "only when explicitly set to null" now applies that class on a call that
 * passes nothing, which is the most common call shape there is.
 *
 * It is pinned rather than reverted on purpose. `compoundVariants` has had the loose semantics
 * since 3.2.2, so unifying the two is defensible as a fix, and which one is intended is the
 * maintainer's call — contribution 102 asks the question. Reverting it here would be a second
 * unannounced behaviour change, which is the thing that report objects to. What was genuinely
 * missing is any test at all: the change was invisible because nothing described the matrix.
 *
 * So: if a future edit moves a cell, this fails and the mover has to say which way it should go.
 */

/** Every condition value whose matching is decided by the nullish arm rather than by equality. */
const CONDITIONS = [
  ["null", null],
  ["undefined", undefined],
  ["false", false],
  ["zero", 0],
  ["empty string", ""],
] as const;

/** What a caller can pass for that key, including not passing it. */
const PROPS: readonly (readonly [string, LooseRecord])[] = [
  ["absent", {}],
  ["null", {flag: null}],
  ["undefined", {flag: undefined}],
  ["false", {flag: false}],
];

/**
 * The table as it behaves today, `true` where the compound applies.
 *
 * `compoundVariants` is the row set that 3.2.2 also produced; `compoundSlots` is the one that
 * changed, and every `true` in its first three rows outside the exact-equality diagonal is a cell
 * 3.2.2 answered `false`.
 */
const EXPECTED: Record<string, Record<string, boolean>> = {
  null: {absent: true, null: true, undefined: true, false: true},
  undefined: {absent: true, null: true, undefined: true, false: true},
  false: {absent: true, null: true, undefined: true, false: true},
  zero: {absent: false, null: false, undefined: false, false: false},
  "empty string": {absent: false, null: false, undefined: false, false: false},
};

describe.each([
  ["tv", tv],
  ["tv/lite", tvLite],
] as const)("%s nullish condition matrix", (_label, createTv) => {
  test("compoundSlots matches the same nullish cells compoundVariants does", () => {
    const actual: string[] = [];
    const expected: string[] = [];

    for (const [conditionName, conditionValue] of CONDITIONS) {
      for (const [propName, props] of PROPS) {
        const withCompoundSlot = defineSlots(createTv, {
          slots: {root: "root"},
          variants: {tone: {a: {root: "tone-a"}}},
          compoundSlots: [{slots: ["root"], flag: conditionValue, class: "cs"}],
          defaultVariants: {tone: "a"},
        });
        const withCompoundVariant = defineSlots(createTv, {
          slots: {root: "root"},
          variants: {tone: {a: {root: "tone-a"}}},
          compoundVariants: [{flag: conditionValue, class: {root: "cv"}}],
          defaultVariants: {tone: "a"},
        });

        const slotApplied = withCompoundSlot(props).root().includes("cs");
        const variantApplied = withCompoundVariant(props).root().includes("cv");
        const cell = `${conditionName} / ${propName}`;

        actual.push(`compoundSlots  ${cell}: ${String(slotApplied)}`);
        actual.push(`compoundVariants ${cell}: ${String(variantApplied)}`);

        const want = EXPECTED[conditionName][propName];

        expected.push(`compoundSlots  ${cell}: ${String(want)}`);
        expected.push(`compoundVariants ${cell}: ${String(want)}`);
      }
    }

    expect(actual).toEqual(expected);
  });

  test("the matrix has cells on both sides, so an all-true table cannot pass it", () => {
    // Capability guard. Every row being `true` would satisfy an assertion that only checked the
    // matching cells, and the `0` / `""` rows are what make the table say something: those are
    // falsy but NOT nullish-or-false by this matcher's rule, so they match nothing here.
    const values = Object.values(EXPECTED).flatMap((row) => Object.values(row));

    expect(values.filter(Boolean).length).toBeGreaterThan(0);
    expect(values.filter((applied) => !applied).length).toBeGreaterThan(0);
  });
});
