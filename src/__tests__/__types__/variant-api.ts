import {tv, type VariantProps} from "../../index.js";

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

// Case: reject default variant keys that are not declared.
tv({
  variants: {size: {sm: "", lg: ""}},
  // @ts-expect-error defaultVariants reject unknown keys
  defaultVariants: {tone: "neutral"},
});

// Case: reject default variant values outside the declared option union.
tv({
  variants: {size: {sm: "", lg: ""}},
  // @ts-expect-error defaultVariants reject invalid values
  defaultVariants: {size: "xl"},
});

// Case: reject compound variant values outside the declared option union.
tv({
  variants: {size: {sm: "", lg: ""}},
  compoundVariants: [
    // @ts-expect-error compoundVariants reject invalid variant values
    {size: "xl", class: "text-xl"},
  ],
});

// Case: require compoundVariants to use its runtime-supported array shape.
tv({
  variants: {size: {sm: "", lg: ""}},
  // @ts-expect-error compoundVariants must be an array
  compoundVariants: {},
});
