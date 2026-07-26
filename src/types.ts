import type {TVConfig} from "./config.js";
import type {ClassNameValue as ClassValue} from "./internal/merge/types.js";

export type {ClassValue};

export type ClassProp<V = ClassValue> =
  | {class?: V; className?: never}
  | {class?: never; className?: V};

type TVBaseName = "base";
type TVScreens = "initial";
type TVSlots = Record<string, ClassValue> | undefined;
type TVVariantsShape = Record<string, Record<string, unknown>> | undefined;

export interface TVReturnTypeLike<V extends TVVariantsShape, S extends TVSlots> {
  (...args: any[]): any;
  variants: V;
  slots: S;
}

export type OmitUndefined<T> = T extends undefined ? never : T;
export type StringToBoolean<T> = T extends "true" | "false" ? boolean : T;

type VariantValue<V, K> = K extends keyof V ? StringToBoolean<keyof V[K]> : never;
type VariantValueWithBooleanUndefined<V, K> =
  | VariantValue<V, K>
  | (boolean extends VariantValue<V, K> ? undefined : never);

type CnClassValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | CnClassDictionary
  | CnClassArray;

interface CnClassDictionary {
  [key: string]: any;
}

interface CnClassArray extends Array<CnClassValue> {}

export type CnOptions = CnClassValue[];
export type CnReturn = string | undefined;
export type isTrueOrArray<T> = T extends true | unknown[] ? true : false;
export type WithInitialScreen<T extends Array<string>> = ["initial", ...T];

type TVSlotsWithBase<S extends TVSlots, B extends ClassValue> =
  | keyof S
  | (B extends undefined ? never : TVBaseName);

type SlotsClassValue<S extends TVSlots, B extends ClassValue> = {
  [K in TVSlotsWithBase<S, B>]?: ClassValue;
};

type TVVariantsDefault<S extends TVSlots, B extends ClassValue> = S extends undefined
  ? {}
  : {
      [key: string]: {
        [key: string]: S extends TVSlots ? SlotsClassValue<S, B> | ClassValue : ClassValue;
      };
    };

export type TVVariants<
  S extends TVSlots | undefined,
  B extends ClassValue | undefined = undefined,
  EV extends TVVariantsShape = undefined,
  _ES extends TVSlots | undefined = undefined,
> = EV extends undefined
  ? TVVariantsDefault<S, B>
  :
      | {
          [K in keyof EV]: {
            [K2 in keyof EV[K]]: S extends TVSlots
              ? SlotsClassValue<S, B> | ClassValue
              : ClassValue;
          };
        }
      | TVVariantsDefault<S, B>;

export type TVCompoundVariants<
  V extends TVVariantsShape,
  S extends TVSlots,
  B extends ClassValue,
  EV extends TVVariantsShape,
  _ES extends TVSlots,
> = Array<
  {
    [K in keyof V | keyof EV]?:
      | VariantValueWithBooleanUndefined<V, K>
      | VariantValueWithBooleanUndefined<EV, K>
      | (K extends keyof V ? VariantValueWithBooleanUndefined<V, K>[] : never);
  } & ClassProp<SlotsClassValue<S, B> | ClassValue>
>;

export type TVCompoundSlots<
  V extends TVVariantsShape,
  S extends TVSlots,
  B extends ClassValue,
> = Array<
  {
    slots: Array<TVSlotsWithBase<S, B>>;
  } & {
    [K in keyof V]?:
      | VariantValueWithBooleanUndefined<V, K>
      | VariantValueWithBooleanUndefined<V, K>[];
  } & ClassProp
>;

export type TVDefaultVariants<
  V extends TVVariantsShape,
  _S extends TVSlots,
  EV extends TVVariantsShape,
  _ES extends TVSlots,
> = {
  [K in keyof V | keyof EV]?: VariantValue<V, K> | VariantValue<EV, K>;
};

export type TVScreenPropsValue<V extends TVVariantsShape, _S extends TVSlots, K extends keyof V> = {
  [Screen in TVScreens]?: StringToBoolean<keyof V[K]>;
};

export type TVProps<
  V extends TVVariantsShape,
  _S extends TVSlots,
  EV extends TVVariantsShape,
  _ES extends TVSlots,
> = EV extends undefined
  ? V extends undefined
    ? ClassProp<ClassValue>
    : {
        [K in keyof V]?: VariantValue<V, K> | undefined;
      } & ClassProp<ClassValue>
  : V extends undefined
    ? {
        [K in keyof EV]?: VariantValue<EV, K> | undefined;
      } & ClassProp<ClassValue>
    : {
        [K in keyof V | keyof EV]?: VariantValue<V, K> | VariantValue<EV, K> | undefined;
      } & ClassProp<ClassValue>;

export type TVVariantKeys<V extends TVVariantsShape, _S extends TVSlots> = V extends undefined
  ? undefined
  : Array<keyof V>;

type TVMergedVariants<V extends TVVariantsShape, EV extends TVVariantsShape> = V extends undefined
  ? EV
  : EV extends undefined
    ? V
    : V & EV;

type TVMergedSlots<S extends TVSlots, ES extends TVSlots> = S extends undefined
  ? ES
  : ES extends undefined
    ? S
    : S & ES;

export interface TVReturnProps<
  V extends TVVariantsShape,
  S extends TVSlots,
  B extends ClassValue,
  EV extends TVVariantsShape,
  ES extends TVSlots,
  E extends TVReturnTypeLike<any, any> | undefined = undefined,
> {
  extend: E;
  base: B;
  slots: TVMergedSlots<S, ES>;
  variants: TVMergedVariants<V, EV>;
  defaultVariants: TVDefaultVariants<V, S, EV, ES>;
  compoundVariants: TVCompoundVariants<V, S, B, EV, ES>;
  compoundSlots: TVCompoundSlots<V, S, B>;
  variantKeys: TVVariantKeys<TVMergedVariants<V, EV>, TVMergedSlots<S, ES>>;
}

type HasSlots<S extends TVSlots, ES extends TVSlots> = S extends undefined
  ? ES extends undefined
    ? false
    : true
  : true;

export interface TVReturnType<
  V extends TVVariantsShape,
  S extends TVSlots,
  B extends ClassValue,
  EV extends TVVariantsShape,
  ES extends TVSlots,
  E extends TVReturnTypeLike<any, any> | undefined = undefined,
> extends TVReturnProps<V, S, B, EV, ES, E> {
  (
    props?: TVProps<V, S, EV, ES>,
  ): HasSlots<S, ES> extends true
    ? {
        [K in keyof (ES extends undefined ? {} : ES)]: (
          slotProps?: TVProps<V, S, EV, ES>,
        ) => string;
      } & {
        [K in keyof (S extends undefined ? {} : S)]: (slotProps?: TVProps<V, S, EV, ES>) => string;
      } & {
        [K in TVBaseName]: (slotProps?: TVProps<V, S, EV, ES>) => string;
      }
    : string;
}

export type TV = <
  V extends TVVariants<S, B, EV>,
  CV extends TVCompoundVariants<V, S, B, EV, ES>,
  DV extends TVDefaultVariants<V, S, EV, ES>,
  B extends ClassValue = undefined,
  S extends TVSlots = undefined,
  E extends TVReturnTypeLike<any, any> = TVReturnTypeLike<V, S>,
  EV extends TVVariants<ES, B, E["variants"], ES> = E["variants"],
  ES extends TVSlots = E["slots"] extends TVSlots ? E["slots"] : undefined,
>(
  options: {
    /**
     * Extend allows for easy composition of components.
     * @see https://www.tailwind-variants.org/docs/composing-components
     */
    extend?: E;
    /**
     * Base allows you to set a base class for a component.
     */
    base?: B;
    /**
     * Slots allow you to separate a component into multiple parts.
     * @see https://www.tailwind-variants.org/docs/slots
     */
    slots?: S;
    /**
     * Variants allow you to create multiple versions of the same component.
     * @see https://www.tailwind-variants.org/docs/variants#adding-variants
     */
    variants?: V;
    /**
     * Compound variants allow you to apply classes to multiple variants at once.
     * @see https://www.tailwind-variants.org/docs/variants#compound-variants
     */
    compoundVariants?: CV;
    /**
     * Compound slots allow you to apply classes to multiple slots at once.
     */
    compoundSlots?: TVCompoundSlots<V, S, B>;
    /**
     * Default variants allow you to set default variants for a component.
     * @see https://www.tailwind-variants.org/docs/variants#default-variants
     */
    defaultVariants?: DV;
  },
  /**
   * The config object allows you to modify the default configuration.
   * @see https://www.tailwind-variants.org/docs/api-reference#config-optional
   */
  config?: TVConfig,
) => TVReturnType<V, S, B, EV, ES, E>;

export type TVLite = <
  V extends TVVariants<S, B, EV>,
  CV extends TVCompoundVariants<V, S, B, EV, ES>,
  DV extends TVDefaultVariants<V, S, EV, ES>,
  B extends ClassValue = undefined,
  S extends TVSlots = undefined,
  E extends TVReturnTypeLike<any, any> = TVReturnTypeLike<V, S>,
  EV extends TVVariants<ES, B, E["variants"], ES> = E["variants"],
  ES extends TVSlots = E["slots"] extends TVSlots ? E["slots"] : undefined,
>(options: {
  /**
   * Extend allows for easy composition of components.
   * @see https://www.tailwind-variants.org/docs/composing-components
   */
  extend?: E;
  /**
   * Base allows you to set a base class for a component.
   */
  base?: B;
  /**
   * Slots allow you to separate a component into multiple parts.
   * @see https://www.tailwind-variants.org/docs/slots
   */
  slots?: S;
  /**
   * Variants allow you to create multiple versions of the same component.
   * @see https://www.tailwind-variants.org/docs/variants#adding-variants
   */
  variants?: V;
  /**
   * Compound variants allow you to apply classes to multiple variants at once.
   * @see https://www.tailwind-variants.org/docs/variants#compound-variants
   */
  compoundVariants?: CV;
  /**
   * Compound slots allow you to apply classes to multiple slots at once.
   */
  compoundSlots?: TVCompoundSlots<V, S, B>;
  /**
   * Default variants allow you to set default variants for a component.
   * @see https://www.tailwind-variants.org/docs/variants#default-variants
   */
  defaultVariants?: DV;
}) => TVReturnType<V, S, B, EV, ES, E>;

export type VariantProps<Component extends (...args: any) => any> = Omit<
  OmitUndefined<Parameters<Component>[0]>,
  "class" | "className"
>;
