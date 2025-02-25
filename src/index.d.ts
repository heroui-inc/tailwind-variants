import type {ClassNameValue as ClassValue} from "tailwind-merge";

import {TVConfig, TWMConfig} from "./config";
import {TVGeneratedScreens} from "./generated";

/**
 * ----------------------------------------
 * Base Types
 * ----------------------------------------
 */

export type {ClassValue};

export type ClassProp<V extends unknown = ClassValue> =
  | {class?: V; className?: never}
  | {class?: never; className?: V};

type TVBaseName = "base";

type TVScreens = "initial" | TVGeneratedScreens;

type TVSlots = Record<string, ClassValue> | undefined;

/**
 * ----------------------------------------------------------------------
 * Utils
 * ----------------------------------------------------------------------
 */

export type OmitUndefined<T> = T extends undefined ? never : T;

export type StringToBoolean<T> = T extends "true" | "false" ? boolean : T;

export type CnOptions = ClassValue[];

export type CnReturn = string | undefined;

export declare const cnBase: <T extends CnOptions>(...classes: T) => CnReturn;

export declare const cn: <T extends CnOptions>(...classes: T) => (config?: TWMConfig) => CnReturn;

// compare if the value is true or array of values
export type isTrueOrArray<T> = T extends true | unknown[] ? true : false;

export type WithInitialScreen<T extends Array<string>> = ["initial", ...T];

/**
 * ----------------------------------------------------------------------
 * TV Types
 * ----------------------------------------------------------------------
 */

type TVSlotsWithBase<S extends TVSlots, B extends ClassValue> = B extends undefined
  ? keyof S
  : keyof S | TVBaseName;

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
  EV extends TVVariants<ES> | undefined = undefined,
  ES extends TVSlots | undefined = undefined,
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
  V extends TVVariants<S>,
  S extends TVSlots,
  B extends ClassValue,
  EV extends TVVariants<ES>,
  ES extends TVSlots,
> = Array<
  {
    [K in keyof V | keyof EV]?:
      | (K extends keyof V ? StringToBoolean<keyof V[K]> : never)
      | (K extends keyof EV ? StringToBoolean<keyof EV[K]> : never)
      | (K extends keyof V ? StringToBoolean<keyof V[K]>[] : never);
  } & ClassProp<SlotsClassValue<S, B> | ClassValue>
>;

export type TVCompoundSlots<
  V extends TVVariants<S>,
  S extends TVSlots,
  B extends ClassValue,
> = Array<
  V extends undefined
    ? {
        slots: Array<TVSlotsWithBase<S, B>>;
      } & ClassProp
    : {
        slots: Array<TVSlotsWithBase<S, B>>;
      } & {
        [K in keyof V]?: StringToBoolean<keyof V[K]> | StringToBoolean<keyof V[K]>[];
      } & ClassProp
>;

export type TVDefaultVariants<
  V extends TVVariants<S>,
  S extends TVSlots,
  EV extends TVVariants<ES>,
  ES extends TVSlots,
> = {
  [K in keyof V | keyof EV]?:
    | (K extends keyof V ? StringToBoolean<keyof V[K]> : never)
    | (K extends keyof EV ? StringToBoolean<keyof EV[K]> : never);
};

export type TVScreenPropsValue<
  V extends TVVariants<S>,
  S extends TVSlots,
  K extends keyof V,
  C extends TVConfig,
> = C["responsiveVariants"] extends string[]
  ? {
      [Screen in WithInitialScreen<C["responsiveVariants"]>[number]]?: StringToBoolean<keyof V[K]>;
    }
  : {
      [Screen in TVScreens]?: StringToBoolean<keyof V[K]>;
    };

export type TVProps<
  V extends TVVariants<S>,
  S extends TVSlots,
  C extends TVConfig<V, EV>,
  EV extends TVVariants<ES>,
  ES extends TVSlots,
> = EV extends undefined
  ? V extends undefined
    ? ClassProp<ClassValue>
    : {
        [K in keyof V]?: isTrueOrArray<C["responsiveVariants"]> extends true
          ? StringToBoolean<keyof V[K]> | TVScreenPropsValue<V, S, K, C> | undefined
          : StringToBoolean<keyof V[K]> | undefined;
      } & ClassProp<ClassValue>
  : V extends undefined
    ? {
        [K in keyof EV]?: isTrueOrArray<C["responsiveVariants"]> extends true
          ? StringToBoolean<keyof EV[K]> | TVScreenPropsValue<EV, ES, K, C> | undefined
          : StringToBoolean<keyof EV[K]> | undefined;
      } & ClassProp<ClassValue>
    : {
        [K in keyof V | keyof EV]?: isTrueOrArray<C["responsiveVariants"]> extends true
          ?
              | (K extends keyof V ? StringToBoolean<keyof V[K]> : never)
              | (K extends keyof EV ? StringToBoolean<keyof EV[K]> : never)
              | TVScreenPropsValue<EV & V, S, K, C>
              | undefined
          :
              | (K extends keyof V ? StringToBoolean<keyof V[K]> : never)
              | (K extends keyof EV ? StringToBoolean<keyof EV[K]> : never)
              | undefined;
      } & ClassProp<ClassValue>;

export type TVVariantKeys<V extends TVVariants<S>, S extends TVSlots> = V extends Object
  ? Array<keyof V>
  : undefined;

export type TVReturnProps<
  V extends TVVariants<S>,
  S extends TVSlots,
  B extends ClassValue,
  EV extends TVVariants<ES>,
  ES extends TVSlots,
  // @ts-expect-error
  E extends TVReturnType = undefined,
> = {
  extend: E;
  base: B;
  slots: S;
  variants: V;
  defaultVariants: TVDefaultVariants<V, S, EV, ES>;
  compoundVariants: TVCompoundVariants<V, S, B, EV, ES>;
  compoundSlots: TVCompoundSlots<V, S, B>;
  variantKeys: TVVariantKeys<V, S>;
};

type HasSlots<S extends TVSlots, ES extends TVSlots> = S extends undefined
  ? ES extends undefined
    ? false
    : true
  : true;

export type TVReturnType<
  V extends TVVariants<S>,
  S extends TVSlots,
  B extends ClassValue,
  C extends TVConfig<V, EV>,
  EV extends TVVariants<ES>,
  ES extends TVSlots,
  // @ts-expect-error
  E extends TVReturnType = undefined,
> = {
  (props?: TVProps<V, S, C, EV, ES>): HasSlots<S, ES> extends true
    ? {
        [K in keyof (ES extends undefined ? {} : ES)]: (
          slotProps?: TVProps<V, S, C, EV, ES>,
        ) => string;
      } & {
        [K in keyof (S extends undefined ? {} : S)]: (
          slotProps?: TVProps<V, S, C, EV, ES>,
        ) => string;
      } & {
        [K in TVSlotsWithBase<{}, B>]: (slotProps?: TVProps<V, S, C, EV, ES>) => string;
      }
    : string;
} & TVReturnProps<V, S, B, EV, ES, E>;

export type TVOptions<
  V extends TVVariants<S, B, EV>,
  CV extends TVCompoundVariants<V, S, B, EV, ES>,
  DV extends TVDefaultVariants<V, S, EV, ES>,
  C extends TVConfig<V, EV>,
  B extends ClassValue = undefined,
  S extends TVSlots = undefined,
  // @ts-expect-error
  E extends TVReturnType = TVReturnType<
    V,
    S,
    B,
    C,
    // @ts-expect-error
    EV extends undefined ? {} : EV,
    // @ts-expect-error
    ES extends undefined ? {} : ES
  >,
  EV extends TVVariants<ES, B, E["variants"], ES> = E["variants"],
  ES extends TVSlots = E["slots"] extends TVSlots ? E["slots"] : undefined,
> = {
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
};

export type TVOverride<
  V extends TVVariants<S, B, EV>,
  C extends TVConfig<V, EV>,
  B extends ClassValue = undefined,
  S extends TVSlots = undefined,
  // @ts-expect-error
  E extends TVReturnType = TVReturnType<
    V,
    S,
    B,
    C,
    // @ts-expect-error
    EV extends undefined ? {} : EV,
    // @ts-expect-error
    ES extends undefined ? {} : ES
  >,
  EV extends TVVariants<ES, B, E["variants"], ES> = E["variants"],
  ES extends TVSlots = E["slots"] extends TVSlots ? E["slots"] : undefined,
> = {
  /**
   * Slots allow you to override the slot config of a component
   */
  slots?: S extends TVSlots ? {[KS in keyof S]?: ClassValue} : never;
  /**
   * Variants allow you to override the variant config of a component
   */
  variants?: {
    [KV in keyof V]?: {
      [OV in keyof V[KV]]?: S extends TVSlots
        ? {
            [KS in keyof S]?: ClassValue;
          }
        : ClassValue;
    };
  };
  /**
   * Compound variants allow you to override the compound variant config of a component
   */
  compoundVariants?: TVCompoundVariants<V, S, B, EV, ES>;
  /**
   * Compound slots allow you to override the compound slot config of a components
   */
  compoundSlots?: TVCompoundSlots<V, S, B>;
  /**
   * Default variants allow you to override the default variant config of a component
   */
  defaultVariants?: TVDefaultVariants<V, S, EV, ES>;
};

export type TV = {
  <
    V extends TVVariants<S, B, EV>,
    CV extends TVCompoundVariants<V, S, B, EV, ES>,
    DV extends TVDefaultVariants<V, S, EV, ES>,
    C extends TVConfig<V, EV>,
    B extends ClassValue = undefined,
    S extends TVSlots = undefined,
    // @ts-expect-error
    E extends TVReturnType = TVReturnType<
      V,
      S,
      B,
      C,
      // @ts-expect-error
      EV extends undefined ? {} : EV,
      // @ts-expect-error
      ES extends undefined ? {} : ES
    >,
    EV extends TVVariants<ES, B, E["variants"], ES> = E["variants"],
    ES extends TVSlots = E["slots"] extends TVSlots ? E["slots"] : undefined,
  >(
    /**
     * The options object allows you to define the component.
     * @see https://www.tailwind-variants.org/docs/api-reference#options
     */
    options: TVOptions<V, CV, DV, C, B, S, E, EV, ES>,
    /**
     * The config object allows you to modify the default configuration.
     * @see https://www.tailwind-variants.org/docs/api-reference#config-optional
     */
    config?: C,
  ): TVReturnType<V, S, B, C, EV, ES, E>;
};

export type CreateTV<RV extends TVConfig["responsiveVariants"] = undefined> = {
  <
    V extends TVVariants<S, B, EV>,
    CV extends TVCompoundVariants<V, S, B, EV, ES>,
    DV extends TVDefaultVariants<V, S, EV, ES>,
    C extends TVConfig<V, EV>,
    B extends ClassValue = undefined,
    S extends TVSlots = undefined,
    // @ts-expect-error
    E extends TVReturnType = TVReturnType<
      V,
      S,
      B,
      C,
      // @ts-expect-error
      EV extends undefined ? {} : EV,
      // @ts-expect-error
      ES extends undefined ? {} : ES
    >,
    EV extends TVVariants<ES, B, E["variants"], ES> = E["variants"],
    ES extends TVSlots = E["slots"] extends TVSlots ? E["slots"] : undefined,
  >(
    options: TVOptions<V, CV, DV, C, B, S, E, EV, ES>,
    /**
     * The config object allows you to modify the default configuration.
     * @see https://www.tailwind-variants.org/docs/api-reference#config-optional
     */
    config?: C,
  ): TVReturnType<V, S, B, C & RV, EV, ES, E>;
};

export type DefineTVTemplate = {
  <
    V extends TVVariants<S, B, EV>,
    CV extends TVCompoundVariants<V, S, B, EV, ES>,
    DV extends TVDefaultVariants<V, S, EV, ES>,
    C extends TVConfig<V, EV>,
    B extends ClassValue = undefined,
    S extends TVSlots = undefined,
    // @ts-expect-error
    E extends TVReturnType = TVReturnType<
      V,
      S,
      B,
      C,
      // @ts-expect-error
      EV extends undefined ? {} : EV,
      // @ts-expect-error
      ES extends undefined ? {} : ES
    >,
    EV extends TVVariants<ES, B, E["variants"], ES> = E["variants"],
    ES extends TVSlots = E["slots"] extends TVSlots ? E["slots"] : undefined,
  >(
    /**
     * The template object allows you to define a component spec.
     * @see https://www.tailwind-variants.org/docs/api-reference#template
     */
    template: TVOptions<V, CV, DV, C, B, S, E, EV, ES>,
    /**
     * The config object allows you to modify the default configuration.
     * @see https://www.tailwind-variants.org/docs/api-reference#config-optional
     */
    config?: C,
  ): (
    /**
     * The override object allows you to override the component template.
     * @see https://www.tailwind-variants.org/docs/api-reference#override-optional
     */
    override?: TVOverride<V, C, B, S, E, EV, ES>,
    /**
     * The props object allows you to pass props to the component.
     * @see https://www.tailwind-variants.org/docs/api-reference#props-optional
     */
    props?: TVProps<V, S, C, EV, ES>,
  ) => ReturnType<TVReturnType<V, S, B, C, EV, ES, E>>;
};

// main function
export declare const tv: TV;

export declare function createTV<T extends TVConfig["responsiveVariants"]>(
  config: TVConfig & T,
): CreateTV<T>;

export declare const defineTV: DefineTVTemplate;

export declare const defaultConfig: TVConfig;

export type VariantProps<Component extends (...args: any) => any> = Omit<
  OmitUndefined<Parameters<Component>[0]>,
  "class" | "className"
>;
