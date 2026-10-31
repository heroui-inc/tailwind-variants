import type {VariantProps} from "../../index.js";

import {tv} from "../../index.js";

// Case: infer optional defaulted variants, booleans, arrays, and VariantProps.
const button = tv({
  variants: {
    size: {
      sm: "text-sm",
      lg: "text-lg",
    },
    disabled: {
      true: "opacity-50",
      false: "opacity-100",
    },
  },
  defaultVariants: {
    size: "sm",
    disabled: false,
  },
  compoundVariants: [{size: ["sm", "lg"], disabled: [false, undefined], class: "font-medium"}],
});

type ButtonProps = VariantProps<typeof button>;

const defaultableProps: ButtonProps = {};
const explicitProps: ButtonProps = {size: "lg", disabled: true};

button(defaultableProps);
button(explicitProps);

tv({
  variants: {size: {sm: "", lg: ""}},
  defaultVariants: {
    // @ts-expect-error defaultVariants reject unknown keys
    tone: "neutral",
  },
});

tv({
  variants: {size: {sm: "", lg: ""}},
  defaultVariants: {
    // @ts-expect-error defaultVariants reject invalid values
    size: "xl",
  },
});

tv({
  variants: {size: {sm: "", lg: ""}},
  compoundVariants: [
    // @ts-expect-error compoundVariants reject invalid variant values
    {size: "xl", class: "text-xl"},
  ],
});

// Case: compoundVariants must be an array, the only shape the runtime supports.
tv({
  variants: {size: {sm: "", lg: ""}},
  // @ts-expect-error compoundVariants must be an array
  compoundVariants: {},
});

// Case: numeric option keys accept number literals in props and VariantProps.
const box = tv({
  variants: {
    gap: {px: "gap-px", 0: "gap-0", 2: "gap-2"},
  },
  defaultVariants: {gap: 0},
  compoundVariants: [{gap: [0, 2], class: "flex"}],
});

type BoxProps = VariantProps<typeof box>;

const numericProps: BoxProps = {gap: 0};
const numericGap: BoxProps["gap"] = 2;

box(numericProps);
box({gap: 2});
box({gap: "px"});
box({gap: numericGap});

// @ts-expect-error numeric option keys reject unknown numbers
box({gap: 3});

// @ts-expect-error numeric option keys reject unknown strings
box({gap: "3"});
