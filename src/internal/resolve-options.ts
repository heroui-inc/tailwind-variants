import type {TVConfig} from "../config.js";
import {cx, flatMergeArrays, isEmptyObject, isEqual, joinObjects, mergeObjects} from "../utils.js";
import {defaultConfig} from "./default-config.js";
import {state} from "./state.js";
import type {
  AnyRecord,
  CompiledCompoundSlot,
  CompiledCompoundVariant,
  CompiledState,
  CompiledVariant,
  CompoundIndex,
  ResolvedOptions,
} from "./types.js";

const synchronizeTwMergeConfig = (config: TVConfig): void => {
  if (
    !isEmptyObject(config.twMergeConfig) &&
    !isEqual(config.twMergeConfig as object, state.cachedTwMergeConfig)
  ) {
    state.didTwMergeConfigChange = true;
    state.cachedTwMergeConfig = config.twMergeConfig!;
  }
};

/**
 * A record with no prototype, so a consumer-supplied key never reads back an inherited member.
 *
 * `Object.create(null)` rather than the `{__proto__: null}` literal, which is faster in V8 but
 * only typechecks against a record whose values admit `null` — and none of these do. Every caller
 * here is a compile-time path, where the difference is unmeasurable.
 */
const createNullRecord = <TValue>(): Record<string, TValue> => Object.create(null);

const compileVariants = (variants: AnyRecord, variantKeys: string[]): CompiledVariant[] => {
  const compiledVariants: CompiledVariant[] = [];

  for (let i = 0; i < variantKeys.length; i++) {
    const key = variantKeys[i];
    const values = variants[key];

    compiledVariants.push({key, values, isEmpty: isEmptyObject(values)});
  }

  return compiledVariants;
};

/**
 * Which keys a compound conditions on, read from the compound itself.
 *
 * `slots` is a condition on a compound VARIANT and metadata on a compound SLOT, which is the only
 * difference between the two — so it is one parameter rather than two near-identical loops that
 * can drift apart.
 */
const compileConditionKeys = (source: AnyRecord, withSlots: boolean): string[] => {
  const conditionKeys: string[] = [];

  for (const key in source) {
    if (key === "class" || key === "className") continue;
    if (withSlots && key === "slots") continue;

    conditionKeys.push(key);
  }

  return conditionKeys;
};

/**
 * The wrapper shape, in one place.
 *
 * Both callers below build the same thing from different inputs — one from the consumer's raw
 * array, one from a previous index's entries — and the thing they build is what must not drift.
 */
const compileCompound = (source: AnyRecord, withSlots: boolean): CompiledCompoundVariant => ({
  conditionKeys: compileConditionKeys(source, withSlots),
  source,
});

const compileCompounds = (compounds: unknown, withSlots: boolean): CompiledCompoundVariant[] => {
  if (!Array.isArray(compounds) || compounds.length === 0) return [];
  const result: CompiledCompoundVariant[] = [];

  for (let i = 0; i < compounds.length; i++) result.push(compileCompound(compounds[i], withSlots));

  return result;
};

const recompileCompounds = (
  compounds: CompiledCompoundVariant[],
  withSlots: boolean,
): CompiledCompoundVariant[] => {
  const result: CompiledCompoundVariant[] = [];

  // A NEW wrapper per entry, never a write into the old one: a reader holding the previous index
  // has to keep seeing a consistent view of it. The `source` is the consumer's own object and is
  // deliberately shared, which is what lets change detection keep watching it.
  for (let i = 0; i < compounds.length; i++) {
    result.push(compileCompound(compounds[i].source, withSlots));
  }

  return result;
};

/**
 * Every prop name a resolved class string can depend on: `matchesConditions` reads exactly
 * `conditionKeys`, and every other prop read goes through `variantKeys`.
 *
 * Copied even when there is nothing to add, because `variantKeys` is also published as
 * `component.variantKeys`. Handing the same array back would put a consumer-reachable object in
 * the path that builds every cache key — a `push` on a public property would then quietly change
 * which props a component's results are keyed by.
 */
export const collectDependencyKeys = (
  variantKeys: string[],
  compoundVariants: CompiledCompoundVariant[],
  compoundSlots: CompiledCompoundSlot[],
): string[] => {
  if (compoundVariants.length === 0 && compoundSlots.length === 0) return [...variantKeys];

  const keys = [...variantKeys];
  const seen: Record<string, 1> = createNullRecord();

  for (let i = 0; i < variantKeys.length; i++) seen[variantKeys[i]] = 1;

  const collectFrom = (compounds: CompiledCompoundVariant[]): void => {
    for (let i = 0; i < compounds.length; i++) {
      const {conditionKeys} = compounds[i];

      for (let j = 0; j < conditionKeys.length; j++) {
        const key = conditionKeys[j];

        if (seen[key]) continue;

        seen[key] = 1;
        keys.push(key);
      }
    }
  };

  collectFrom(compoundVariants);
  collectFrom(compoundSlots);

  return keys;
};

// Shared, and never written to — the loop below is the only writer and it does not run for an
// empty list. Most definitions have no compound slots at all, and they should pay neither the
// allocation nor the dictionary-mode cost a null-prototype object carries in V8.
//
// Exported so the resolver's placeholder index uses THIS empty record rather than a second one.
// Null-prototype is the property that matters: a plain `{}` reports a dozen `Object.prototype`
// members as present, so a slot named `constructor` would read `Object` out of an index that
// holds nothing — and one empty record with the right prototype cannot drift from another.
export const EMPTY_SLOT_INDEX: Record<string, CompiledCompoundSlot[]> = createNullRecord();

const indexCompoundSlotsBySlot = (
  compiledCompoundSlots: CompiledCompoundSlot[],
): Record<string, CompiledCompoundSlot[]> => {
  if (compiledCompoundSlots.length === 0) return EMPTY_SLOT_INDEX;

  // A slot named after an `Object.prototype` member — `toString`, `constructor`, `valueOf` —
  // otherwise finds the inherited value truthy in the guard below, so the array is never created
  // and the push throws. Slot names are consumer strings, and `{}` reports a dozen of them as
  // already present.
  const index: Record<string, CompiledCompoundSlot[]> = createNullRecord();

  for (let i = 0; i < compiledCompoundSlots.length; i++) {
    const compoundSlot = compiledCompoundSlots[i];
    const slots = compoundSlot.source.slots;

    if (!Array.isArray(slots)) continue;

    for (let j = 0; j < slots.length; j++) {
      const slotKey = slots[j];

      if (!index[slotKey]) index[slotKey] = [];
      index[slotKey].push(compoundSlot);
    }
  }

  return index;
};

const buildCompoundIndex = (
  compoundVariants: CompiledCompoundVariant[],
  compoundSlots: CompiledCompoundSlot[],
): CompoundIndex => ({
  compoundVariants,
  compoundSlots,
  bySlot: indexCompoundSlotsBySlot(compoundSlots),
});

/**
 * Re-derives every consequence of the compounds' condition key SETS, as one new index.
 *
 * Those key sets are captured when the definition compiles, and they are mutable metadata like
 * the rest of it — deleting a key widens a compound, adding one narrows it. The tracker records
 * them, so a change is detected; this is what makes the detection take effect rather than being
 * noticed and ignored.
 *
 * Everything derived moves at once, because refreshing part of it is worse than refreshing none.
 * `conditionKeys` is what the matcher reads and `bySlot` is what the slot computers render from;
 * a reader that saw one refreshed and the other not would match a compound and then fail to find
 * the slot it applies to. The caller's `collectDependencyKeys` result is the third derivation and
 * is assigned in the same step for the same reason — a stale dependency list leaves an added key
 * out of the cache key AND out of the props the computers see, which fails in opposite directions
 * on the two paths.
 */
export const refreshCompoundIndex = (previous: CompoundIndex): CompoundIndex =>
  buildCompoundIndex(
    recompileCompounds(previous.compoundVariants, false),
    recompileCompounds(previous.compoundSlots, true),
  );

export const resolveOptions = (options: AnyRecord, configProp?: TVConfig): ResolvedOptions => {
  const {
    extend = null,
    slots: slotProps = {},
    variants: variantsProps = {},
    compoundVariants: compoundVariantsProps = [],
    compoundSlots: compoundSlotsProps = [],
    defaultVariants: defaultVariantsProps = {},
  } = options;

  const config = {...defaultConfig, ...configProp};
  const hasSlots = options.slots !== undefined;
  const base = extend?.base ? cx(extend.base, options?.base) : options?.base;
  const variants =
    extend?.variants && !isEmptyObject(extend.variants)
      ? mergeObjects(variantsProps, extend.variants)
      : variantsProps;
  const defaultVariants =
    extend?.defaultVariants && !isEmptyObject(extend.defaultVariants)
      ? {...extend.defaultVariants, ...defaultVariantsProps}
      : defaultVariantsProps;

  synchronizeTwMergeConfig(config);

  const isExtendedSlotsEmpty = !extend?.slots || isEmptyObject(extend.slots);
  const componentBase = hasSlots
    ? isExtendedSlotsEmpty && extend?.base
      ? cx(options?.base, extend.base)
      : typeof options?.base === "string" || options?.base == null
        ? options.base
        : cx(options.base)
    : undefined;
  const componentSlots = hasSlots
    ? {
        base: componentBase,
        ...slotProps,
      }
    : {};
  const slots = isExtendedSlotsEmpty
    ? componentSlots
    : joinObjects(
        {...extend?.slots},
        isEmptyObject(componentSlots) ? {base: options?.base} : componentSlots,
      );
  const compoundVariants =
    !extend?.compoundVariants || isEmptyObject(extend.compoundVariants)
      ? compoundVariantsProps
      : flatMergeArrays(extend?.compoundVariants, compoundVariantsProps);
  const compoundSlots =
    !extend?.compoundSlots || isEmptyObject(extend.compoundSlots)
      ? compoundSlotsProps
      : flatMergeArrays(extend?.compoundSlots, compoundSlotsProps);
  const variantKeys = Object.keys(variants);
  const deferredError =
    compoundVariants && !Array.isArray(compoundVariants)
      ? new TypeError(
          `The "compoundVariants" prop must be an array. Received: ${typeof compoundVariants}`,
        )
      : compoundSlots && !Array.isArray(compoundSlots)
        ? new TypeError(
            `The "compoundSlots" prop must be an array. Received: ${typeof compoundSlots}`,
          )
        : null;
  const mode =
    hasSlots || !isExtendedSlotsEmpty ? "slots" : variantKeys.length === 0 ? "plain" : "variants";

  return {
    config,
    extend,
    base,
    variants,
    defaultVariants,
    slots,
    compoundVariants,
    compoundSlots,
    compiled: null,
    deferredError,
    mode,
    variantKeys,
  };
};

/**
 * Compiles a definition once and hands back the result.
 *
 * Returning the compiled state rather than the mutated options object is what removes the
 * assertions at every consumer: the return type IS the proof that all of it is present.
 */
export const compileResolvedOptions = (resolved: ResolvedOptions): CompiledState => {
  if (resolved.compiled !== null) return resolved.compiled;

  resolved.compiled = {
    variants: compileVariants(resolved.variants, resolved.variantKeys),
    compounds: buildCompoundIndex(
      compileCompounds(resolved.compoundVariants, false),
      compileCompounds(resolved.compoundSlots, true),
    ),
    slotKeys: Object.keys(resolved.slots),
    // Copied, because `resolved.variantKeys` is published as `component.variantKeys` — see the
    // field's own note. Taken in the same pass as `compileVariants` above, off the same array.
    variantKeys: [...resolved.variantKeys],
  };

  return resolved.compiled;
};
