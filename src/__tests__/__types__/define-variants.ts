import type {TVOptions, VariantProps} from "../../index.js";
import type {Assert, IsEqual} from "./test-utils.js";

import {defineVariants as customDefineVariants, tv as customTV} from "../../config-entry.js";
import {defineVariants, tv} from "../../index.js";
import {defineVariants as liteDefineVariants, tv as liteTV} from "../../lite.js";

// Case: defined options infer the same recipe as the same options written inline.
const buttonVariants = defineVariants({
  slots: {base: "inline-flex", icon: "shrink-0"},
  variants: {
    size: {sm: {base: "h-8", icon: "size-3"}, lg: {base: "h-12"}},
    variant: {solid: "", ghost: {icon: "opacity-75"}},
    loading: {true: {icon: "animate-spin"}},
  },
  compoundVariants: [
    {size: "sm", loading: true, class: {base: "px-2"}},
    {variant: ["solid", "ghost"], class: {icon: "text-current"}},
  ],
  defaultVariants: {size: "sm"},
});
const definedButton = tv(buttonVariants);
const inlineButton = tv({
  slots: {base: "inline-flex", icon: "shrink-0"},
  variants: {
    size: {sm: {base: "h-8", icon: "size-3"}, lg: {base: "h-12"}},
    variant: {solid: "", ghost: {icon: "opacity-75"}},
    loading: {true: {icon: "animate-spin"}},
  },
  compoundVariants: [
    {size: "sm", loading: true, class: {base: "px-2"}},
    {variant: ["solid", "ghost"], class: {icon: "text-current"}},
  ],
  defaultVariants: {size: "sm"},
});

type DefinedMatchesInline = Assert<
  IsEqual<VariantProps<typeof definedButton>, VariantProps<typeof inlineButton>>
>;
type DefinedSizeIsLiteral = Assert<
  IsEqual<VariantProps<typeof definedButton>["size"], "sm" | "lg" | undefined>
>;
type DefinedSlots = Assert<IsEqual<keyof ReturnType<typeof definedButton>, "base" | "icon">>;

// Case: VariantProps reads defined options directly, identical to the recipe's props.
type PropsFromOptions = Assert<
  IsEqual<VariantProps<typeof buttonVariants>, VariantProps<typeof definedButton>>
>;

// Case: base-only, no-slot options with bare-class variant values.
const badge = tv(
  defineVariants({
    base: "rounded",
    variants: {tone: {neutral: "bg-gray-100", danger: "bg-red-100"}},
    defaultVariants: {tone: "neutral"},
  }),
);
type BadgeTone = Assert<
  IsEqual<VariantProps<typeof badge>["tone"], "neutral" | "danger" | undefined>
>;

// Case: compoundVariants reject a value absent from the axis.
defineVariants({
  variants: {size: {sm: "", lg: ""}},
  compoundVariants: [
    {
      // @ts-expect-error compoundVariants reject values absent from the axis
      size: "xl",
      class: "x",
    },
  ],
});

// Case: compoundVariants reject an axis absent from variants.
defineVariants({
  variants: {size: {sm: "", lg: ""}},
  compoundVariants: [
    {
      // @ts-expect-error compoundVariants reject axes absent from variants
      color: "primary",
      class: "x",
    },
  ],
});

// Case: defaultVariants reject a value absent from the axis.
defineVariants({
  variants: {size: {sm: "", lg: ""}},
  defaultVariants: {
    // @ts-expect-error defaultVariants reject values absent from the axis
    size: "xl",
  },
});

// Case: defaultVariants take a boolean on a boolean axis.
defineVariants({
  variants: {disabled: {true: ""}},
  // As with tv(), the conflict reduces the whole object to never, so the error lands here.
  // @ts-expect-error boolean axes take a boolean
  defaultVariants: {
    disabled: "yes",
  },
});

// Case: defaultVariants reject renamed or typo axes.
defineVariants({
  variants: {size: {sm: "", lg: ""}},
  defaultVariants: {
    // @ts-expect-error defaultVariants reject axes absent from variants
    sise: "sm",
  },
});

// Case: variant option values may only name declared slots.
defineVariants({
  slots: {base: "", icon: ""},
  variants: {
    // @ts-expect-error variant option values reject unknown slot names
    size: {sm: {icn: "size-3"}},
  },
});

// Case: compoundVariants class objects may only name declared slots.
defineVariants({
  slots: {base: "", icon: ""},
  variants: {size: {sm: "", lg: ""}},
  compoundVariants: [
    {
      size: "sm",
      // @ts-expect-error compound class objects reject unknown slot names
      class: {icn: "size-3"},
    },
  ],
});

// Case: compoundSlots are checked against slots and variants.
defineVariants({
  slots: {base: "", icon: ""},
  variants: {size: {sm: "", lg: ""}},
  compoundSlots: [
    {slots: ["base", "icon"], size: "sm", class: "gap-1"},
    // @ts-expect-error compoundSlots reject unknown slot names
    {slots: ["base", "icn"], class: "gap-1"},
  ],
});

// Case: extended axes are available to compoundVariants and to the resulting props.
const focusable = tv({variants: {focusVisible: {true: "ring-2"}}});
const focusableButton = tv(
  defineVariants({
    extend: focusable,
    variants: {size: {sm: "", lg: ""}},
    compoundVariants: [{size: "sm", focusVisible: true, class: "ring-1"}],
  }),
);
type ExtendedProps = Assert<
  IsEqual<
    Pick<VariantProps<typeof focusableButton>, "focusVisible" | "size">,
    {focusVisible?: boolean | undefined; size?: "sm" | "lg" | undefined}
  >
>;
defineVariants({
  extend: focusable,
  variants: {size: {sm: "", lg: ""}},
  compoundVariants: [
    {
      // @ts-expect-error boolean axes inherited through extend take a boolean
      focusVisible: "yes",
      class: "x",
    },
  ],
});

// Case: the lite and config entries export the same helper.
const liteButton = liteTV(liteDefineVariants({variants: {size: {sm: "", lg: ""}}}));
const customButton = customTV(customDefineVariants({variants: {size: {sm: "", lg: ""}}}));
type LiteAndCustomMatch = Assert<
  IsEqual<VariantProps<typeof liteButton>, VariantProps<typeof customButton>>
>;

// Case: TVOptions is exported for helpers that take options of their own.
type ButtonOptions = TVOptions<{size: {sm: string}}, {}, [], undefined, undefined, undefined>;
const buttonOptions: ButtonOptions = {variants: {size: {sm: ""}}};
tv(buttonOptions);

// Case: VariantProps on options matches the recipe for every shape.
const badgeVariants = defineVariants({
  base: "rounded",
  variants: {tone: {neutral: "", danger: ""}, outlined: {true: ""}},
  defaultVariants: {tone: "neutral"},
});
const extendedVariants = defineVariants({
  extend: focusable,
  slots: {base: "", label: ""},
  variants: {size: {sm: "", lg: ""}},
});
const baseOnlyVariants = defineVariants({base: "block"});
const badgeRecipe = tv(badgeVariants);
const extendedRecipe = tv(extendedVariants);
const baseOnlyRecipe = tv(baseOnlyVariants);
type BadgeOptionsMatch = Assert<
  IsEqual<VariantProps<typeof badgeVariants>, VariantProps<typeof badgeRecipe>>
>;
type ExtendedOptionsMatch = Assert<
  IsEqual<VariantProps<typeof extendedVariants>, VariantProps<typeof extendedRecipe>>
>;
type ExtendedOptionsProps = Assert<
  IsEqual<
    VariantProps<typeof extendedVariants>,
    {focusVisible?: boolean | undefined; size?: "sm" | "lg" | undefined}
  >
>;
type BaseOnlyOptionsMatch = Assert<
  IsEqual<VariantProps<typeof baseOnlyVariants>, VariantProps<typeof baseOnlyRecipe>>
>;

// Case: VariantProps still rejects what is neither a recipe nor defined options.
// @ts-expect-error VariantProps takes a recipe or defineVariants options
type NotARecipe = VariantProps<string>;

export type {
  BadgeOptionsMatch,
  BadgeTone,
  BaseOnlyOptionsMatch,
  DefinedMatchesInline,
  DefinedSizeIsLiteral,
  DefinedSlots,
  ExtendedOptionsMatch,
  ExtendedOptionsProps,
  ExtendedProps,
  LiteAndCustomMatch,
  NotARecipe,
  PropsFromOptions,
};
