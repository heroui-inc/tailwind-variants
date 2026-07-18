import type {
  ClassProp,
  ClassValue,
  CnOptions,
  CnReturn,
  isTrueOrArray,
  OmitUndefined,
  StringToBoolean,
  TVCompoundSlots,
  TVCompoundVariants,
  TVDefaultVariants,
  TVProps,
  TVScreenPropsValue,
  TVVariantKeys,
  TVVariants,
  WithInitialScreen,
} from "../../index.js";

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;

type Slots = {base: string; icon: string};
type Variants = {
  size: {sm: string; lg: string};
  disabled: {true: string; false: string};
};

// Case: ClassValue accepts ordinary class strings.
type ClassValueContract = Assert<"block" extends ClassValue ? true : false>;
// Case: ClassProp accepts the class branch of its mutually exclusive union.
type ClassPropContract = Assert<{class: string} extends ClassProp ? true : false>;
// Case: OmitUndefined removes undefined from exported unions.
type OmitUndefinedContract = Assert<Equal<OmitUndefined<string | undefined>, string>>;
// Case: StringToBoolean converts boolean-like keys without changing other keys.
type BooleanContract = Assert<Equal<StringToBoolean<"true" | "other">, boolean | "other">>;
// Case: isTrueOrArray retains its existing readonly-array behavior.
type TrueOrArrayContract = Assert<Equal<isTrueOrArray<readonly string[]>, false>>;
// Case: WithInitialScreen prepends the initial responsive key.
type InitialScreenContract = Assert<
  Equal<WithInitialScreen<["sm", "lg"]>, ["initial", "sm", "lg"]>
>;
// Case: TVVariants accepts a standard no-slots variant definition.
type VariantShapeContract = Assert<Variants extends TVVariants<undefined> ? true : false>;
// Case: TVScreenPropsValue maps variant options into the initial screen object.
type ScreenContract = Assert<
  Equal<TVScreenPropsValue<Variants, undefined, "size">, {initial?: "sm" | "lg"}>
>;
// Case: TVProps exposes string and boolean variant values with optional keys.
type PropsContract = Assert<
  {size?: "sm" | "lg"; disabled?: boolean} extends TVProps<
    Variants,
    undefined,
    undefined,
    undefined
  >
    ? true
    : false
>;
// Case: TVVariantKeys returns every declared variant key.
type VariantKeysContract = Assert<
  Equal<TVVariantKeys<Variants, undefined>, Array<"size" | "disabled">>
>;

// Case: CnOptions and CnReturn accept the documented class input and output shapes.
const cnOptions: CnOptions = ["block", ["px-2"], {hidden: false}, null, undefined];
const cnReturn: CnReturn = "block";

// Case: TVCompoundVariants accepts arrays, boolean undefined conditions, and class.
const compoundVariants: TVCompoundVariants<Variants, undefined, undefined, undefined, undefined> = [
  {size: ["sm", "lg"], disabled: [false, undefined], class: "px-2"},
];

// Case: TVCompoundSlots accepts declared slots, variants, and className.
const compoundSlots: TVCompoundSlots<Variants, Slots, undefined> = [
  {slots: ["base", "icon"], size: "sm", className: "size-4"},
];

// Case: TVDefaultVariants accepts declared string and boolean defaults.
const defaultVariants: TVDefaultVariants<Variants, undefined, undefined, undefined> = {
  size: "lg",
  disabled: false,
};

void cnOptions;
void cnReturn;
void compoundVariants;
void compoundSlots;
void defaultVariants;

// Case: aggregate all exported type assertions so every contract is instantiated.
type PublicTypeContracts = [
  ClassValueContract,
  ClassPropContract,
  OmitUndefinedContract,
  BooleanContract,
  TrueOrArrayContract,
  InitialScreenContract,
  VariantShapeContract,
  ScreenContract,
  PropsContract,
  VariantKeysContract,
];

const publicTypeContracts: PublicTypeContracts = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
];

void publicTypeContracts;
