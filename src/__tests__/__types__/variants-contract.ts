/**
 * Structural guardrails for the variants type system.
 *
 * TVVariants must stay a plain record of axes to option maps. Putting a
 * `| Record<string, ...>` branch back would reopen the old VariantProps
 * widening-to-string regression.
 *
 * MergeVariantMaps is checked through the public TVProps path for left-only,
 * right-only, overlapping, and both-undefined cases. Index signatures are
 * stripped on the VariantProps path. TVVariants is documentation only;
 * inference uses TVVariantsConstraint. Relaxed axes keep literal
 * autocompletion through the inlined LiteralUnion fallback; strict axes
 * stay strict.
 */
import {
  type ClassProp,
  type ClassValue,
  type TVProps,
  type TVVariants,
  tv,
  type VariantProps,
} from "../../index.js";
import type {Assert, IsEqual} from "./test-utils.js";

// ---------------------------------------------------------------------------
// TVVariants shape freeze
// ---------------------------------------------------------------------------

// No union branches; axes map to option maps only.
type TVVariantsFrozenShape = Assert<
  IsEqual<TVVariants, Record<string, Record<string, ClassValue>>>
>;

// Slot-aware values stay slot map | ClassValue; no index-signature union at
// the axis level.
type TVVariantsFrozenSlotShape = Assert<
  IsEqual<
    TVVariants<{icon: string}>,
    Record<string, Record<string, {icon?: ClassValue} | ClassValue>>
  >
>;

const tvVariantsFrozen: [TVVariantsFrozenShape, TVVariantsFrozenSlotShape] = [true, true];

void tvVariantsFrozen;

// ---------------------------------------------------------------------------
// MergeVariantMaps via the public TVProps path
// ---------------------------------------------------------------------------

type LeftOnlyProps = TVProps<{size: {sm: string; md: string}}, undefined, undefined, undefined>;
type RightOnlyProps = TVProps<
  undefined,
  undefined,
  {tone: {neutral: string; brand: string}},
  undefined
>;
type OverlappingProps = TVProps<
  {size: {sm: string; md: string}},
  undefined,
  {size: {sm: string; lg: string}},
  undefined
>;
type NeitherProps = TVProps<undefined, undefined, undefined, undefined>;

type MergeSemanticsChecks = [
  Assert<IsEqual<NonNullable<LeftOnlyProps["size"]>, "sm" | "md">>,
  Assert<IsEqual<NonNullable<RightOnlyProps["tone"]>, "neutral" | "brand">>,
  // Overlap unions keys; must not widen to string.
  Assert<IsEqual<NonNullable<OverlappingProps["size"]>, "sm" | "md" | "lg">>,
  Assert<IsEqual<NeitherProps, ClassProp>>,
];

const mergeSemanticsChecks: MergeSemanticsChecks = [true, true, true, true];

void mergeSemanticsChecks;

// ---------------------------------------------------------------------------
// TVVariants is documentation, not the inference constraint
// ---------------------------------------------------------------------------

// satisfies keeps authored literals intact.
const authoredVariants = {
  color: {primary: "bg-blue-500", secondary: "bg-gray-500"},
} satisfies TVVariants;

const authoredButton = tv({variants: authoredVariants});

type AuthoredColor = Assert<
  IsEqual<NonNullable<VariantProps<typeof authoredButton>["color"]>, "primary" | "secondary">
>;

const authoredColor: AuthoredColor = true;

authoredButton({color: "secondary"});

void authoredColor;

// Wide TVVariants is accepted (constraint is TVVariantsConstraint). The index
// signature is stripped on resolution so VariantProps does not widen to
// string keys.
const wideVariants: TVVariants = {color: {primary: "bg-blue-500"}};
const wideButton = tv({variants: wideVariants});

type WideProps = VariantProps<typeof wideButton>;

type WidePropsChecks = [
  Assert<IsEqual<string & keyof WideProps, never>>,
  Assert<IsEqual<keyof WideProps, never>>,
];

const widePropsChecks: WidePropsChecks = [true, true];

wideButton({});
wideButton({class: "mt-2"});

// @ts-expect-error widened maps must not reopen arbitrary string props
wideButton({color: "primary"});

void widePropsChecks;

// ---------------------------------------------------------------------------
// LiteralUnion: relaxed axes only
// ---------------------------------------------------------------------------

// Known keys plus an index signature keep literal autocompletion
// ("primary" | (string & {})) instead of collapsing to bare string.
const relaxedOptions = {primary: "bg-blue-500"} as {primary: string} & Record<string, string>;
const relaxedButton = tv({variants: {tone: relaxedOptions}});

type RelaxedTone = NonNullable<VariantProps<typeof relaxedButton>["tone"]>;

type RelaxedToneCheck = Assert<IsEqual<RelaxedTone, "primary" | (string & Record<never, never>)>>;

const relaxedToneCheck: RelaxedToneCheck = true;

relaxedButton({tone: "primary"});
relaxedButton({tone: "any-free-form-string"});

void relaxedToneCheck;

// Pure index signature stays plain string; no fabricated literals.
const pureRecordOptions: Record<string, string> = {primary: "bg-blue-500"};
const pureRecordButton = tv({variants: {tone: pureRecordOptions}});

type PureRecordToneCheck = Assert<
  IsEqual<NonNullable<VariantProps<typeof pureRecordButton>["tone"]>, string>
>;

const pureRecordToneCheck: PureRecordToneCheck = true;

void pureRecordToneCheck;

// Strict axes get no string fallback.
const strictButton = tv({variants: {tone: {primary: "", secondary: ""}}});

type StrictTone = NonNullable<VariantProps<typeof strictButton>["tone"]>;

type StrictToneCheck = Assert<IsEqual<StrictTone, "primary" | "secondary">>;

const strictToneCheck: StrictToneCheck = true;

// @ts-expect-error strict axes reject unknown options
strictButton({tone: "free-form"});

void strictToneCheck;
