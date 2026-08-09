import type {VariantProps} from "../../index.js";
import type {Assert, IsEqual as Equals} from "./test-utils.js";

import {tv} from "../../index.js";

const focusable = tv({
  variants: {
    isFocusVisible: {true: "ring-2", false: ""},
  },
});
const interactive = tv({
  variants: {
    isDisabled: {true: "opacity-50", false: ""},
  },
});

const sizedSlots = tv({
  slots: {
    base: "slot-base",
    icon: "slot-icon",
  },
  variants: {
    size: {sm: {}, lg: {}},
  },
});

// Case: an axis renamed from color to variant must error in compoundVariants.
tv({
  extend: [focusable, interactive],
  variants: {
    size: {sm: "", md: "", lg: ""},
    variant: {primary: "", danger: "", ghost: ""},
  },
  compoundVariants: [
    {
      // @ts-expect-error compoundVariants reject axes absent from variants/extend
      color: "primary",
      isDisabled: true,
      class: "x",
    },
  ],
});

// Case: Soft Exact still rejects when compoundVariants is held in a variable.
const badCompoundVariants = [{color: "primary" as const, class: "x"}];

tv({
  variants: {size: {sm: "", lg: ""}},
  // @ts-expect-error compoundVariants reject unknown axes via variables
  compoundVariants: badCompoundVariants,
});

// Case: an axis renamed from color to variant must error in defaultVariants.
tv({
  extend: [focusable, interactive],
  variants: {
    size: {sm: "", md: "", lg: ""},
    variant: {primary: "", danger: "", ghost: ""},
  },
  defaultVariants: {
    size: "md",
    // @ts-expect-error defaultVariants reject axes absent from variants/extend
    color: "primary",
    isDisabled: false,
  },
});

// Case: Soft Exact still rejects when defaultVariants is held in a variable.
const badDefaults = {size: "sm" as const, color: "primary" as const};

// @ts-expect-error defaultVariants reject unknown axes via variables
tv({
  variants: {size: {sm: "", lg: ""}},
  defaultVariants: badDefaults,
});

// Control: valid renamed axis typechecks.
tv({
  extend: [focusable, interactive],
  variants: {
    size: {sm: "", md: "", lg: ""},
    variant: {primary: "", danger: "", ghost: ""},
  },
  compoundVariants: [{variant: "primary", isDisabled: true, class: "x"}],
  defaultVariants: {size: "md", variant: "primary", isDisabled: false},
});

// Case: single-parent compoundSlots may target parent slots and axes.
tv({
  extend: sizedSlots,
  compoundSlots: [{slots: ["icon"], size: "sm", class: "x"}],
});

tv({
  extend: sizedSlots,
  slots: {label: "child-label"},
  compoundSlots: [{slots: ["icon", "label"], size: "lg", class: "x"}],
});

const unknownSlotCompound = {
  extend: sizedSlots,
  compoundSlots: [{slots: ["footer" as const], size: "sm" as const, class: "x"}],
};
// @ts-expect-error single-parent compoundSlots still reject unknown slots
tv(unknownSlotCompound);

// ---------------------------------------------------------------------------
// Slot-shaped class values may only name declared slots
// ---------------------------------------------------------------------------

// Case: an unknown slot in a variant option value errors on that key.
tv({
  base: "inline-flex",
  slots: {icon: "", label: ""},
  variants: {
    color: {
      danger: "bg-red-500",
      // @ts-expect-error variants reject slots absent from slots/extend
      primary: {base: "bg-blue-500", label: "text-white", testKey: "..."},
    },
  },
});

// Case: an unknown slot in compoundVariants class/className errors on that key.
tv({
  base: "inline-flex",
  slots: {icon: "", label: ""},
  variants: {color: {primary: "", danger: ""}},
  compoundVariants: [
    {
      color: "primary",
      // @ts-expect-error compoundVariants reject slots absent from slots/extend
      className: {base: "bg-blue-500", label: "text-white", testKey: "..."},
    },
  ],
});

// Case: Soft Exact still rejects when the slot map is held in a variable.
const badSlotClasses = {base: "bg-blue-500", testKey: "..."};

tv({
  slots: {icon: "", label: ""},
  // @ts-expect-error variants reject unknown slots via variables
  variants: {color: {primary: badSlotClasses}},
});

// Case: parent slots from extend are accepted; unknown ones are not.
tv({
  extend: sizedSlots,
  slots: {label: ""},
  variants: {
    tone: {
      // icon comes from the parent, label from this recipe, base is implicit.
      solid: {base: "b", icon: "i", label: "l"},
      // @ts-expect-error variants reject slots absent from slots/extend
      soft: {icon: "i", testKey: "..."},
    },
  },
});

// Case: without slots an object class value is joined clsx-style at runtime,
// so every key is rejected rather than read as a slot map.
tv({
  base: "inline-flex",
  // @ts-expect-error slotless recipes reject object class values
  variants: {color: {primary: {base: "bg-blue-500"}}},
});

// Control: strings, arrays and falsy class values pass through untouched.
tv({
  base: "inline-flex",
  slots: {icon: "", label: ""},
  variants: {
    color: {
      danger: ["bg-red-500", false && "unused"],
      primary: {base: "bg-blue-500", icon: ["size-4", null], label: undefined},
    },
  },
  compoundVariants: [{color: "primary", class: {base: "ring-2"}}],
});

// Case: parent-axis array conditions are accepted in compoundVariants.
tv({
  extend: sizedSlots,
  compoundVariants: [{size: ["sm", "lg"], class: "combo"}],
});

// Case: entries may mix `class` and `className` in one compoundVariants array.
// Mixing widens the element type to a union, and `keyof` a union keeps only the
// common keys — both `class` and `className`, since each entry carries the other
// as `never`. `ExactSlotClassProp` must map them optionally or this valid array
// is rejected for "missing" the sibling key.
tv({
  slots: {icon: "", label: ""},
  variants: {color: {primary: "", danger: ""}},
  compoundVariants: [
    {color: "primary", class: "plain"},
    {color: "danger", class: ["a", null, false]},
    {color: "primary", className: {icon: "i", base: "b"}},
  ],
});

// Case: an object nested inside an array class value is a slot-map typo, not a
// slot map. `joinClassValue` would join it clsx-style and emit the *key* as a
// class ("a icon"), so it is rejected rather than silently mis-resolved.
tv({
  slots: {icon: "", label: ""},
  // @ts-expect-error object class values are not valid inside an array
  variants: {color: {primary: ["a", {icon: "x"}]}},
});

// Case: a generic wrapper around tv() must keep compiling while `S` is still an
// unresolved type parameter. The slot-name suggestion shape in the `variants`
// position must therefore never be a conditional on `S` (a deferred conditional
// makes every option value unassignable here). See `SuggestSlotClass`.
function genericSlotWrapper<S extends Record<string, string>>(slots: S) {
  return tv({
    slots,
    variants: {size: {sm: "text-sm", lg: "text-lg"}},
  });
}

void genericSlotWrapper({icon: "size-4"});

function genericSlotWrapperWithExtend<S extends Record<string, string>>(slots: S) {
  return tv({
    extend: sizedSlots,
    slots,
    variants: {tone: {solid: "font-bold"}},
  });
}

void genericSlotWrapperWithExtend({label: "text-xs"});

// Case: Button-shaped VariantProps stay exact after multi-extend.
const focusRing = tv({
  base: "outline-none focus-visible:ring-2",
});
const pressable = tv({
  variants: {
    isDisabled: {true: "opacity-50", false: "active:scale-95"},
  },
  defaultVariants: {isDisabled: false},
});
const button = tv({
  extend: [focusRing, pressable],
  base: "inline-flex",
  variants: {
    size: {sm: "text-sm", md: "text-base", lg: "text-lg"},
    color: {primary: "bg-blue-600", danger: "bg-red-600"},
  },
  defaultVariants: {size: "md", color: "primary"},
});

type ButtonProps = VariantProps<typeof button>;
type ButtonPropChecks = [
  Assert<Equals<NonNullable<ButtonProps["size"]>, "sm" | "md" | "lg">>,
  Assert<Equals<NonNullable<ButtonProps["color"]>, "primary" | "danger">>,
  Assert<Equals<NonNullable<ButtonProps["isDisabled"]>, boolean>>,
];

const buttonPropChecks: ButtonPropChecks = [true, true, true];

void buttonPropChecks;
