import {tv, type VariantProps} from "../../index.js";
import type {Assert, IsEqual as Equals} from "./test-utils.js";

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

// Case: parent-axis array conditions are accepted in compoundVariants.
tv({
  extend: sizedSlots,
  compoundVariants: [{size: ["sm", "lg"], class: "combo"}],
});

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
