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

/** Flatten intersections for readable IDE tooltips. */
type Simplify<T> = {[K in keyof T]: T[K]} & {};

/**
 * Local stand-in for the TS 5.4 built-in `NoInfer`, so emitted declarations
 * do not require TypeScript >= 5.4 in consuming projects.
 */
type NoInfer<T> = [T][T extends unknown ? 0 : never];

/**
 * Remove index signatures, keeping only literal keys.
 * Used on the {@link TVResolvedVariants} to `VariantProps` resolution path so a
 * widened variants map (an explicit `TVVariants` annotation, or a future
 * `| Record<string, ...>` constraint) cannot leak `string` keys into
 * `VariantProps` again.
 */
type OmitIndexSignature<T> = {
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : symbol extends K
        ? never
        : K]: T[K];
};

/**
 * Known literals plus a non-collapsing string fallback: `"a" | (string & {})`
 * keeps autocompletion for `"a"` while accepting any string. Inlined to avoid
 * a `type-fest` dependency. Applied only to relaxed axes that mix an index
 * signature with literal keys; strict literal-only axes, and so strict
 * `VariantProps`, are never touched.
 */
type LiteralUnion<Literal extends string> = Literal | (string & Record<never, never>);

/**
 * Soft Exact: keys on `Actual` that are absent from `Shape` become `never`, so
 * excess fields (e.g. renamed variant axes) error on the offending property
 * itself, even when the value is held in a variable. Deliberately shallow; do
 * not replace with a recursive Exact.
 */
type ExactKeys<Shape, Actual> = Record<Exclude<keyof Actual, keyof Shape>, never>;

/**
 * Soft Exact applied to a value position: the leading `Actual &` keeps the
 * value inferrable, `Shape` validates known keys, `ExactKeys` rejects excess.
 * Shared by `defaultVariants` and (per element) `compoundVariants`.
 */
type ExactShape<Shape, Actual> = Actual & Shape & ExactKeys<Shape, Actual>;

/**
 * Right (child) wins for an overlapping axis unless both sides are option
 * maps, in which case their option keys union (matching runtime `mergeObjects`).
 */
type MergeVariantOptions<Left, Right> = [Left, Right] extends [
  Record<string, unknown>,
  Record<string, unknown>,
]
  ? Simplify<Left & Right>
  : Right;

/**
 * Merge two variant maps the way runtime `mergeObjects` does for axes:
 * union axis keys, and for overlapping axes union option keys.
 * `undefined` on either side yields the other side unchanged.
 */
type MergeVariantMaps<Left extends TVVariantsShape, Right extends TVVariantsShape> = [
  Left,
] extends [undefined]
  ? Right
  : [Right] extends [undefined]
    ? Left
    : Simplify<{
        [K in keyof Left | keyof Right]: K extends keyof Right
          ? K extends keyof Left
            ? MergeVariantOptions<Left[K], Right[K]>
            : Right[K]
          : K extends keyof Left
            ? Left[K]
            : never;
      }>;

export interface TVReturnTypeLike<V extends TVVariantsShape, S extends TVSlots> {
  (...args: any[]): any;
  variants: V;
  slots: S;
}

export type OmitUndefined<T> = T extends undefined ? never : T;
export type StringToBoolean<T> = T extends "true" | "false" | true | false ? boolean : T;

/**
 * Normalize one option key to a string literal, mapping boolean `true`/`false`
 * keys to `"true"`/`"false"` so StringToBoolean can turn them into `boolean`.
 */
type NormalizeVariantOptionKey<K> = K extends true | "true"
  ? "true"
  : K extends false | "false"
    ? "false"
    : K extends string
      ? K
      : never;

/**
 * Option keys of one axis. Strict literal-only axes resolve to their literal
 * union. A relaxed axis authored with an index signature keeps its known
 * literal keys via {@link LiteralUnion} (autocompletion preserved) instead of
 * collapsing to bare `string`; a pure index-signature axis stays `string`.
 */
type VariantOptionKeys<O> = string extends keyof O
  ? [keyof OmitIndexSignature<O>] extends [never]
    ? string
    : LiteralUnion<NormalizeVariantOptionKey<keyof OmitIndexSignature<O>>>
  : NormalizeVariantOptionKey<keyof O>;

/** Prefer string option keys so array values do not leak `number` into props. */
type VariantValue<V, K> = K extends keyof V ? StringToBoolean<VariantOptionKeys<V[K]>> : never;
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
export type CnReturn = string;
export type isTrueOrArray<T> = T extends true | unknown[] ? true : false;
export type WithInitialScreen<T extends Array<string>> = ["initial", ...T];

type TVSlotsWithBase<S extends TVSlots, B extends ClassValue> =
  | keyof S
  | (B extends undefined ? never : TVBaseName);

type SlotsClassValue<S extends TVSlots, B extends ClassValue> = {
  [K in TVSlotsWithBase<S, B>]?: ClassValue;
};

type TVMergedSlots<S extends TVSlots, ES extends TVSlots> = S extends undefined
  ? ES
  : ES extends undefined
    ? S
    : S & ES;

type VariantClassValue<S extends TVSlots, B extends ClassValue | undefined> = S extends undefined
  ? ClassValue
  : SlotsClassValue<S, B> | ClassValue;

/**
 * Documented shape of a `variants` map (slot-aware option values when `S`/`ES`
 * are known). Not the `tv` type-parameter constraint: using it there would make
 * `V` depend on `EV`/`ES` (and so on `E`) and break parent-axis inference. The
 * inference constraint is {@link TVVariantsConstraint}; keep them separate.
 *
 * Breaking change from earlier releases: this is no longer
 * `ParentMapped | {[key: string]: ...}`. The index-signature branch widened
 * `VariantProps` to `string` when `variants` was omitted or came only from
 * `extend`. Prefer inferring through `tv()` / `VariantProps` over writing
 * `TVVariants<...>` by hand.
 *
 * Do not add union branches like `| Record<string, ...>` or
 * `| {[key: string]: ...}` back to this type, and do not use it as the `V`
 * constraint on {@link TV} / {@link TVLite}. The shape is asserted in
 * `__tests__/__types__/variants-contract.ts`.
 */
export type TVVariants<
  S extends TVSlots | undefined = undefined,
  B extends ClassValue | undefined = undefined,
  _EV extends TVVariantsShape = undefined,
  ES extends TVSlots | undefined = undefined,
> = Record<string, Record<string, VariantClassValue<TVMergedSlots<S, ES>, B>>>;

/**
 * Inference-only constraint for `V`: wide enough for slot-shaped option values,
 * without referencing `E`/`EV`/`ES` (avoids circular inference that drops parent axes).
 */
type TVVariantsConstraint = Record<string, Record<string, any>>;

/**
 * Resolution path feeding `TVProps` / `VariantProps` / `defaultVariants` /
 * `compoundVariants` / `compoundSlots`: parent+child merge with index
 * signatures stripped, so props are always keyed by known literal axes and
 * cannot widen back to `string`. Guards against the historical
 * `| Record<string, ...>` constraint regression.
 */
type TVResolvedVariants<V extends TVVariantsShape, EV extends TVVariantsShape> =
  MergeVariantMaps<V, EV> extends infer Merged
    ? [Merged] extends [undefined]
      ? undefined
      : OmitIndexSignature<Merged>
    : never;

/** One compoundVariants entry (resolved parent+child axes). */
export type TVCompoundVariant<
  V extends TVVariantsShape,
  S extends TVSlots,
  B extends ClassValue,
  EV extends TVVariantsShape,
> = {
  [K in keyof TVResolvedVariants<V, EV> & string]?:
    | VariantValueWithBooleanUndefined<TVResolvedVariants<V, EV>, K>
    | Array<VariantValueWithBooleanUndefined<TVResolvedVariants<V, EV>, K>>;
} & ClassProp<SlotsClassValue<S, B> | ClassValue>;

export type TVCompoundVariants<
  V extends TVVariantsShape,
  S extends TVSlots,
  B extends ClassValue,
  EV extends TVVariantsShape,
  _ES extends TVSlots = undefined,
> = Array<TVCompoundVariant<V, S, B, EV>>;

/**
 * Per-element Soft Exact: {@link ExactShape} applied to each entry. Rejects
 * renamed or typo axes even when the array is held in a variable. Used for
 * `compoundVariants`; reuse for future array options (e.g. exact
 * `compoundSlots`) instead of adding a parallel implementation.
 */
type ExactArray<Shape, Actual extends readonly object[]> = {
  [I in keyof Actual]: Actual[I] extends object ? ExactShape<Shape, Actual[I]> : Actual[I];
};

/**
 * Variants of one parent recipe. Shared by the single-parent `EV` default and
 * the multi-parent fold.
 */
type ParentVariants<P> =
  P extends TVReturnTypeLike<infer PV extends TVVariantsShape, any> ? PV : undefined;

/**
 * Slots of one parent recipe, normalized to `TVSlots`. Shared by single-parent
 * (`ES` default, {@link SlotsOfExtend}) and multi-parent folds.
 */
type ParentSlots<P> = P extends TVReturnTypeLike<any, infer PS extends TVSlots> ? PS : undefined;

/**
 * Parent `slots` from any `extend` input (single recipe or parent list)
 * without reverse-inferring `ES` into a wide `TVSlots`.
 */
type SlotsOfExtend<E> = E extends readonly TVReturnTypeLike<any, any>[]
  ? MergedSlotsFromParents<E>
  : ParentSlots<E>;

type TVCompoundSlotVariantKeys<V extends TVVariantsShape, EV extends TVVariantsShape> = Exclude<
  keyof TVResolvedVariants<V, EV> & string,
  "slots" | "class" | "className"
>;

export type TVCompoundSlots<
  V extends TVVariantsShape,
  S extends TVSlots,
  B extends ClassValue,
  EV extends TVVariantsShape = undefined,
> = Array<
  {
    slots: Array<TVSlotsWithBase<S, B>>;
  } & {
    [K in TVCompoundSlotVariantKeys<V, EV>]?:
      | VariantValueWithBooleanUndefined<TVResolvedVariants<V, EV>, K>
      | Array<VariantValueWithBooleanUndefined<TVResolvedVariants<V, EV>, K>>;
  } & ClassProp
>;

export type TVDefaultVariants<
  V extends TVVariantsShape,
  _S extends TVSlots,
  EV extends TVVariantsShape,
  _ES extends TVSlots,
> = [TVResolvedVariants<V, EV>] extends [undefined]
  ? {}
  : {
      [K in keyof TVResolvedVariants<V, EV> & string]?: VariantValue<TVResolvedVariants<V, EV>, K>;
    };

export type TVScreenPropsValue<V extends TVVariantsShape, _S extends TVSlots, K extends keyof V> = {
  [Screen in TVScreens]?: StringToBoolean<keyof V[K] & string>;
};

/**
 * Props always read option unions from the resolved (merged) variant map so
 * overlapping parent axes produce `"sm" | "md" | "lg"` rather than a widened
 * `string` from an index-signature `V`.
 */
export type TVProps<
  V extends TVVariantsShape,
  _S extends TVSlots,
  EV extends TVVariantsShape,
  _ES extends TVSlots,
> = [TVResolvedVariants<V, EV>] extends [undefined]
  ? ClassProp<ClassValue>
  : Simplify<
      {
        [K in keyof TVResolvedVariants<V, EV> & string]?:
          | VariantValue<TVResolvedVariants<V, EV>, K>
          | undefined;
      } & ClassProp<ClassValue>
    >;

export type TVVariantKeys<V, _S = unknown> = [V] extends [undefined]
  ? undefined
  : Array<Extract<keyof V, string>>;

type TVMergedVariants<V extends TVVariantsShape, EV extends TVVariantsShape> = MergeVariantMaps<
  V,
  EV
>;

/** Accept a single parent recipe or a list of independent parent recipes. */
export type TVExtendInput<E extends TVReturnTypeLike<any, any> = TVReturnTypeLike<any, any>> =
  | E
  | readonly E[];

/**
 * Fold a parent list left-to-right with {@link MergeVariantMaps}. Mirrors
 * {@link MergedSlotsFromParents}; both read one parent via the shared
 * {@link ParentVariants} / {@link ParentSlots} extractors.
 */
type MergedVariantsFromParents<T extends readonly TVReturnTypeLike<any, any>[]> =
  T extends readonly [infer Head, ...infer Rest extends readonly TVReturnTypeLike<any, any>[]]
    ? Rest extends readonly []
      ? ParentVariants<Head>
      : MergeVariantMaps<ParentVariants<Head>, MergedVariantsFromParents<Rest>>
    : undefined;

/** Fold a parent list left-to-right with {@link TVMergedSlots}. */
type MergedSlotsFromParents<T extends readonly TVReturnTypeLike<any, any>[]> = T extends readonly [
  infer Head,
  ...infer Rest extends readonly TVReturnTypeLike<any, any>[],
]
  ? Rest extends readonly []
    ? ParentSlots<Head>
    : TVMergedSlots<ParentSlots<Head>, MergedSlotsFromParents<Rest>>
  : undefined;

export type TVExtend =
  | TVReturnTypeLike<any, any>
  | readonly TVReturnTypeLike<any, any>[]
  | undefined;

export interface TVReturnProps<
  V extends TVVariantsShape,
  S extends TVSlots,
  B extends ClassValue,
  EV extends TVVariantsShape,
  ES extends TVSlots,
  E extends TVExtend = undefined,
> {
  extend: E;
  base: B;
  slots: TVMergedSlots<S, ES>;
  variants: TVMergedVariants<V, EV>;
  defaultVariants: TVDefaultVariants<V, S, EV, ES>;
  compoundVariants: TVCompoundVariants<V, S, B, EV, ES>;
  compoundSlots: TVCompoundSlots<V, TVMergedSlots<S, ES>, B, EV>;
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
  E extends TVExtend = undefined,
> extends TVReturnProps<V, S, B, EV, ES, E> {
  (
    props?: TVProps<V, S, EV, ES>,
  ): HasSlots<S, ES> extends true
    ? Simplify<
        {
          [K in keyof (ES extends undefined ? {} : ES)]: (
            slotProps?: TVProps<V, S, EV, ES>,
          ) => string;
        } & {
          [K in keyof (S extends undefined ? {} : S)]: (
            slotProps?: TVProps<V, S, EV, ES>,
          ) => string;
        } & {
          [K in TVBaseName]: (slotProps?: TVProps<V, S, EV, ES>) => string;
        }
      >
    : string;
}
/** Non-empty parent list for multi-extend. */
export type TVExtendList = readonly [TVReturnTypeLike<any, any>, ...TVReturnTypeLike<any, any>[]];

/**
 * Keep the multi-parent overload out of resolution when `extend` is a single
 * recipe. Without this, failed single-parent calls also report a spurious
 * "not assignable to TVExtendList" from the last overload.
 */
type OnlyIfArrayExtend<O> = O extends {extend: readonly any[]} ? O : never;

type TVOptionsFields<
  V extends TVVariantsShape,
  DV,
  CV extends readonly object[],
  B extends ClassValue,
  S extends TVSlots,
  EV extends TVVariantsShape,
  ES extends TVSlots = undefined,
> = {
  /**
   * Base classes for the component.
   */
  base?: B;
  /**
   * Splits the component into named parts.
   * @see https://www.tailwind-variants.org/docs/slots
   */
  slots?: S;
  /**
   * Named variant axes and their options.
   * @see https://www.tailwind-variants.org/docs/variants#adding-variants
   */
  variants?: V;
  /**
   * Classes applied when several variants match at once.
   * Validated against resolved parent+child axes; excess keys are rejected,
   * even when the array is held in a variable.
   * @see https://www.tailwind-variants.org/docs/variants#compound-variants
   */
  compoundVariants?: CV & ExactArray<TVCompoundVariant<V, S, B, EV>, CV>;
  /**
   * Default value for each variant axis.
   * Soft Exact: `DV` stays inferrable from the value; renamed or typo axes are rejected.
   * @see https://www.tailwind-variants.org/docs/variants#default-variants
   */
  defaultVariants?: ExactShape<TVDefaultVariants<V, S, EV, ES>, DV>;
};

/**
 * `tv` factory signature.
 * Overload 1 (first): single parent or no extend; preserves legacy inference.
 * Overload 2: multi-parent `extend: [a, b, ...]` (tuple-preserving).
 *
 * `V` defaults to `{}` so omitting `variants` does not instantiate the
 * `Record` constraint as `V`, which would widen `VariantProps` to `string`.
 * `V` must not extend `TVVariants<..., EV, ES>`: that ties `V` to `E`
 * circularly and collapses parent axes when validating `compoundVariants`.
 *
 * `compoundSlots` reads parent slots from `E` / `ExtendList` directly (not the `ES`
 * type param) so slot names are not reverse-inferred into a wide `TVSlots`.
 *
 * NoInfer audit: `compoundSlots` is a validation-only position. Every type
 * parameter it mentions (`V`, `S`, `B`, `EV`, and the parent-derived types) is
 * wrapped in `NoInfer` so it can never become an inference site that broadens
 * parent axes or slots. `extend`, `variants`, `slots`, and `base` remain the
 * only inference sites for `E`/`ExtendList`, `V`, `S`, and `B` respectively.
 */
export interface TV {
  <
    V extends TVVariantsConstraint = {},
    DV = {},
    CV extends readonly object[] = [],
    B extends ClassValue = undefined,
    S extends TVSlots = undefined,
    // Defaults to `undefined` when `extend` is omitted. Do not default to
    // TVReturnTypeLike<V, S>: that duplicated variants in EV and cluttered hover tooltips.
    E extends TVReturnTypeLike<any, any> | undefined = undefined,
    EV extends TVVariantsShape = ParentVariants<E>,
    ES extends TVSlots = ParentSlots<E>,
  >(
    options: TVOptionsFields<V, DV, CV, B, S, EV, ES> & {
      /**
       * Extend merges one parent recipe into this definition.
       * Accepts a single {@link TVReturnTypeLike} (see also {@link TVExtendInput}).
       * @example tv({ extend: baseButton, base: "gap-2" })
       * @see https://www.tailwind-variants.org/docs/composing-components
       */
      extend?: E;
      /**
       * Classes applied to multiple slots at once.
       */
      compoundSlots?: TVCompoundSlots<
        NoInfer<V>,
        TVMergedSlots<NoInfer<S>, NoInfer<SlotsOfExtend<E>>>,
        NoInfer<B>,
        NoInfer<EV>
      >;
    },
    config?: TVConfig,
  ): TVReturnType<V, S, B, EV, ES, E>;

  <
    V extends TVVariantsConstraint = {},
    DV = {},
    CV extends readonly object[] = [],
    B extends ClassValue = undefined,
    S extends TVSlots = undefined,
    ExtendList extends TVExtendList = TVExtendList,
    EV extends TVVariantsShape = MergedVariantsFromParents<ExtendList>,
    ES extends TVSlots = MergedSlotsFromParents<ExtendList>,
  >(
    options: OnlyIfArrayExtend<
      Omit<TVOptionsFields<V, DV, CV, B, S, EV, ES>, "defaultVariants"> & {
        /**
         * Extend merges parent recipes left-to-right; child options win last.
         * Non-empty tuple only (`[]` is rejected at the type level).
         * @example tv({ extend: [focusable, animated], base: "inline-flex" })
         * @see https://www.tailwind-variants.org/docs/composing-components
         */
        extend: ExtendList;
        defaultVariants?: ExactShape<TVDefaultVariants<V, S, EV, ES>, DV>;
        compoundSlots?: TVCompoundSlots<
          NoInfer<V>,
          TVMergedSlots<NoInfer<S>, NoInfer<MergedSlotsFromParents<ExtendList>>>,
          NoInfer<B>,
          NoInfer<MergedVariantsFromParents<ExtendList>>
        >;
      }
    >,
    config?: TVConfig,
  ): TVReturnType<V, S, B, EV, ES, ExtendList>;
}

/** Lite `tv` factory (no per-call config). Same extend overloads as {@link TV}. */
export interface TVLite {
  <
    V extends TVVariantsConstraint = {},
    DV = {},
    CV extends readonly object[] = [],
    B extends ClassValue = undefined,
    S extends TVSlots = undefined,
    E extends TVReturnTypeLike<any, any> | undefined = undefined,
    EV extends TVVariantsShape = ParentVariants<E>,
    ES extends TVSlots = ParentSlots<E>,
  >(
    options: TVOptionsFields<V, DV, CV, B, S, EV, ES> & {
      /**
       * Extend merges one parent recipe into this definition.
       * Accepts a single {@link TVReturnTypeLike} (see also {@link TVExtendInput}).
       * @example tv({ extend: baseButton, base: "gap-2" })
       * @see https://www.tailwind-variants.org/docs/composing-components
       */
      extend?: E;
      compoundSlots?: TVCompoundSlots<
        NoInfer<V>,
        TVMergedSlots<NoInfer<S>, NoInfer<SlotsOfExtend<E>>>,
        NoInfer<B>,
        NoInfer<EV>
      >;
    },
  ): TVReturnType<V, S, B, EV, ES, E>;

  <
    V extends TVVariantsConstraint = {},
    DV = {},
    CV extends readonly object[] = [],
    B extends ClassValue = undefined,
    S extends TVSlots = undefined,
    ExtendList extends TVExtendList = TVExtendList,
    EV extends TVVariantsShape = MergedVariantsFromParents<ExtendList>,
    ES extends TVSlots = MergedSlotsFromParents<ExtendList>,
  >(
    options: OnlyIfArrayExtend<
      Omit<TVOptionsFields<V, DV, CV, B, S, EV, ES>, "defaultVariants"> & {
        /**
         * Extend merges parent recipes left-to-right; child options win last.
         * Non-empty tuple only (`[]` is rejected at the type level).
         * @example tv({ extend: [focusable, animated], base: "inline-flex" })
         * @see https://www.tailwind-variants.org/docs/composing-components
         */
        extend: ExtendList;
        defaultVariants?: ExactShape<TVDefaultVariants<V, S, EV, ES>, DV>;
        compoundSlots?: TVCompoundSlots<
          NoInfer<V>,
          TVMergedSlots<NoInfer<S>, NoInfer<MergedSlotsFromParents<ExtendList>>>,
          NoInfer<B>,
          NoInfer<MergedVariantsFromParents<ExtendList>>
        >;
      }
    >,
  ): TVReturnType<V, S, B, EV, ES, ExtendList>;
}

/**
 * Shared callable shape when collecting `tv` / `tvLite` / `createTV()` in one list.
 * Overloaded `TV | TVLite` unions are not directly callable in TypeScript.
 */
export type TVFactory = {
  (options: Record<string, any>, config?: TVConfig): any;
};

export type VariantProps<Component extends (...args: any) => any> = Omit<
  OmitUndefined<Parameters<Component>[0]>,
  "class" | "className"
>;
