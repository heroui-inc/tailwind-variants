import type {TVConfig, TVLiteConfig} from "./config.js";
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

/**
 * Slot names addressable by name: every declared slot plus the implicit `base`
 * slot. A recipe always exposes `base` at runtime, whether or not a root `base`
 * class was given (asserted by "always returns the implicit base slot" in
 * `__tests__/tv-slots.test.ts`), so `base` is unconditional here.
 *
 * Deliberately a bare union, not a conditional on `B`: a conditional stays
 * deferred while `S` is generic, which moves overload diagnostics off the
 * offending property and onto the whole `tv()` call. Whether an object class
 * value is admissible at all is decided by {@link TVSlotClassKeys}.
 */
type TVSlotsWithBase<S extends TVSlots, _B extends ClassValue> = keyof S | TVBaseName;

/**
 * Slot names a slot-shaped class value may target, resolved across own (`S`)
 * and parent (`ES`) slots. `never` for a recipe without slots: there an object
 * class value is joined clsx-style (its *keys* become class names), so it is a
 * bug rather than a slot map and every key is rejected.
 */
type TVSlotClassKeys<S extends TVSlots, ES extends TVSlots> = [TVMergedSlots<S, ES>] extends [
  undefined,
]
  ? never
  : keyof TVMergedSlots<S, ES> | TVBaseName;

/**
 * Soft Exact for one class value: a slot map may only name known slots, while
 * every other class form (string, array, falsy) passes through untouched.
 * Unknown keys resolve to `never`, so they error on the offending property
 * rather than on the whole object, even when the value is held in a variable.
 */
type ExactSlotClass<Slots extends PropertyKey, Actual> = Actual extends readonly unknown[]
  ? Actual & ClassValue
  : Actual extends object
    ? Actual & Partial<Record<Slots, ClassValue>> & Record<Exclude<keyof Actual, Slots>, never>
    : Actual & ClassValue;

/**
 * Suggestion-only contextual shape for a slot-shaped class value: the type that
 * makes an IDE offer slot names inside a `variants` option value.
 *
 * Needed only in the `variants` position. {@link ExactVariantSlots} is mapped
 * over the *inferred* `V`, so while an option value is still being typed there
 * is nothing concrete for the language service to offer and the position falls
 * back to global scope. This type names the resolved slots directly, so
 * completions appear. `compoundVariants` needs no counterpart: its `class` /
 * `className` are already described concretely by {@link TVCompoundVariant},
 * which {@link ExactCompoundArray} intersects in as its `Shape`.
 *
 * Deliberately permissive: it must never be the type that rejects anything.
 * The `| ClassValue` arm keeps strings, arrays and falsy values assignable, and
 * the slot keys come from {@link TVSlotClassKeys} (already resolved) rather than
 * from a conditional on `S`. A conditional such as {@link VariantClassValue}
 * stays deferred when `S` is an unresolved type parameter, which would make
 * every value unassignable inside a generic wrapper around `tv()`
 * (regression-tested by `genericSlotWrapper` in
 * `__tests__/__types__/excess-keys.ts`). Rejection stays the exactness types' job.
 */
type SuggestSlotClass<Slots extends PropertyKey> = Partial<Record<Slots, ClassValue>> | ClassValue;

/**
 * Soft Exact applied to a `variants` map: validates the slot names used by
 * every slot-shaped option value. `V` itself must stay an unconstrained
 * inference site (see {@link TVVariantsConstraint}), so slot validation is
 * intersected into the `variants` position instead of narrowing the constraint.
 */
type ExactVariantSlots<Slots extends PropertyKey, Actual> = {
  [Axis in keyof Actual]: {
    [Option in keyof Actual[Axis]]: ExactSlotClass<Slots, Actual[Axis][Option]>;
  };
};

/**
 * Soft Exact applied to the `class` / `className` of one compoundVariants entry.
 *
 * The `?` is required, not cosmetic. Mixing `class` and `className` across
 * entries widens the array's element type to a union, and `keyof` a union keeps
 * only the keys common to every member — which is *both* `class` and
 * `className`, since {@link ClassProp} gives each entry the other one as
 * `never`. Without `?` this mapped type would then demand both on every entry
 * and reject an ordinary mixed array.
 */
type ExactSlotClassProp<Slots extends PropertyKey, Actual> = {
  [K in Extract<keyof Actual, "class" | "className">]?: ExactSlotClass<Slots, Actual[K]>;
};

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

/**
 * One compoundVariants entry (resolved parent+child axes).
 *
 * The class value spans own *and* inherited slots: a compound entry may target
 * any slot the recipe exposes, exactly like a variant option value. `ES`
 * defaults to `undefined` so the historical four-argument form still resolves
 * to own slots only.
 *
 * Keep the slot set here in sync with the {@link TVSlotClassKeys} passed to
 * {@link ExactSlotClassProp} at the `compoundVariants` option: this type decides
 * what the IDE *suggests*, that one decides what is *rejected*. When they drift,
 * valid slots stop being suggested (inherited slots did, before `ES` was
 * threaded through).
 */
export type TVCompoundVariant<
  V extends TVVariantsShape,
  S extends TVSlots,
  B extends ClassValue,
  EV extends TVVariantsShape,
  ES extends TVSlots = undefined,
> = TVCompoundVariantAxes<V, EV> & ClassProp<SlotsClassValue<TVMergedSlots<S, ES>, B> | ClassValue>;

/**
 * Axis conditions of one compoundVariants entry, without the class props.
 *
 * Split out so {@link ExactCompoundArray} can validate an entry against
 * `TVCompoundVariantAxes & ClassProp<unknown>`. Pairing the axes with a class
 * value of `unknown` keeps `class` / `className` as *known* keys — excess-key
 * checks and their mutual exclusivity both still work — while contributing
 * nothing to their value type.
 *
 * That matters for IDE completions. `ExactShape` intersects the entry being
 * typed with this shape, and an intersection surfaces the members of every
 * constituent. A class value of `SlotsClassValue | ClassValue` therefore dragged
 * the whole `String` prototype (`at`, `charAt`, `length`, …) into the suggestion
 * list at `class: {`, ranked above the slot names. `unknown` contributes no
 * members, leaving {@link ExactSlotClassProp} as the single source of both the
 * value's validation and its slot-name suggestions.
 */
type TVCompoundVariantAxes<V extends TVVariantsShape, EV extends TVVariantsShape> = {
  [K in keyof TVResolvedVariants<V, EV> & string]?:
    | VariantValueWithBooleanUndefined<TVResolvedVariants<V, EV>, K>
    | Array<VariantValueWithBooleanUndefined<TVResolvedVariants<V, EV>, K>>;
};

export type TVCompoundVariants<
  V extends TVVariantsShape,
  S extends TVSlots,
  B extends ClassValue,
  EV extends TVVariantsShape,
  ES extends TVSlots = undefined,
> = Array<TVCompoundVariant<V, S, B, EV, ES>>;

/**
 * Per-element Soft Exact for `compoundVariants`: {@link ExactShape} rejects
 * renamed or typo axes, {@link ExactSlotClassProp} rejects unknown slot names
 * inside that entry's `class` / `className`. Both survive the array being held
 * in a variable. Reuse for future array options instead of adding a parallel
 * implementation.
 */
type ExactCompoundArray<Shape, Slots extends PropertyKey, Actual extends readonly object[]> = {
  [I in keyof Actual]: Actual[I] extends object
    ? ExactShape<Shape, Actual[I]> & ExactSlotClassProp<Slots, Actual[I]>
    : Actual[I];
};

/**
 * Variants of one parent recipe. Shared by the single-parent `EV` default and
 * the multi-parent fold.
 *
 * The leading `[P] extends [undefined]` guard is mode-stable: with
 * `strictNullChecks: false`, `undefined extends <object type>` is true, so the
 * unguarded conditional would take the inference branch with no candidate and
 * widen the result to its constraint. Same guard on {@link ParentSlots},
 * {@link SlotsOfExtend}, and {@link VariantsOfExtend}.
 */
type ParentVariants<P> = [P] extends [undefined]
  ? undefined
  : P extends TVReturnTypeLike<infer PV extends TVVariantsShape, any>
    ? PV
    : undefined;

/**
 * Slots of one parent recipe, normalized to `TVSlots`. Shared by single-parent
 * (`ES` default, {@link SlotsOfExtend}) and multi-parent folds.
 */
type ParentSlots<P> = [P] extends [undefined]
  ? undefined
  : P extends TVReturnTypeLike<any, infer PS extends TVSlots>
    ? PS
    : undefined;

/**
 * Parent `slots` from any `extend` input (single recipe or parent list)
 * without reverse-inferring `ES` into a wide `TVSlots`.
 */
type SlotsOfExtend<E> = [E] extends [undefined]
  ? undefined
  : E extends readonly TVReturnTypeLike<any, any>[]
    ? MergedSlotsFromParents<E>
    : ParentSlots<E>;

/**
 * Parent `variants` from any `extend` input (single recipe or parent list).
 * Multi-parent lists fold left-to-right like the runtime.
 */
type VariantsOfExtend<E> = [E] extends [undefined]
  ? undefined
  : E extends readonly TVReturnTypeLike<any, any>[]
    ? MergedVariantsFromParents<E>
    : ParentVariants<E>;

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

type TVSlotCall<Props> = (slotProps?: Props) => string;

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
          [K in keyof (ES extends undefined ? {} : ES)]: TVSlotCall<TVProps<V, S, EV, ES>>;
        } & {
          [K in keyof (S extends undefined ? {} : S)]: TVSlotCall<TVProps<V, S, EV, ES>>;
        } & {
          [K in TVBaseName]: TVSlotCall<TVProps<V, S, EV, ES>>;
        }
      >
    : string;
}
/** Non-empty parent list for multi-extend. */
export type TVExtendList = readonly [TVReturnTypeLike<any, any>, ...TVReturnTypeLike<any, any>[]];

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
   * Soft Exact: `V` stays inferrable from the value, while slot-shaped option
   * values may only name declared slots (own or inherited) plus `base`.
   * The {@link SuggestSlotClass} arm adds nothing to validation; it exists so the
   * IDE suggests those slot names while the option value is being typed.
   * @see https://www.tailwind-variants.org/docs/variants#adding-variants
   */
  variants?: V &
    Record<string, Record<string, SuggestSlotClass<TVSlotClassKeys<S, ES>>>> &
    ExactVariantSlots<TVSlotClassKeys<S, ES>, V>;
  /**
   * Classes applied when several variants match at once.
   * Validated against resolved parent+child axes; excess axes and unknown slot
   * names in `class` / `className` are rejected, even when the array is held in
   * a variable.
   * The {@link SuggestSlotClass} arm mirrors `variants`: validation-neutral, it
   * only makes the IDE suggest slot names inside `class` / `className`.
   * @see https://www.tailwind-variants.org/docs/variants#compound-variants
   */
  compoundVariants?: CV &
    ExactCompoundArray<
      TVCompoundVariantAxes<V, EV> & ClassProp<unknown>,
      TVSlotClassKeys<S, ES>,
      CV
    >;
  /**
   * Default value for each variant axis.
   * Soft Exact: `DV` stays inferrable from the value; renamed or typo axes are rejected.
   * @see https://www.tailwind-variants.org/docs/variants#default-variants
   */
  defaultVariants?: ExactShape<TVDefaultVariants<V, S, EV, ES>, DV>;
};

/**
 * `tv` factory signature. A single call signature: `E` covers no extend
 * (`undefined`), a single parent, or a non-empty parent list, and
 * {@link VariantsOfExtend} / {@link SlotsOfExtend} derive `EV` / `ES` for
 * whichever shape was passed. One signature (rather than overloads) keeps
 * contextual typing for wrappers (`const tv: TV = (options, config) => ...`)
 * and produces one coherent error per failed call. Parent lists still infer
 * as tuples: the `TVExtendList` arm of `E`'s constraint provides the tuple
 * inference context for array literals.
 *
 * `V` defaults to `{}` so omitting `variants` does not instantiate the
 * `Record` constraint as `V`, which would widen `VariantProps` to `string`.
 * `V` must not extend `TVVariants<..., EV, ES>`: that ties `V` to `E`
 * circularly and collapses parent axes when validating `compoundVariants`.
 *
 * `compoundSlots` reads parent slots from `E` directly (not the `ES` type
 * param) so slot names are not reverse-inferred into a wide `TVSlots`.
 *
 * NoInfer audit: `compoundSlots` is a validation-only position. Every type
 * parameter it mentions (`V`, `S`, `B`, `EV`, and the parent-derived types) is
 * wrapped in `NoInfer` so it can never become an inference site that broadens
 * parent axes or slots. `extend`, `variants`, `slots`, and `base` remain the
 * only inference sites for `E`, `V`, `S`, and `B` respectively.
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
    E extends TVReturnTypeLike<any, any> | TVExtendList | undefined = undefined,
    EV extends TVVariantsShape = VariantsOfExtend<E>,
    ES extends TVSlots = SlotsOfExtend<E>,
  >(
    options: TVOptionsFields<V, DV, CV, B, S, EV, ES> & {
      /**
       * Extend merges parent recipes into this definition; child options win.
       * Accepts a single {@link TVReturnTypeLike} or a non-empty list, merged
       * left-to-right (`[]` is rejected at the type level).
       * @example tv({ extend: baseButton, base: "gap-2" })
       * @example tv({ extend: [focusable, animated], base: "inline-flex" })
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
}

/** Lite `tv` factory. Per-call config accepts `twMerge` only. */
export interface TVLite {
  <
    V extends TVVariantsConstraint = {},
    DV = {},
    CV extends readonly object[] = [],
    B extends ClassValue = undefined,
    S extends TVSlots = undefined,
    E extends TVReturnTypeLike<any, any> | TVExtendList | undefined = undefined,
    EV extends TVVariantsShape = VariantsOfExtend<E>,
    ES extends TVSlots = SlotsOfExtend<E>,
  >(
    options: TVOptionsFields<V, DV, CV, B, S, EV, ES> & {
      /**
       * Extend merges parent recipes into this definition; child options win.
       * Accepts a single {@link TVReturnTypeLike} or a non-empty list, merged
       * left-to-right (`[]` is rejected at the type level).
       * @example tv({ extend: baseButton, base: "gap-2" })
       * @example tv({ extend: [focusable, animated], base: "inline-flex" })
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
    config?: TVLiteConfig,
  ): TVReturnType<V, S, B, EV, ES, E>;
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
