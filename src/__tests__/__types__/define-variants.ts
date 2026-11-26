import type {VariantProps} from "../../index.js";
import type {Assert, IsEqual} from "./test-utils.js";

import {
  createTV,
  defineVariants as customDefineVariants,
  tv as customTV,
} from "../../config-entry.js";
import {defineVariants, tv} from "../../index.js";
import {defineVariants as liteDefineVariants, tv as liteTV} from "../../lite.js";

// Case: defined options infer the same recipe as the same options written inline.
const buttonTheme = defineVariants({
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
const definedButton = tv(buttonTheme);
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
  IsEqual<VariantProps<typeof buttonTheme>, VariantProps<typeof definedButton>>
>;

// Case: compoundSlots are kept as written, so the recipe matches the inline one.
const chipTheme = defineVariants({
  slots: {base: "inline-flex", icon: "shrink-0"},
  variants: {size: {sm: {base: "h-8"}, lg: {base: "h-12"}}, disabled: {true: "opacity-50"}},
  compoundVariants: [{size: "sm", disabled: true, class: {icon: "size-3"}}],
  compoundSlots: [{slots: ["base", "icon"], size: "lg", class: "gap-2"}],
  defaultVariants: {size: "sm"},
});
const chip = tv(chipTheme);
const inlineChip = tv({
  slots: {base: "inline-flex", icon: "shrink-0"},
  variants: {size: {sm: {base: "h-8"}, lg: {base: "h-12"}}, disabled: {true: "opacity-50"}},
  compoundVariants: [{size: "sm", disabled: true, class: {icon: "size-3"}}],
  compoundSlots: [{slots: ["base", "icon"], size: "lg", class: "gap-2"}],
  defaultVariants: {size: "sm"},
});
type ChipOptionsMatch = Assert<
  IsEqual<VariantProps<typeof chipTheme>, VariantProps<typeof inlineChip>>
>;
type ChipPropsMatch = Assert<IsEqual<VariantProps<typeof chip>, VariantProps<typeof inlineChip>>>;
type ChipSlotsMatch = Assert<IsEqual<ReturnType<typeof chip>, ReturnType<typeof inlineChip>>>;
type ChipCompoundSlotsRequired = Assert<
  IsEqual<undefined extends (typeof chipTheme)["compoundSlots"] ? true : false, false>
>;
const chipCompoundSlotCount: number = chipTheme.compoundSlots.length;

// Case: tv() takes a per-call config alongside defined options.
const chipWithoutMerge = tv(chipTheme, {twMerge: false});
type ChipWithConfig = Assert<
  IsEqual<VariantProps<typeof chipWithoutMerge>, VariantProps<typeof chipTheme>>
>;

// Case: spreading defined options keeps VariantProps and lets fields be overridden.
const chipCopy = {...chipTheme};
const chipWithBase = tv({...chipTheme, base: "extra"});
const chipLarge = tv({...chipTheme, defaultVariants: {size: "lg"}});
const chipLargeTheme = defineVariants({...chipTheme, defaultVariants: {size: "lg"}});
const chipToneTheme = {...chipTheme, variants: {...chipTheme.variants, tone: {a: "x"}}};
const chipTone = tv(chipToneTheme);
type SpreadCopy = Assert<IsEqual<VariantProps<typeof chipCopy>, VariantProps<typeof chipTheme>>>;
type SpreadBase = Assert<
  IsEqual<VariantProps<typeof chipWithBase>, VariantProps<typeof chipTheme>>
>;
type SpreadDefaults = Assert<
  IsEqual<VariantProps<typeof chipLarge>, VariantProps<typeof chipTheme>>
>;
type SpreadDefined = Assert<
  IsEqual<VariantProps<typeof chipLargeTheme>, VariantProps<typeof chipTheme>>
>;
type SpreadOptionsTone = Assert<
  IsEqual<VariantProps<typeof chipToneTheme>["tone"], "a" | undefined>
>;
type SpreadTone = Assert<IsEqual<VariantProps<typeof chipTone>["tone"], "a" | undefined>>;
type SpreadSize = Assert<IsEqual<VariantProps<typeof chipTone>["size"], "sm" | "lg" | undefined>>;
tv({
  ...chipTheme,
  defaultVariants: {
    // @ts-expect-error an override is still checked against the variants
    size: "xl",
  },
});

// Case: `as const` options keep their literals.
const constTheme = defineVariants({
  base: "a",
  variants: {size: {sm: "x", lg: "y"}},
  compoundVariants: [{size: "sm", class: "z"}],
  defaultVariants: {size: "sm"},
} as const);
const constRecipe = tv(constTheme);
type ConstSize = Assert<IsEqual<VariantProps<typeof constTheme>["size"], "sm" | "lg" | undefined>>;
type ConstMatch = Assert<
  IsEqual<VariantProps<typeof constRecipe>, VariantProps<typeof constTheme>>
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

// Case: multi-extend matches the inline recipe.
const ringed = tv({base: "ring", variants: {focus: {on: "ring-2"}}});
const animated = tv({slots: {base: "", root: ""}, variants: {speed: {fast: "duration-100"}}});
const cardTheme = defineVariants({
  extend: [ringed, animated],
  variants: {tone: {muted: "bg-gray-100"}},
  compoundVariants: [{focus: "on", speed: "fast", class: "x"}],
  defaultVariants: {speed: "fast"},
});
const card = tv(cardTheme);
const inlineCard = tv({
  extend: [ringed, animated],
  variants: {tone: {muted: "bg-gray-100"}},
  compoundVariants: [{focus: "on", speed: "fast", class: "x"}],
  defaultVariants: {speed: "fast"},
});
type MultiExtendOptionsMatch = Assert<
  IsEqual<VariantProps<typeof cardTheme>, VariantProps<typeof inlineCard>>
>;
type MultiExtendSlotsMatch = Assert<
  IsEqual<ReturnType<typeof card>, ReturnType<typeof inlineCard>>
>;

// Case: a recipe built from defined options can be extended, inline or defined.
const extendsChip = tv({extend: tv(chipTheme), variants: {tone: {a: "b"}}});
const extendsChipTheme = defineVariants({extend: tv(chipTheme), variants: {tone: {a: "b"}}});
type ExtendsChipSize = Assert<
  IsEqual<VariantProps<typeof extendsChip>["size"], "sm" | "lg" | undefined>
>;
type ExtendsChipMatch = Assert<
  IsEqual<VariantProps<typeof extendsChipTheme>, VariantProps<typeof extendsChip>>
>;

// Case: the lite and config entries export the same helper.
const liteButton = liteTV(liteDefineVariants({variants: {size: {sm: "", lg: ""}}}));
const customButton = customTV(customDefineVariants({variants: {size: {sm: "", lg: ""}}}));
type LiteAndCustomMatch = Assert<
  IsEqual<VariantProps<typeof liteButton>, VariantProps<typeof customButton>>
>;
const liteTheme = liteDefineVariants({
  base: "a",
  variants: {size: {sm: "x"}},
  compoundVariants: [{size: "sm", class: "y"}],
});
const liteRecipe = liteTV(liteTheme);
const liteThemeInFullTV = tv(liteTheme);
type LiteOptionsMatch = Assert<
  IsEqual<VariantProps<typeof liteTheme>, VariantProps<typeof liteRecipe>>
>;
type LiteOptionsInFullTV = Assert<
  IsEqual<VariantProps<typeof liteThemeInFullTV>, VariantProps<typeof liteRecipe>>
>;
const customTheme = customDefineVariants({
  slots: {a: "", b: ""},
  variants: {v: {x: {a: "1"}}},
  compoundSlots: [{slots: ["a", "b"], v: "x", class: "c"}],
});
const createdRecipe = createTV({twMerge: false})(customTheme);
const customRecipe = customTV(customTheme);
type CreateTVOptionsMatch = Assert<
  IsEqual<VariantProps<typeof customTheme>, VariantProps<typeof createdRecipe>>
>;
type CustomTVMatchesCreateTV = Assert<
  IsEqual<VariantProps<typeof customRecipe>, VariantProps<typeof createdRecipe>>
>;
type CustomTVSlots = Assert<
  IsEqual<keyof ReturnType<typeof customRecipe>, keyof ReturnType<typeof createdRecipe>>
>;

// Case: options held in a variable go through defineVariants, not a public options type.
const buttonOptions = defineVariants({variants: {size: {sm: ""}}});
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
type BaseOnlyOptionsEmpty = Assert<
  IsEqual<VariantProps<typeof baseOnlyVariants>, VariantProps<ReturnType<typeof tv<{}>>>>
>;

// Case: VariantProps still rejects what is neither a recipe nor defined options.
// @ts-expect-error VariantProps takes a recipe or defineVariants options
type NotARecipe = VariantProps<string>;
// @ts-expect-error an empty object type is not defined options
type NotAnEmptyObject = VariantProps<{}>;
// @ts-expect-error object is not defined options
type NotAnObject = VariantProps<object>;
// @ts-expect-error a plain options type is not defined options
type NotPlainOptions = VariantProps<{variants: {size: {sm: "a"}}}>;
type LooseOptions = {variants?: {size: {sm: string}}; base?: string};
// @ts-expect-error a type with optional fields must not silently give {}
type NotLooseOptions = VariantProps<LooseOptions>;
const plainConstOptions = {
  variants: {size: {sm: "a", lg: "b"}},
  compoundVariants: [{size: "sm", class: "c"}],
  defaultVariants: {size: "sm"},
} as const;
// @ts-expect-error `as const` options that skipped defineVariants
type NotConstOptions = VariantProps<typeof plainConstOptions>;
// tv() still takes them, and VariantProps reads the recipe.
const plainConstRecipe = tv(plainConstOptions);
type PlainConstRecipeSize = Assert<
  IsEqual<VariantProps<typeof plainConstRecipe>["size"], "sm" | "lg" | undefined>
>;

// Case: defined options carry the type-only brand VariantProps checks for.
type DefinedBrand = Assert<IsEqual<(typeof chipTheme)["~tv"], "defineVariants">>;

// Case: written fields come back as required keys, defaults typed as any value of their variant.
const readable = defineVariants({
  slots: {base: "", icon: ""},
  variants: {size: {sm: "", lg: ""}, disabled: {true: ""}},
  defaultVariants: {size: "sm", disabled: false},
});
type ReadableSize = Assert<IsEqual<typeof readable.defaultVariants.size, "sm" | "lg">>;
type ReadableDisabled = Assert<IsEqual<typeof readable.defaultVariants.disabled, boolean>>;
type ReadableSlots = Assert<IsEqual<keyof typeof readable.slots, "base" | "icon">>;
const readableSize: "sm" | "lg" = readable.defaultVariants.size;
// @ts-expect-error base was not written, so it is not on the returned options
readable.base;
// @ts-expect-error a default that was not written is not on the returned defaults
readable.defaultVariants.tone;
// @ts-expect-error compoundSlots was not written, so it is not on the returned options
readable.compoundSlots;

export type {
  BadgeOptionsMatch,
  BadgeTone,
  BaseOnlyOptionsEmpty,
  BaseOnlyOptionsMatch,
  ChipCompoundSlotsRequired,
  ChipOptionsMatch,
  ChipPropsMatch,
  ChipSlotsMatch,
  ChipWithConfig,
  ConstMatch,
  ConstSize,
  CreateTVOptionsMatch,
  CustomTVMatchesCreateTV,
  CustomTVSlots,
  DefinedBrand,
  DefinedMatchesInline,
  DefinedSizeIsLiteral,
  DefinedSlots,
  ExtendedOptionsMatch,
  ExtendedOptionsProps,
  ExtendedProps,
  ExtendsChipMatch,
  ExtendsChipSize,
  LiteAndCustomMatch,
  LiteOptionsInFullTV,
  LiteOptionsMatch,
  MultiExtendOptionsMatch,
  MultiExtendSlotsMatch,
  NotAnEmptyObject,
  NotAnObject,
  NotARecipe,
  NotConstOptions,
  NotLooseOptions,
  NotPlainOptions,
  PlainConstRecipeSize,
  PropsFromOptions,
  ReadableDisabled,
  ReadableSize,
  ReadableSlots,
  SpreadBase,
  SpreadCopy,
  SpreadDefaults,
  SpreadDefined,
  SpreadOptionsTone,
  SpreadSize,
  SpreadTone,
};

export {chipCompoundSlotCount, readableSize};
