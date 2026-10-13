import type {
  AnyRecord,
  CompiledCompoundSlot,
  CompiledCompoundVariant,
  CompiledVariant,
  MergeAdapter,
  NormalizedOption,
  ResolvedOptions,
  RuntimeComponent,
  RuntimeResult,
} from "./types.js";

import {falsyToString} from "../utils.js";

import {
  buildCompoundsSignature,
  CACHE_MISS,
  createLazyOverrideMerge,
  createPropsCache,
  UNCACHEABLE,
} from "./cache.js";
import {
  compileResolvedOptions,
  invalidateCompoundClasses,
  normalizeClassValue,
  normalizeCompoundClasses,
  normalizeCompoundSlotClasses,
  normalizeVariantOption,
} from "./resolve-options.js";

const EMPTY_ARRAY: never[] = [];

// Gathered class strings for one merge. Filled and handed to the merge
// adapter in the same synchronous step, so a single module-level list serves
// every recipe; the adapter reads it and never keeps it.
const partsScratch: string[] = [];

export const getCompleteProps = (
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  slotProps?: AnyRecord,
): AnyRecord => {
  const result: AnyRecord = {};

  for (const key in defaultVariants) {
    result[key] = defaultVariants[key];
  }

  if (props) {
    for (const key in props) {
      if (props[key] !== undefined) result[key] = props[key];
    }
  }

  if (slotProps) {
    for (const key in slotProps) {
      if (slotProps[key] !== undefined) result[key] = slotProps[key];
    }
  }

  return result;
};

// Effective value of one prop: defaults, then props, then slot props.
const resolvePropValue = (
  key: string,
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  slotProps?: AnyRecord,
): unknown => {
  let value = defaultVariants[key];

  if (props && props[key] !== undefined) value = props[key];
  if (slotProps && slotProps[key] !== undefined) value = slotProps[key];

  return value;
};

const isNullishOrFalse = (value: any): boolean => value == null || value === false;

const matchesCompoundValue = (expected: any, actual: any): boolean => {
  if (!Array.isArray(expected)) {
    return expected === actual || (isNullishOrFalse(expected) && isNullishOrFalse(actual));
  }

  for (let i = 0; i < expected.length; i++) {
    const expectedValue = expected[i];

    if (expectedValue === actual || (isNullishOrFalse(expectedValue) && isNullishOrFalse(actual))) {
      return true;
    }
  }

  return false;
};

// Option key a variant resolves to when its prop is unset (its default).
const defaultOptionKey = (defaultVariants: AnyRecord, key: string): string => {
  const option = falsyToString(defaultVariants[key]);

  return `${option || "false"}`;
};

// Normalized classes of the option a variant resolves to, or "" when nothing
// applies. Slot mode may return a per-slot map.
const getVariantValue = (
  variant: CompiledVariant,
  defaultVariants: AnyRecord,
  props: AnyRecord | undefined,
  slotProps: AnyRecord | undefined,
  slotMode: boolean,
): NormalizedOption => {
  if (variant.isEmpty) return "";

  const variantProp = slotProps?.[variant.key] ?? props?.[variant.key];

  if (variantProp === null) return "";

  const variantKey = falsyToString(variantProp);

  if (typeof variantKey === "object") return "";

  const defaultVariantProp = defaultVariants?.[variant.key];
  const key = variantKey != null ? variantKey : falsyToString(defaultVariantProp);
  const optionKey = (key || "false") as string;
  const raw = variant.values[optionKey];

  if (!raw) return "";
  // A string option is already normalized and keeps its identity for as long
  // as the recipe holds that instance, so the merge layer's argument cache can
  // hit on it directly. Only arrays and slot objects need a normalized copy.
  if (typeof raw === "string") return raw;

  // Same raw value as last time: reuse the normalized copy (stable identity).
  // A replaced value re-normalizes, so in-place option edits stay visible.
  const from = variant.normalizedFrom;

  if (from !== null && from[optionKey] === raw) return variant.normalized![optionKey]!;

  return normalizeVariantOption(variant, optionKey, raw, slotMode);
};

// Classes of a slot-mode option for one slot ("" when none).
const optionForSlot = (option: NormalizedOption, slotKey: string): string => {
  if (typeof option === "string") return slotKey === "base" ? option : "";

  return option[slotKey] ?? "";
};

// Compound conditions against the effective props, without building a props object.
export const matchesConditions = (
  compound: {conditionKeys: string[]; source: AnyRecord},
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  slotProps?: AnyRecord,
): boolean => {
  const {conditionKeys, source} = compound;

  for (let i = 0; i < conditionKeys.length; i++) {
    const key = conditionKeys[i];

    if (
      !matchesCompoundValue(source[key], resolvePropValue(key, defaultVariants, props, slotProps))
    ) {
      return false;
    }
  }

  return true;
};

export const pushCompoundClassForSlot = (result: any[], slotKey: string, classValue: any): void => {
  if (typeof classValue === "string") {
    if (slotKey === "base") result.push(classValue);
  } else if (Array.isArray(classValue)) {
    if (slotKey === "base") result.push(...classValue);
  } else if (classValue && typeof classValue === "object" && classValue[slotKey]) {
    result.push(classValue[slotKey]);
  }
};

// Append the normalized classes of every applicable variant (variants mode). Returns the new count.
export const pushVariantClasses = (
  list: string[],
  count: number,
  variants: CompiledVariant[],
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  keyedOut?: Record<string, string> | null,
): number => {
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const value = getVariantValue(variant, defaultVariants, props, undefined, false) as string;

    if (value) {
      list[count++] = value;
      if (keyedOut) keyedOut[variant.key] = value;
    }
  }

  return count;
};

// Append the normalized classes of every applicable variant for one slot. Returns the new count.
export const pushVariantClassesBySlot = (
  list: string[],
  count: number,
  slotKey: string,
  variants: CompiledVariant[],
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  slotProps?: AnyRecord,
  keyedOut?: Record<string, string> | null,
): number => {
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const value = optionForSlot(
      getVariantValue(variant, defaultVariants, props, slotProps, true),
      slotKey,
    );

    if (value) {
      list[count++] = value;
      if (keyedOut) keyedOut[variant.key] = value;
    }
  }

  return count;
};

const pushCompoundVariantClasses = (
  list: string[],
  count: number,
  compoundVariants: CompiledCompoundVariant[],
  defaultVariants: AnyRecord,
  props?: AnyRecord,
): number => {
  for (let i = 0; i < compoundVariants.length; i++) {
    const compoundVariant = compoundVariants[i];
    let classes = compoundVariant.classes;

    if (classes === "") continue;
    if (!matchesConditions(compoundVariant, defaultVariants, props)) continue;
    // Normalized on first match only, so unused compounds cost nothing.
    if (classes === null)
      classes = compoundVariant.classes = normalizeCompoundClasses(compoundVariant.source);
    if (classes) list[count++] = classes;
  }

  return count;
};

const pushCompoundVariantClassesBySlot = (
  list: string[],
  count: number,
  slotKey: string,
  compoundVariants: CompiledCompoundVariant[],
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  slotProps?: AnyRecord,
): number => {
  for (let i = 0; i < compoundVariants.length; i++) {
    const compoundVariant = compoundVariants[i];
    let slotClasses = compoundVariant.slotClasses;

    if (slotClasses !== null && !slotClasses[slotKey]) continue;
    if (!matchesConditions(compoundVariant, defaultVariants, props, slotProps)) continue;
    // Normalized on first match only, so unused compounds cost nothing.
    if (slotClasses === null) {
      slotClasses = compoundVariant.slotClasses = normalizeCompoundSlotClasses(
        compoundVariant.source,
      );
    }

    const classes = slotClasses[slotKey];

    if (classes) list[count++] = classes;
  }

  return count;
};

const pushCompoundSlotClasses = (
  list: string[],
  count: number,
  compoundSlotsForKey: CompiledCompoundSlot[],
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  slotProps?: AnyRecord,
): number => {
  for (let i = 0; i < compoundSlotsForKey.length; i++) {
    const compoundSlot = compoundSlotsForKey[i];
    let classes = compoundSlot.classes;

    if (classes === "") continue;
    if (!matchesConditions(compoundSlot, defaultVariants, props, slotProps)) continue;
    if (classes === null)
      classes = compoundSlot.classes = normalizeCompoundClasses(compoundSlot.source);
    if (classes) list[count++] = classes;
  }

  return count;
};

// How an invocation relates to the recipe's defaults.
const DYNAMIC = 0;
const STATIC = 1;
const STATIC_WITH_OVERRIDE = 2;

type PropsKind = typeof DYNAMIC | typeof STATIC | typeof STATIC_WITH_OVERRIDE;

// Compound condition keys, built on the first call that carries a key outside the variants.
type ConditionKeys = Record<string, 1>;

const collectConditionKeys = (
  compoundVariants: CompiledCompoundVariant[],
  compoundSlots: CompiledCompoundSlot[],
): ConditionKeys => {
  const conditions: ConditionKeys = Object.create(null);

  for (let i = 0; i < compoundVariants.length; i++) {
    const keys = compoundVariants[i].conditionKeys;

    for (let j = 0; j < keys.length; j++) conditions[keys[j]] = 1;
  }
  for (let i = 0; i < compoundSlots.length; i++) {
    const keys = compoundSlots[i].conditionKeys;

    for (let j = 0; j < keys.length; j++) conditions[keys[j]] = 1;
  }

  return conditions;
};

// Static props resolve exactly like no props at all: every declared variant is
// unset or equals its default, and no compound condition key is present. Keys
// that are neither variants nor conditions cannot change the classes and are
// ignored. A `class` / `className` override does not make props dynamic; it
// is merged onto the static core afterwards. Nothing is allocated here, and a
// plain string or boolean mismatch bails out on a single compare.
const classifyProps = (
  props: AnyRecord,
  variants: AnyRecord,
  defaultVariants: AnyRecord,
  getConditions: () => ConditionKeys,
): PropsKind => {
  let kind: PropsKind = STATIC;

  for (const key in props) {
    const value = props[key];

    if (key === "class" || key === "className") {
      if (value != null && value !== "") kind = STATIC_WITH_OVERRIDE;
      continue;
    }
    if (value === undefined) continue;
    if (variants[key] === undefined) {
      if (getConditions()[key]) return DYNAMIC;
      continue;
    }

    const fallback = defaultVariants[key];

    if (value === fallback) continue;
    if (value === null) return DYNAMIC;

    const type = typeof value;

    if (type === typeof fallback && (type === "string" || type === "boolean")) {
      // same type, different value: only "" and a missing default can still
      // meet on the "false" option key, everything else is a real difference
      if (value !== "" && fallback !== "") return DYNAMIC;
    }

    const option = falsyToString(value);

    if (typeof option === "object") return DYNAMIC;
    if (`${option || "false"}` !== defaultOptionKey(defaultVariants, key)) return DYNAMIC;
  }

  return kind;
};

// What a static core was built from. The core is reused only while every
// default and every default option value still has the same identity, so
// in-place metadata edits are picked up on the next call.
type StaticSnapshot = {
  defaults: unknown[];
  optionKeys: string[];
  options: unknown[];
};

const createSnapshot = (): StaticSnapshot => ({defaults: [], optionKeys: [], options: []});

const snapshotStatic = (
  variants: CompiledVariant[],
  defaultVariants: AnyRecord,
  snapshot: StaticSnapshot,
): void => {
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const optionKey = defaultOptionKey(defaultVariants, variant.key);

    snapshot.defaults[i] = defaultVariants[variant.key];
    snapshot.optionKeys[i] = optionKey;
    snapshot.options[i] = variant.isEmpty ? undefined : variant.values[optionKey];
  }
};

const isStaticFresh = (
  variants: CompiledVariant[],
  defaultVariants: AnyRecord,
  snapshot: StaticSnapshot,
): boolean => {
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];

    if (defaultVariants[variant.key] !== snapshot.defaults[i]) return false;
    if (!variant.isEmpty && variant.values[snapshot.optionKeys[i]] !== snapshot.options[i]) {
      return false;
    }
  }

  return true;
};

const createPlainResolver = (resolved: ResolvedOptions, merge: MergeAdapter): RuntimeComponent => {
  const {base, deferredError} = resolved;
  let core: string | typeof CACHE_MISS = CACHE_MISS;
  const mergeOverride = createLazyOverrideMerge(merge);

  return ((props?: AnyRecord): RuntimeResult => {
    if (deferredError) throw deferredError;

    if (core === CACHE_MISS) {
      const baseClasses = normalizeClassValue(base);

      partsScratch[0] = baseClasses;
      core = merge.parts(partsScratch, baseClasses ? 1 : 0);
    }

    return mergeOverride(core, props);
  }) as RuntimeComponent;
};

const createVariantResolver = (
  resolved: ResolvedOptions,
  merge: MergeAdapter,
): RuntimeComponent => {
  const {base, defaultVariants, deferredError, variantKeys, variants} = resolved;
  let compiledCompoundVariants = resolved.compiledCompoundVariants;
  let compiledVariants = resolved.compiledVariants;
  let compiledCompoundSlots: CompiledCompoundSlot[] = EMPTY_ARRAY;
  let baseClasses = "";
  let hasCompounds = false;
  let conditionKeys: ConditionKeys | null = null;
  let cache: ReturnType<typeof createPropsCache<string>> | null = null;
  let lastCompoundsSig: string | null = null;
  const mergeOverride = createLazyOverrideMerge(merge);
  // First invoke skips cache.
  let coldInvokesRemaining = 1;
  // Pre-merged result for default props, returned by reference.
  let staticCore: string | null = null;
  let staticSnapshot: StaticSnapshot | null = null;

  const ensureCompiled = () => {
    if (compiledVariants === null || compiledCompoundVariants === null) {
      compileResolvedOptions(resolved);
      compiledVariants = resolved.compiledVariants!;
      compiledCompoundVariants = resolved.compiledCompoundVariants!;
      compiledCompoundSlots = resolved.compiledCompoundSlots ?? EMPTY_ARRAY;
      baseClasses = normalizeClassValue(base);
      hasCompounds = compiledCompoundVariants.length > 0 || compiledCompoundSlots.length > 0;
    }
  };

  const getConditionKeys = (): ConditionKeys =>
    (conditionKeys ??= collectConditionKeys(compiledCompoundVariants!, compiledCompoundSlots));

  const computeCore = (props?: AnyRecord) => {
    const list = partsScratch;
    let count = 0;

    if (baseClasses) list[count++] = baseClasses;
    count = pushVariantClasses(list, count, compiledVariants!, defaultVariants, props);
    if (compiledCompoundVariants!.length > 0) {
      count = pushCompoundVariantClasses(
        list,
        count,
        compiledCompoundVariants!,
        defaultVariants,
        props,
      );
    }

    return merge.parts(list, count);
  };

  // Rebuilt each call so in-place compound metadata mutations are detected.
  // Returns false when the metadata cannot be serialized; nothing may be
  // cached then, and normalized compound classes are rebuilt from the source.
  const syncCompounds = (): boolean => {
    const compoundsSig = buildCompoundsSignature(compiledCompoundVariants!, compiledCompoundSlots);

    if (compoundsSig === null) {
      invalidateCompoundClasses(compiledCompoundVariants!, compiledCompoundSlots);

      return false;
    }

    if (compoundsSig !== lastCompoundsSig) {
      lastCompoundsSig = compoundsSig;
      invalidateCompoundClasses(compiledCompoundVariants!, compiledCompoundSlots);
      cache = null;
      staticCore = null;
    }

    return true;
  };

  const getStaticCore = (): string => {
    if (
      staticCore === null ||
      !isStaticFresh(compiledVariants!, defaultVariants, staticSnapshot!)
    ) {
      staticCore = computeCore(undefined);
      snapshotStatic(compiledVariants!, defaultVariants, (staticSnapshot ??= createSnapshot()));
    }

    return staticCore;
  };

  return ((props?: AnyRecord): RuntimeResult => {
    if (deferredError) throw deferredError;

    ensureCompiled();

    const kind =
      props == null ? STATIC : classifyProps(props, variants, defaultVariants, getConditionKeys);

    if (kind !== DYNAMIC) {
      let core: string;

      if (!hasCompounds) {
        coldInvokesRemaining = 0;
        core = getStaticCore();
      } else if (coldInvokesRemaining > 0) {
        // Cold call: compounds are not signed yet, so nothing is kept.
        coldInvokesRemaining = 0;
        core = computeCore(props);
      } else if (!syncCompounds()) {
        core = computeCore(props);
      } else {
        core = getStaticCore();
      }

      return kind === STATIC_WITH_OVERRIDE ? mergeOverride(core, props) : core;
    }

    let core: string;

    if (coldInvokesRemaining > 0) {
      coldInvokesRemaining--;
      core = computeCore(props);
    } else if (hasCompounds && !syncCompounds()) {
      core = computeCore(props);
    } else {
      cache ??= createPropsCache<string>(variantKeys);

      const cached = cache.get(defaultVariants, props);

      if (cached === UNCACHEABLE) {
        core = computeCore(props);
      } else if (cached !== CACHE_MISS) {
        core = cached;
      } else {
        core = computeCore(props);
        cache.set(defaultVariants, props, undefined, core);
      }
    }

    return mergeOverride(core, props);
  }) as RuntimeComponent;
};

type SlotsResult = Record<string, (slotProps?: AnyRecord) => string>;
type SlotComputer = (propsRef?: AnyRecord, slotProps?: AnyRecord) => string;

const createSlotsResolver = (resolved: ResolvedOptions, merge: MergeAdapter): RuntimeComponent => {
  const {defaultVariants, deferredError, slots, variantKeys, variants: variantMap} = resolved;

  let variants: CompiledVariant[] | null = null;
  let compoundVariants: CompiledCompoundVariant[] | null = null;
  let compoundSlots: CompiledCompoundSlot[] | null = null;
  let keys: string[] | null = null;
  let slotComputers: SlotComputer[] | null = null;
  let hasCompounds = false;
  let conditionKeys: ConditionKeys | null = null;
  let mergeOverride: ReturnType<typeof createLazyOverrideMerge> | null = null;
  let parentCache: ReturnType<typeof createPropsCache<SlotsResult>> | null = null;
  let lastCompoundsSig: string | null = null;
  // First parent invoke skips fingerprint/cache setup (lifecycle create+call once).
  let coldParentInvokesRemaining = 1;
  // Slot functions over each slot's pre-merged default core, returned by reference.
  let staticResult: SlotsResult | null = null;
  let staticSnapshot: StaticSnapshot | null = null;
  let staticSlotSources: unknown[] | null = null;

  const ensureCompiled = () => {
    if (keys !== null) return;

    if (
      resolved.compiledVariants === null ||
      resolved.compiledCompoundVariants === null ||
      resolved.compiledCompoundSlots === null ||
      resolved.compiledCompoundSlotsBySlot === null ||
      resolved.slotKeys === null
    ) {
      compileResolvedOptions(resolved);
    }

    variants = resolved.compiledVariants!;
    compoundVariants = resolved.compiledCompoundVariants!;
    compoundSlots = resolved.compiledCompoundSlots!;
    const compoundSlotsBySlot = resolved.compiledCompoundSlotsBySlot!;
    keys = resolved.slotKeys!;
    hasCompounds = compoundVariants.length > 0 || compoundSlots.length > 0;
    mergeOverride = createLazyOverrideMerge(merge);

    // One computer per slot for the lifetime of this tv() instance.
    const computers: SlotComputer[] = new Array(keys.length);

    for (let i = 0; i < keys.length; i++) {
      const slotKey = keys[i];
      const compoundSlotsForKey = compoundSlotsBySlot[slotKey] ?? EMPTY_ARRAY;
      // The slot's own classes are read live (in-place slot edits stay
      // visible), but keep their normalized identity while unchanged.
      let slotSource: unknown = undefined;
      let slotClasses = "";

      computers[i] = (propsRef, slotProps) => {
        const list = partsScratch;
        let count = 0;
        const source = slots[slotKey];

        if (source !== slotSource) {
          slotSource = source;
          slotClasses = normalizeClassValue(source);
        }
        if (slotClasses) list[count++] = slotClasses;

        count = pushVariantClassesBySlot(
          list,
          count,
          slotKey,
          variants!,
          defaultVariants,
          propsRef,
          slotProps,
        );

        if (hasCompounds) {
          count = pushCompoundVariantClassesBySlot(
            list,
            count,
            slotKey,
            compoundVariants!,
            defaultVariants,
            propsRef,
            slotProps,
          );
          count = pushCompoundSlotClasses(
            list,
            count,
            compoundSlotsForKey,
            defaultVariants,
            propsRef,
            slotProps,
          );
        }

        return merge.parts(list, count);
      };
    }

    slotComputers = computers;
  };

  const createSlotsResult = (props?: AnyRecord): SlotsResult => {
    const slotKeys = keys!;
    const computers = slotComputers!;
    const overrideMerge = mergeOverride!;
    const result: SlotsResult = {};

    for (let i = 0; i < slotKeys.length; i++) {
      const compute = computers[i];
      // Capture parent props for this result instance (not shared mutable state).
      const core = compute(props, undefined);

      result[slotKeys[i]] = (slotProps) => {
        if (slotProps == null) return core;

        let hasVariantOverride = false;

        for (const key in slotProps) {
          if (key === "class" || key === "className") continue;
          if (slotProps[key] !== undefined) {
            hasVariantOverride = true;
            break;
          }
        }

        if (!hasVariantOverride) {
          return overrideMerge(core, slotProps);
        }

        return overrideMerge(compute(props, slotProps), slotProps);
      };
    }

    return result;
  };

  const syncCompounds = (): boolean => {
    const compoundsSig = buildCompoundsSignature(compoundVariants!, compoundSlots!);

    if (compoundsSig === null) {
      invalidateCompoundClasses(compoundVariants!, compoundSlots!);

      return false;
    }

    if (compoundsSig !== lastCompoundsSig) {
      lastCompoundsSig = compoundsSig;
      invalidateCompoundClasses(compoundVariants!, compoundSlots!);
      parentCache = null;
      staticResult = null;
    }

    return true;
  };

  const getConditionKeys = (): ConditionKeys =>
    (conditionKeys ??= collectConditionKeys(compoundVariants!, compoundSlots!));

  const isStaticResultFresh = (): boolean => {
    if (!isStaticFresh(variants!, defaultVariants, staticSnapshot!)) return false;

    const slotKeys = keys!;
    const sources = staticSlotSources!;

    for (let i = 0; i < slotKeys.length; i++) {
      if (slots[slotKeys[i]] !== sources[i]) return false;
    }

    return true;
  };

  const getStaticResult = (): SlotsResult => {
    if (staticResult === null || !isStaticResultFresh()) {
      staticResult = createSlotsResult(undefined);
      snapshotStatic(variants!, defaultVariants, (staticSnapshot ??= createSnapshot()));

      const slotKeys = keys!;
      const sources = (staticSlotSources ??= []);

      for (let i = 0; i < slotKeys.length; i++) sources[i] = slots[slotKeys[i]];
    }

    return staticResult;
  };

  return ((props?: AnyRecord): RuntimeResult => {
    if (deferredError) throw deferredError;

    ensureCompiled();

    // A parent `class` / `className` never reaches a slot, so static props
    // with an override are still static here.
    const kind =
      props == null ? STATIC : classifyProps(props, variantMap, defaultVariants, getConditionKeys);

    if (kind !== DYNAMIC) {
      if (!hasCompounds) {
        coldParentInvokesRemaining = 0;

        return getStaticResult();
      }
      if (coldParentInvokesRemaining > 0) {
        coldParentInvokesRemaining = 0;

        return createSlotsResult(props);
      }
      if (!syncCompounds()) return createSlotsResult(props);

      return getStaticResult();
    }

    // Cold path: avoid fingerprint/compoundsSig/Map overhead on first invoke.
    if (coldParentInvokesRemaining > 0) {
      coldParentInvokesRemaining--;

      return createSlotsResult(props);
    }

    if (hasCompounds && !syncCompounds()) return createSlotsResult(props);

    parentCache ??= createPropsCache<SlotsResult>(variantKeys);

    const cached = parentCache.get(defaultVariants, props);

    if (cached === UNCACHEABLE) {
      return createSlotsResult(props);
    }

    if (cached !== CACHE_MISS) return cached;

    const next = createSlotsResult(props);

    parentCache.set(defaultVariants, props, undefined, next);

    return next;
  }) as RuntimeComponent;
};

export const createClassResolver = (
  resolved: ResolvedOptions,
  merge: MergeAdapter,
): RuntimeComponent => {
  if (resolved.mode === "plain") return createPlainResolver(resolved, merge);

  let resolver: RuntimeComponent | undefined;

  // Defer slots/variants resolver setup until first call so tv() construction stays cheap.
  return ((props?: AnyRecord): RuntimeResult => {
    resolver ??=
      resolved.mode === "slots"
        ? createSlotsResolver(resolved, merge)
        : createVariantResolver(resolved, merge);

    return resolver(props);
  }) as RuntimeComponent;
};
