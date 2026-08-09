/**
 * Public TypeScript usage from https://www.tailwind-variants.org/docs/typescript
 * These cases mirror the documented examples so docs and library stay aligned.
 */

import type {VariantProps} from "../../index.js";
import type {Assert, IsEqual as Equals, Extends} from "./test-utils.js";

import {tv} from "../../index.js";

// ---------------------------------------------------------------------------
// VariantProps (docs): extract props a recipe accepts
// ---------------------------------------------------------------------------
const button = tv({
  base: "inline-flex cursor-pointer items-center justify-center rounded-full px-4 py-1.5 font-medium select-none",
  variants: {
    variant: {
      primary: "bg-zinc-900 text-white",
      secondary: "bg-zinc-100 text-zinc-900",
      tertiary: "text-zinc-600",
    },
    flat: {
      true: "bg-transparent shadow-none",
    },
  },
  defaultVariants: {
    variant: "primary",
  },
});

// No fabricated TVReturnTypeLike parent when `extend` is omitted.
type ButtonExtendMeta = Assert<Equals<typeof button.extend, undefined>>;
const buttonExtendMeta: ButtonExtendMeta = true;

type ButtonVariants = VariantProps<typeof button>;
// Docs comment: variant?: "primary" | "secondary" | "tertiary"; flat?: boolean
type ButtonVariantChecks = [
  Assert<Equals<NonNullable<ButtonVariants["variant"]>, "primary" | "secondary" | "tertiary">>,
  Assert<Equals<NonNullable<ButtonVariants["flat"]>, boolean>>,
];

const buttonVariantChecks: ButtonVariantChecks = [true, true];

// Docs: keys with defaultVariants stay optional, so an empty VariantProps is usable.
const defaultedButtonProps: ButtonVariants = {};
button(defaultedButtonProps);
button({variant: "secondary", flat: true});

// Docs pattern: extend VariantProps into a component props interface (no React runtime).
interface ButtonProps extends ButtonVariants {
  children: string;
  className?: string;
}

const buttonProps: ButtonProps = {
  children: "Save",
  variant: "secondary",
  flat: true,
  className: "mt-2",
};

const buttonClass: string = button({
  variant: buttonProps.variant,
  flat: buttonProps.flat,
  className: buttonProps.className,
});

void buttonExtendMeta;
void buttonVariantChecks;
void buttonClass;

// @ts-expect-error docs: invalid variant values remain rejected
button({variant: "quaternary"});

// @ts-expect-error boolean `flat` rejects its string representation
button({flat: "true"});

// ---------------------------------------------------------------------------
// Required variants (docs): modeled with TS utilities, no built-in required flag
// ---------------------------------------------------------------------------
const sized = tv({
  variants: {
    size: {
      sm: "text-sm",
      md: "text-base",
      lg: "text-lg",
    },
    tone: {
      neutral: "text-zinc-700",
      brand: "text-blue-700",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

type SizedVariants = VariantProps<typeof sized>;

// Docs pattern: force one axis required while others stay optional.
type RequiredSize = Omit<SizedVariants, "size"> & Required<Pick<SizedVariants, "size">>;

type RequiredSizeChecks = [Assert<Equals<NonNullable<SizedVariants["size"]>, "sm" | "md" | "lg">>];

const requiredSizeChecks: RequiredSizeChecks = [true];

const requiredSizeProps: RequiredSize = {size: "md"};
const requiredSizeWithOptionalTone: RequiredSize = {size: "lg", tone: "brand"};

sized(requiredSizeProps);
sized(requiredSizeWithOptionalTone);

void requiredSizeChecks;

// @ts-expect-error RequiredSize rejects missing size (docs required-variants pattern)
const _missingSize: RequiredSize = {tone: "brand"};

void _missingSize;

// ---------------------------------------------------------------------------
// Slotted return types (docs): ReturnType plus destructured slot functions
// ---------------------------------------------------------------------------
const alert = tv({
  slots: {
    base: "flex gap-3 rounded-lg p-4",
    title: "font-semibold",
    description: "text-sm",
  },
  variants: {
    color: {
      default: {
        base: "bg-zinc-100",
        title: "text-zinc-900",
      },
      danger: {
        base: "bg-red-50",
        title: "text-red-900",
      },
    },
  },
});

type AlertSlots = ReturnType<typeof alert>;
type AlertProps = VariantProps<typeof alert>;

type AlertChecks = [
  Assert<Extends<AlertSlots["base"], (props?: any) => string>>,
  Assert<Extends<AlertSlots["title"], (props?: any) => string>>,
  Assert<Extends<AlertSlots["description"], (props?: any) => string>>,
  Assert<Equals<NonNullable<AlertProps["color"]>, "default" | "danger">>,
];

const alertChecks: AlertChecks = [true, true, true, true];

function Alert({color}: AlertProps) {
  const {base, title, description} = alert({color});

  const baseClass: string = base();
  const titleClass: string = title();
  const descriptionClass: string = description();

  return {baseClass, titleClass, descriptionClass};
}

const alertView = Alert({color: "danger"});

void alertChecks;
void alertView;

// @ts-expect-error unknown slots remain rejected on slotted return types
alert({color: "default"}).footer();

// @ts-expect-error invalid color values remain rejected
Alert({color: "success"});

// ---------------------------------------------------------------------------
// `as const` for external definitions (docs): preserve literal keys
// ---------------------------------------------------------------------------
const externalVariants = {
  primary: "bg-zinc-900 text-white",
  secondary: "bg-zinc-100 text-zinc-900",
  tertiary: "text-zinc-600",
} as const;

const externalButton = tv({
  variants: {variant: externalVariants},
});

type ExternalButtonProps = VariantProps<typeof externalButton>;

type ExternalChecks = [
  Assert<Equals<NonNullable<ExternalButtonProps["variant"]>, "primary" | "secondary" | "tertiary">>,
];

const externalChecks: ExternalChecks = [true];

externalButton({variant: "primary"});
externalButton({variant: "tertiary"});

void externalChecks;

// @ts-expect-error external as-const unions still reject unknown options
externalButton({variant: "ghost"});

// Docs rationale for `as const`: a wide `Record<string, string>` loses option literals.
const recordVariants: Record<string, string> = {
  primary: "bg-zinc-900 text-white",
  secondary: "bg-zinc-100 text-zinc-900",
};

const recordButton = tv({
  variants: {variant: recordVariants},
});

type RecordVariant = NonNullable<VariantProps<typeof recordButton>["variant"]>;

// Contrast with the `as const` recipe above (`"primary" | "secondary" | "tertiary"`).
type RecordVariantCheck = Assert<Equals<RecordVariant, string>>;

const recordVariantCheck: RecordVariantCheck = true;

void recordVariantCheck;
