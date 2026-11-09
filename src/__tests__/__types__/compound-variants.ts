import type {TVCompoundSlots, TVCompoundVariants} from "../../index.js";

import {tv} from "../../index.js";
import {tv as liteTV} from "../../lite.js";

const variants = {
  variant: {solid: ["a b", "c"], flat: ["a b", "c"]},
  color: {primary: "", danger: ""},
  size: {sm: "", md: "", lg: ""},
  isDisabled: {true: "opacity-50"},
};

// Case: array-form class values stay valid alongside every condition form.
tv({
  variants,
  compoundVariants: [
    {variant: "solid", color: "primary", className: ["a-0 b-0", "c-0"]},
    {variant: "flat", size: ["sm", "lg"], className: ["a-1", ["b-1", null, false]]},
    {isDisabled: [false, undefined], class: ["a-2", undefined]},
    {color: ["primary", "danger"], size: "md", class: "a-3"},
  ],
});

// Case: an array condition still checks each listed value against its axis.
tv({
  variants,
  compoundVariants: [
    {
      // @ts-expect-error array conditions reject values absent from the axis
      size: ["sm", "xl"],
      className: ["a", "b"],
    },
  ],
});

// Case: one entry's typo is reported on that entry alone, not on its neighbours.
tv({
  variants,
  compoundVariants: [
    {
      // @ts-expect-error compoundVariants reject a misspelled axis inline
      variannt: "solid",
      color: "primary",
      className: ["a-0 b-0", "c-0"],
    },
    {variant: "flat", color: "primary", className: ["a-1 b-1", "c-1"]},
    {
      variant: "solid",
      // @ts-expect-error only the entry holding the invalid value is reported
      color: "blue",
      className: ["a-2 b-2", "c-2"],
    },
    {variant: "flat", color: "danger", className: ["a-3 b-3", "c-3"]},
  ],
});

// Case: the lite factory shares the per-entry check.
liteTV({
  variants,
  compoundVariants: [
    {
      // @ts-expect-error lite compoundVariants reject a misspelled axis inline
      variannt: "solid",
      className: ["a-0", "b-0"],
    },
    {variant: "flat", color: "primary", className: ["a-1", "b-1"]},
  ],
});

// Case: excess keys are rejected for a mutable array held in a variable.
const mutableExcess = [{variannt: "solid" as const, className: ["a", "b"]}];

tv({
  variants,
  // @ts-expect-error compoundVariants reject unknown axes in a mutable array variable
  compoundVariants: mutableExcess,
});

// Case: excess keys are rejected for a readonly tuple held in a variable.
const tupleExcess = [
  {variant: "flat", className: ["a", "b"]},
  {variannt: "solid", className: ["c", "d"]},
] as const;

tv({
  variants,
  // @ts-expect-error compoundVariants reject unknown axes in a readonly tuple variable
  compoundVariants: tupleExcess,
});

// Case: an excess key on one member of a union element is still rejected.
type CompoundEntry =
  | {variant: "flat"; className: string[]}
  | {variannt: "solid"; className: string[]};

declare const unionExcess: CompoundEntry[];

tv({
  variants,
  // @ts-expect-error each member of a union element is checked on its own
  compoundVariants: unionExcess,
});

// Control: well-formed entries held in variables are accepted in either form.
const mutableValid = [
  {variant: "solid" as const, size: ["sm" as const, "lg" as const], className: ["a", "b"]},
  {variant: "flat" as const, class: "c"},
];
const tupleValid = [
  {variant: "solid", size: ["sm", "lg"], className: ["a", "b"]},
  {isDisabled: true, class: "c"},
] as const;

tv({variants, compoundVariants: mutableValid});
tv({variants, compoundVariants: tupleValid});

// Case: array and slot-map class forms stay valid per slot; unknown slots do not.
tv({
  slots: {icon: "", label: ""},
  variants: {color: {primary: "", danger: ""}},
  compoundVariants: [
    {color: "primary", class: {base: ["a b", "c"], icon: ["d", null]}},
    {color: "danger", className: ["e", "f"]},
    {
      color: ["primary", "danger"],
      // @ts-expect-error compoundVariants reject unknown slots next to array values
      className: {label: ["g", "h"], testKey: ["i"]},
    },
  ],
});

// Case: arrays built from spreads and conditionals stay valid.
const sharedEntries = [{variant: "solid" as const, className: ["a", "b"]}];
const sharedClasses = ["a", "b"];
const sharedSizes: Array<"sm" | "lg"> = ["sm"];

declare const flag: boolean;

tv({variants, compoundVariants: []});
tv({variants, compoundVariants: [...sharedEntries, {variant: "flat", className: ["c", "d"]}]});
tv({variants, compoundVariants: [{variant: "flat", class: "c"}, ...sharedEntries]});
tv({variants, compoundVariants: [...(flag ? sharedEntries : []), {color: "primary", class: "c"}]});
tv({variants, compoundVariants: flag ? [{variant: "flat", class: "c"}] : []});
tv({
  variants,
  compoundVariants: [
    {variant: "flat", size: [...sharedSizes, "lg"], className: [...sharedClasses, "z"]},
  ],
});

// Case: compoundSlots accepts readonly condition and slot lists.
const slotConditions = [{slots: ["base", "icon"], size: ["sm", "lg"], className: "x"}] as const;

tv({
  slots: {icon: "", label: ""},
  variants: {size: {sm: "", lg: ""}},
  compoundSlots: slotConditions,
});

// Case: unions of arrays from `??`, `||`, a ternary, or a union type stay valid.
declare const maybeEntries: Array<{variant: "solid"; class: string}> | undefined;
declare const unionEntries:
  | Array<{variant: "solid"; class: string}>
  | Array<{color: "primary"; class: string}>;

tv({variants, compoundVariants: maybeEntries ?? [{variant: "flat", class: "c"}]});
tv({variants, compoundVariants: maybeEntries || [{variant: "flat", class: "c"}]});
tv({variants, compoundVariants: flag ? sharedEntries : [{variant: "flat", class: "c"}]});
tv({variants, compoundVariants: unionEntries});

tv({
  variants,
  // @ts-expect-error entries inside a union of arrays are still checked
  compoundVariants: maybeEntries ?? [{variannt: "flat", class: "c"}],
});

// Case: a spread of `any[]` is accepted.
declare const anyEntries: any[];

tv({variants, compoundVariants: anyEntries});
tv({variants, compoundVariants: [...anyEntries, {variant: "flat", class: "c"}]});

// Case: a typo next to a spread is rejected; before the spread only on its own entry.
tv({
  variants,
  compoundVariants: [
    {variant: "flat", class: "a"},
    {
      // @ts-expect-error only the misspelled entry is reported
      variannt: "flat",
      class: "b",
    },
    ...sharedEntries,
  ],
});
tv({
  variants,
  // @ts-expect-error a misspelled axis after a spread is rejected
  compoundVariants: [...sharedEntries, {variannt: "flat", class: "c"}],
});

// Case: readonly condition lists are accepted inline and from variables.
const readonlyEntries = [{variant: "flat", size: ["sm", "lg"], class: "c"}] as const;

tv({variants, compoundVariants: [{variant: "flat", size: ["sm", "lg"], class: "c"}] as const});
tv({variants, compoundVariants: readonlyEntries});

// Case: the exported compound types stay mutable.
type SizeAxis = {size: {sm: ""; lg: ""}};

declare const slotList: TVCompoundSlots<SizeAxis, {icon: ""}, undefined>;
declare const variantList: TVCompoundVariants<SizeAxis, undefined, undefined, undefined>;

slotList.push({slots: ["icon"], size: ["sm"], class: "x"});
slotList[0]?.slots.push("icon");
variantList.push({size: ["sm"], class: "x"});

// Case: an unknown key is rejected even when its value is `undefined`.
const undefinedKey = [
  {variant: "flat" as const, class: "a"},
  {variannt: undefined, class: "b"},
];

tv({
  variants,
  // @ts-expect-error unknown keys are rejected whatever their value
  compoundVariants: undefinedKey,
});

// Case: an exported compound list passes back into a recipe without slots.
declare const exportedList: TVCompoundVariants<typeof variants, undefined, undefined, undefined>;

tv({variants, compoundVariants: exportedList});
