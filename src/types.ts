import type {TVConfig, TVLiteConfig} from "./config.js";
import type {ClassNameValue as ClassValue} from "./internal/merge-engine/types.js";

export type {ClassValue};

export type ClassProp<V = ClassValue> =
  | {class?: V; className?: never}
  | {class?: never; className?: V};

type TVBaseName = "base";
type TVScreens = "initial";
type TVSlots = Record<string, ClassValue> | undefined;
type TVVariantsShape = Record<string, Record<string, unknown>> | undefined;

// Flatten intersections for readable IDE tooltips.
type Simplify<T> = {[K in keyof T]: T[K]} & {};

// Local stand-in for the TS 5.4 built-in `NoInfer`, so emitted declarations
// do not require TypeScript >= 5.4 in consuming projects.
type NoInfer<T> = [T][T extends unknown ? 0 : never];

// Remove index signatures, keeping only literal keys.
// Used on the {@link TVResolvedVariants} to `VariantProps` resolution path so a
// widened variants map (an explicit `TVVariants` annotation, or a future
// `| Record<string, ...>` constraint) cannot leak `string` keys into
// `VariantProps` again.
type OmitIndexSignature<T> = {
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : symbol extends K
        ? never
        : K]: T[K];
};

// Known literals plus a non-collapsing string fallback: `"a" | (string & {})`
// keeps autocompletion for `"a"` while accepting any string. Inlined to avoid
// a `type-fest` dependency. Applied only to relaxed axes that mix an index
// signature with literal keys; strict literal-only axes, and so strict
// `VariantProps`, are never touched.
type LiteralUnion<Literal extends string> = Literal | (string & Record<never, never>);

// Soft Exact: keys on `Actual` that are absent from `Shape` become `never`, so
// excess fields (e.g. renamed variant axes) error on the offending property
// itself, even when the value is held in a variable. Deliberately shallow; do
// not replace with a recursive Exact.
type ExactKeys<Shape, Actual> = Record<Exclude<keyof Actual, keyof Shape>, never>;

// Soft Exact applied to a value position: the leading `Actual &` keeps the
// value inferrable, `Shape` validates known keys, `ExactKeys` rejects excess.
// Used by `defaultVariants`.
type ExactShape<Shape, Actual> = Actual & Shape & ExactKeys<Shape, Actual>;

// Right (child) wins for an overlapping axis unless both sides are option
// maps, in which case their option keys union (matching runtime `mergeObjects`).
type MergeVariantOptions<Left, Right> = [Left, Right] extends [
  Record<string, unknown>,
  Record<string, unknown>,
]
  ? Simplify<Left & Right>
  : Right;

// Merge two variant maps the way runtime `mergeObjects` does for axes:
// union axis keys, and for overlapping axes union option keys.
// `undefined` on either side yields the other side unchanged.
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

// Normalize one option key, mapping boolean `true`/`false` keys to
// `"true"`/`"false"` so StringToBoolean can turn them into `boolean`. Numeric
// keys (e.g. spacing scales `{0: "", 2: ""}`) stay number literals.
type NormalizeVariantOptionKey<K> = K extends true | "true"
  ? "true"
  : K extends false | "false"
    ? "false"
    : K extends string | number
      ? K
      : never;

// Option keys of one axis. Strict literal-only axes resolve to their literal
// union. A relaxed axis authored with an index signature keeps its known
// literal keys via {@link LiteralUnion} (autocompletion preserved) instead of
// collapsing to bare `string`; a pure index-signature axis stays `string`.
type VariantOptionKeys<O> = string extends keyof O
  ? [keyof OmitIndexSignature<O>] extends [never]
    ? string
    : LiteralUnion<NormalizeVariantOptionKey<keyof OmitIndexSignature<O>>>
  : NormalizeVariantOptionKey<keyof O>;

// Prefer string option keys so array values do not leak `number` into props.
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

// Every declared slot plus the implicit `base`, which a recipe always exposes
// at runtime. A bare union, not a conditional on `B`: a deferred conditional
// would move diagnostics off the offending property onto the whole `tv()` call.
type TVSlotsWithBase<S extends TVSlots, _B extends ClassValue> = keyof S | TVBaseName;

// Slot names a slot-shaped class value may target, resolved across own (`S`)
// and parent (`ES`) slots. `never` for a recipe without slots: there an object
// class value is joined clsx-style (its *keys* become class names), so it is a
// bug rather than a slot map and every key is rejected.
type TVSlotClassKeys<S extends TVSlots, ES extends TVSlots> = [TVMergedSlots<S, ES>] extends [
  undefined,
]
  ? never
  : keyof TVMergedSlots<S, ES> | TVBaseName;

// Soft Exact for one class value: a slot map may only name known slots, while
// every other class form (string, array, falsy) passes through untouched.
// Unknown keys resolve to `never`, so they error on the offending property
// rather than on the whole object, even when the value is held in a variable.
type ExactSlotClass<Slots extends PropertyKey, Actual> = Actual extends readonly unknown[]
  ? Actual & ClassValue
  : Actual extends object
    ? Actual & Partial<Record<Slots, ClassValue>> & Record<Exclude<keyof Actual, Slots>, never>
    : Actual & ClassValue;

// Suggestion-only shape for a slot-shaped option value in `variants`: it names
// the resolved slots so the IDE can offer them while the value is still being
// typed (`ExactVariantSlots` maps over the inferred `V`, which has nothing to
// offer at that point). It must never reject anything; the exactness types do
// that. Not a conditional on `S`: a deferred conditional makes every value
// unassignable inside a generic wrapper around `tv()` (see `genericSlotWrapper`
// in `__tests__/__types__/excess-keys.ts`).
type SuggestSlotClass<Slots extends PropertyKey> = Partial<Record<Slots, ClassValue>> | ClassValue;

// Soft Exact applied to a `variants` map: validates the slot names used by
// every slot-shaped option value. `V` itself must stay an unconstrained
// inference site (see {@link TVVariantsConstraint}), so slot validation is
// intersected into the `variants` position instead of narrowing the constraint.
type ExactVariantSlots<Slots extends PropertyKey, Actual> = {
  [Axis in keyof Actual]: {
    [Option in keyof Actual[Axis]]: ExactSlotClass<Slots, Actual[Axis][Option]>;
  };
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

// Inference-only constraint for `V`: wide enough for slot-shaped option values,
// without referencing `E`/`EV`/`ES` (avoids circular inference that drops parent axes).
type TVVariantsConstraint = Record<string, Record<string, any>>;

// Resolution path feeding `TVProps` / `VariantProps` / `defaultVariants` /
// `compoundVariants` / `compoundSlots`: parent+child merge with index
// signatures stripped, so props are always keyed by known literal axes and
// cannot widen back to `string`. Guards against the historical
// `| Record<string, ...>` constraint regression.
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
 * {@link ExactCompoundClass} at the `compoundVariants` option: this type decides
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
> = TVCompoundVariantAxes<V, EV> & ClassProp<VariantClassValue<TVMergedSlots<S, ES>, B>>;

// Axis conditions of one compoundVariants entry, without the class props.
// `ExactCompoundArray` validates against `TVCompoundVariantAxes & ClassProp<unknown>`:
// `unknown` keeps `class` / `className` as known keys without adding members,
// so the IDE suggests slot names at `class: {` instead of the `String` prototype.
type TVCompoundVariantAxes<
  V extends TVVariantsShape,
  EV extends TVVariantsShape,
  Input extends boolean = false,
> = {
  [K in keyof TVResolvedVariants<V, EV> & string]?: CompoundCondition<
    VariantValueWithBooleanUndefined<TVResolvedVariants<V, EV>, K>,
    Input
  >;
};

// `tv()` input also takes readonly lists; exported types stay mutable.
type CompoundCondition<T, Input extends boolean> =
  | T
  | (Input extends true ? ReadonlyArray<T> : Array<T>);

export type TVCompoundVariants<
  V extends TVVariantsShape,
  S extends TVSlots,
  B extends ClassValue,
  EV extends TVVariantsShape,
  ES extends TVSlots = undefined,
> = Array<TVCompoundVariant<V, S, B, EV, ES>>;

// Keys of every union member; plain `keyof` keeps only the shared ones.
type KeysOfUnion<T> = T extends unknown ? keyof T : never;

type ValuesOfUnion<T, K extends PropertyKey> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : never
  : never;

// Unknown slot names become `never`, collected across all entries.
type ExactCompoundClass<Slots extends PropertyKey, Actual> =
  | ClassValue
  | (Partial<Record<Slots, ClassValue>> & {
      [K in Exclude<
        KeysOfUnion<Exclude<Extract<Actual, object>, readonly unknown[]>>,
        Slots
      >]?: never;
    });

type ExactCompoundItem<Shape, Slots extends PropertyKey, Item> = Shape & {
  [K in Exclude<KeysOfUnion<Item>, keyof Shape>]?: never;
} & {
  [K in "class" | "className"]?: ExactCompoundClass<Slots, ValuesOfUnion<Item, K>>;
};

// `any` entries (from a spread) are skipped so they do not widen the check.
type CompoundEntries<Actual extends readonly object[]> = {
  [I in keyof Actual]: 0 extends 1 & Actual[I] ? never : Actual[I];
}[number];

// Keys that are present (not optional) in at least one union member.
type RequiredKeysOfUnion<T> = T extends unknown
  ? {[K in keyof T]-?: {} extends Pick<T, K> ? never : K}[keyof T]
  : never;

// With `exactOptionalPropertyTypes` off, `?: never` still admits `key: undefined`.
type UnknownCompoundKeys<Shape, Item> = Exclude<RequiredKeysOfUnion<Item>, keyof Shape>;

// One shared target: per-entry targets make each element a union, which is quadratic.
type ExactCompoundArray<
  Shape,
  Slots extends PropertyKey,
  Actual extends readonly object[],
  Item = ExactCompoundItem<Shape, Slots, CompoundEntries<Actual>>,
> = [CompoundEntries<Actual>] extends [Item]
  ? [UnknownCompoundKeys<Shape, CompoundEntries<Actual>>] extends [never]
    ? // `Actual` infers `CV`; the array arm keeps union members that inference dropped.
      Actual | ReadonlyArray<Item>
    : ReadonlyArray<Item> & {
        [K in UnknownCompoundKeys<
          Shape,
          CompoundEntries<Actual>
        > as `unknown key: ${K & string}`]: never;
      }
  : ReadonlyArray<Item>;

// Variants of one parent recipe. Shared by the single-parent `EV` default and
// the multi-parent fold.
//
// The leading `[P] extends [undefined]` guard is mode-stable: with
// `strictNullChecks: false`, `undefined extends <object type>` is true, so the
// unguarded conditional would take the inference branch with no candidate and
// widen the result to its constraint. Same guard on {@link ParentSlots},
// {@link SlotsOfExtend}, and {@link VariantsOfExtend}.
type ParentVariants<P> = [P] extends [undefined]
  ? undefined
  : P extends TVReturnTypeLike<infer PV extends TVVariantsShape, any>
    ? PV
    : undefined;

// Slots of one parent recipe, normalized to `TVSlots`. Shared by single-parent
// (`ES` default, {@link SlotsOfExtend}) and multi-parent folds.
type ParentSlots<P> = [P] extends [undefined]
  ? undefined
  : P extends TVReturnTypeLike<any, infer PS extends TVSlots>
    ? PS
    : undefined;

// Parent `slots` from any `extend` input (single recipe or parent list)
// without reverse-inferring `ES` into a wide `TVSlots`.
type SlotsOfExtend<E> = [E] extends [undefined]
  ? undefined
  : E extends readonly TVReturnTypeLike<any, any>[]
    ? MergedSlotsFromParents<E>
    : ParentSlots<E>;

// Parent `variants` from any `extend` input (single recipe or parent list).
// Multi-parent lists fold left-to-right like the runtime.
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
> = Array<TVCompoundSlot<V, S, B, EV, false>>;

type TVCompoundSlot<
  V extends TVVariantsShape,
  S extends TVSlots,
  B extends ClassValue,
  EV extends TVVariantsShape,
  Input extends boolean,
> = {
  slots: Input extends true ? ReadonlyArray<TVSlotsWithBase<S, B>> : Array<TVSlotsWithBase<S, B>>;
} & {
  [K in TVCompoundSlotVariantKeys<V, EV>]?: CompoundCondition<
    VariantValueWithBooleanUndefined<TVResolvedVariants<V, EV>, K>,
    Input
  >;
} & ClassProp;

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

// Fold a parent list left-to-right with {@link MergeVariantMaps}. Mirrors
// {@link MergedSlotsFromParents}; both read one parent via the shared
// {@link ParentVariants} / {@link ParentSlots} extractors.
type MergedVariantsFromParents<T extends readonly TVReturnTypeLike<any, any>[]> =
  T extends readonly [infer Head, ...infer Rest extends readonly TVReturnTypeLike<any, any>[]]
    ? Rest extends readonly []
      ? ParentVariants<Head>
      : MergeVariantMaps<ParentVariants<Head>, MergedVariantsFromParents<Rest>>
    : undefined;

// Fold a parent list left-to-right with {@link TVMergedSlots}.
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
  // Base classes for the component.
  base?: B;
  // Splits the component into named parts.
  // @see https://www.tailwind-variants.org/docs/slots
  slots?: S;
  // Named variant axes and their options.
  // Soft Exact: `V` stays inferrable from the value, while slot-shaped option
  // values may only name declared slots (own or inherited) plus `base`.
  // The {@link SuggestSlotClass} arm adds nothing to validation; it exists so the
  // IDE suggests those slot names while the option value is being typed.
  // @see https://www.tailwind-variants.org/docs/variants#adding-variants
  variants?: V &
    Record<string, Record<string, SuggestSlotClass<TVSlotClassKeys<S, ES>>>> &
    ExactVariantSlots<TVSlotClassKeys<S, ES>, V>;
  // Classes applied when several variants match at once.
  // Validated against resolved parent+child axes; excess axes and unknown slot
  // names in `class` / `className` are rejected, even when the array is held in
  // a variable.
  // The {@link SuggestSlotClass} arm mirrors `variants`: validation-neutral, it
  // only makes the IDE suggest slot names inside `class` / `className`.
  // @see https://www.tailwind-variants.org/docs/variants#compound-variants
  compoundVariants?: ExactCompoundArray<
    TVCompoundVariantAxes<V, EV, true> & ClassProp<unknown>,
    TVSlotClassKeys<S, ES>,
    CV
  >;
  // Default value for each variant axis.
  // Soft Exact: `DV` stays inferrable from the value; renamed or typo axes are rejected.
  // @see https://www.tailwind-variants.org/docs/variants#default-variants
  defaultVariants?: ExactShape<TVDefaultVariants<V, S, EV, ES>, DV>;
};

type TVCompoundSlotsOption<
  V extends TVVariantsShape,
  B extends ClassValue,
  S extends TVSlots,
  E extends TVReturnTypeLike<any, any> | TVExtendList | undefined,
  EV extends TVVariantsShape,
> = ReadonlyArray<
  TVCompoundSlot<
    NoInfer<V>,
    TVMergedSlots<NoInfer<S>, NoInfer<SlotsOfExtend<E>>>,
    NoInfer<B>,
    NoInfer<EV>,
    true
  >
>;

/**
 * The options object `tv()` accepts, validated against its own variants and slots.
 * `compoundSlots` is validation-only: every type parameter it mentions is wrapped
 * in `NoInfer`, so `extend`, `variants`, `slots`, and `base` stay the only
 * inference sites.
 */
export type TVOptions<
  V extends TVVariantsShape,
  DV,
  CV extends readonly object[],
  B extends ClassValue,
  S extends TVSlots,
  E extends TVReturnTypeLike<any, any> | TVExtendList | undefined,
  EV extends TVVariantsShape = VariantsOfExtend<E>,
  ES extends TVSlots = SlotsOfExtend<E>,
> = TVOptionsFields<V, DV, CV, B, S, EV, ES> & {
  // Extend merges parent recipes into this definition; child options win.
  // Accepts a single {@link TVReturnTypeLike} or a non-empty list, merged
  // left-to-right (`[]` is rejected at the type level).
  // @example tv({ extend: baseButton, base: "gap-2" })
  // @example tv({ extend: [focusable, animated], base: "inline-flex" })
  // @see https://www.tailwind-variants.org/docs/composing-components
  extend?: E;
  // Classes applied to multiple slots at once.
  compoundSlots?: TVCompoundSlotsOption<V, B, S, E, EV>;
};

/**
 * The defaults written in `defaultVariants`, each typed as any value its variant
 * accepts, so app code can read one back (`reactive({ size: v.defaultVariants.size })`).
 */
type TVDefinedDefaults<
  V extends TVVariantsShape,
  DV,
  S extends TVSlots,
  EV extends TVVariantsShape,
  ES extends TVSlots,
> = {
  [K in keyof DV]: K extends keyof TVDefaultVariants<V, S, EV, ES>
    ? Exclude<TVDefaultVariants<V, S, EV, ES>[K], undefined>
    : DV[K];
};

/**
 * What {@link TVDefineVariants} returns: the fields that were written, as
 * required keys, with their literal types kept, so passing them to `tv()` infers
 * the same recipe as writing them inline. `defaultVariants` is typed from the
 * variants rather than from `DV`, which is inferred widened (`string`) and would
 * be rejected on the way back in.
 */
export type TVDefinedVariants<
  V extends TVVariantsShape,
  DV,
  CV extends readonly object[],
  B extends ClassValue,
  S extends TVSlots,
  E extends TVReturnTypeLike<any, any> | TVExtendList | undefined,
  EV extends TVVariantsShape = VariantsOfExtend<E>,
  ES extends TVSlots = SlotsOfExtend<E>,
> = Simplify<
  ([B] extends [undefined] ? {} : {base: B}) &
    ([S] extends [undefined] ? {} : {slots: S}) &
    (keyof V extends never ? {} : {variants: V}) &
    (CV extends readonly [] ? {} : {compoundVariants: CV}) &
    (keyof DV extends never ? {} : {defaultVariants: TVDefinedDefaults<V, DV, S, EV, ES>}) &
    ([E] extends [undefined] ? {} : {extend: E}) & {
      compoundSlots?: TVCompoundSlotsOption<V, B, S, E, EV>;
    }
>;

/** Anything {@link TVDefineVariants} can return, for `VariantProps` to accept. */
type TVDefinedVariantsLike = {
  base?: unknown;
  slots?: unknown;
  variants?: unknown;
  compoundVariants?: unknown;
  defaultVariants?: unknown;
  extend?: unknown;
  compoundSlots?: unknown;
};

/**
 * Identity helper that checks a `tv()` options object where it is written, for
 * options kept apart from the `tv()` call (a theme file, a shared preset, an
 * object an app overrides). Same generics and checks as `tv()`.
 */
export interface TVDefineVariants {
  <
    V extends TVVariantsConstraint = {},
    DV = {},
    const CV extends readonly object[] = [],
    B extends ClassValue = undefined,
    S extends TVSlots = undefined,
    E extends TVReturnTypeLike<any, any> | TVExtendList | undefined = undefined,
    EV extends TVVariantsShape = VariantsOfExtend<E>,
    ES extends TVSlots = SlotsOfExtend<E>,
  >(
    options: TVOptions<V, DV, CV, B, S, E, EV, ES>,
  ): TVDefinedVariants<V, DV, CV, B, S, E, EV, ES>;
}

// One call signature, not overloads: `E` covers no extend, one parent, or a
// parent list, and `VariantsOfExtend` / `SlotsOfExtend` derive `EV` / `ES`.
// That keeps contextual typing for wrappers and one error per failed call.
// `V` defaults to `{}` (a `Record` default would widen `VariantProps` to
// `string`) and must not extend `TVVariants<..., EV, ES>`, which ties `V` to
// `E` circularly. `compoundSlots` is validation-only: every type parameter it
// mentions is wrapped in `NoInfer`, so `extend`, `variants`, `slots`, and
// `base` stay the only inference sites.
/**
 * Full `tv` factory. `Config` is the per-call config shape: the default entry
 * accepts {@link TVConfig}, the `tailwind-variants/config` entry adds
 * `twMergeConfig`.
 */
export interface TV<Config extends TVConfig = TVConfig> {
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
    options: TVOptions<V, DV, CV, B, S, E, EV, ES>,
    config?: Config,
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
    options: TVOptions<V, DV, CV, B, S, E, EV, ES>,
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

// One field of options returned by `defineVariants`, or `D` when it was not written.
type TVDefinedField<T, K extends PropertyKey, C, D extends C> = T extends {
  [P in K]: infer X extends C;
}
  ? X
  : D;

// The recipe `tv()` would build from options returned by `defineVariants`, so
// `VariantProps` reads both through the same call signature.
type TVDefinedRecipe<
  V extends TVVariantsShape,
  S extends TVSlots,
  B extends ClassValue,
  E extends TVReturnTypeLike<any, any> | TVExtendList | undefined,
> = TVReturnType<V, S, B, VariantsOfExtend<E>, SlotsOfExtend<E>, E>;

type TVRecipeOf<T> = T extends (...args: any) => any
  ? T
  : TVDefinedRecipe<
      TVDefinedField<T, "variants", TVVariantsShape, {}>,
      TVDefinedField<T, "slots", TVSlots, undefined>,
      TVDefinedField<T, "base", ClassValue, undefined>,
      TVDefinedField<T, "extend", TVReturnTypeLike<any, any> | TVExtendList | undefined, undefined>
    >;

/**
 * Variant props of a recipe returned by `tv()`, or of options returned by
 * `defineVariants`, without calling `tv()` on them first.
 * @example
 * type ButtonProps = VariantProps<typeof button>;
 * type ButtonProps = VariantProps<typeof buttonTheme>; // same type
 */
export type VariantProps<Component extends ((...args: any) => any) | TVDefinedVariantsLike> = Omit<
  OmitUndefined<Parameters<TVRecipeOf<Component>>[0]>,
  "class" | "className"
>;
