import {falsyToString} from "../utils.js";
import {
  buildCompoundsSignature,
  buildPropsFingerprint,
  CACHE_MISS,
  createBoundedCache,
  createLazyOverrideMerge,
  createResultCache,
  type ResultCache,
} from "./cache.js";
import {compileResolvedOptions} from "./resolve-options.js";
import type {
  AnyRecord,
  CnAdapter,
  CompiledCompoundSlot,
  CompiledCompoundVariant,
  CompiledVariant,
  ResolvedOptions,
  RuntimeComponent,
  RuntimeResult,
} from "./types.js";

const EMPTY_ARRAY: never[] = [];

const variantClassesScratch: any[] = [];
const compoundClassesScratch: any[] = [];
const compoundVariantBySlotScratch: any[] = [];
const compoundSlotClassesScratch: any[] = [];

const getCompleteProps = (
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

const getVariantValue = (
  variant: CompiledVariant,
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  slotProps?: AnyRecord,
): any => {
  if (variant.isEmpty) return null;

  const variantProp = slotProps?.[variant.key] ?? props?.[variant.key];

  if (variantProp === null) return null;

  const variantKey = falsyToString(variantProp);

  if (typeof variantKey === "object") return null;

  const defaultVariantProp = defaultVariants?.[variant.key];
  const key = variantKey != null ? variantKey : falsyToString(defaultVariantProp);

  return variant.values[key || "false"];
};

const matchesConditions = (
  compound: CompiledCompoundVariant,
  completeProps: AnyRecord,
): boolean => {
  const {conditionKeys, source} = compound;

  for (let i = 0; i < conditionKeys.length; i++) {
    const key = conditionKeys[i];

    if (!matchesCompoundValue(source[key], completeProps[key])) return false;
  }

  return true;
};

const pushCompoundClassForSlot = (result: any[], slotKey: string, classValue: any): void => {
  if (typeof classValue === "string") {
    if (slotKey === "base") result.push(classValue);
  } else if (classValue && typeof classValue === "object" && classValue[slotKey]) {
    result.push(classValue[slotKey]);
  }
};

const getVariantClassNames = (
  variants: CompiledVariant[],
  defaultVariants: AnyRecord,
  props?: AnyRecord,
): any[] => {
  const result = variantClassesScratch;

  result.length = 0;

  for (let i = 0; i < variants.length; i++) {
    const value = getVariantValue(variants[i], defaultVariants, props);

    if (value) result.push(value);
  }

  return result;
};

const getVariantClassNamesBySlot = (
  slotKey: string,
  variants: CompiledVariant[],
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  slotProps?: AnyRecord,
): any[] => {
  const result = variantClassesScratch;

  result.length = 0;

  for (let i = 0; i < variants.length; i++) {
    const variantValue = getVariantValue(variants[i], defaultVariants, props, slotProps);
    const value =
      slotKey === "base" && typeof variantValue === "string"
        ? variantValue
        : variantValue && variantValue[slotKey];

    if (value) result.push(value);
  }

  return result;
};

const getCompoundVariantClasses = (
  compoundVariants: CompiledCompoundVariant[],
  completeProps: AnyRecord,
): any[] => {
  const result = compoundClassesScratch;

  result.length = 0;

  for (let i = 0; i < compoundVariants.length; i++) {
    const compoundVariant = compoundVariants[i];

    if (!matchesConditions(compoundVariant, completeProps)) continue;
    if (compoundVariant.source.class) result.push(compoundVariant.source.class);
    if (compoundVariant.source.className) result.push(compoundVariant.source.className);
  }

  return result;
};

const getCompoundVariantClassesBySlot = (
  slotKey: string,
  compoundVariants: CompiledCompoundVariant[],
  completeProps: AnyRecord,
): any[] => {
  const result = compoundVariantBySlotScratch;

  result.length = 0;

  for (let i = 0; i < compoundVariants.length; i++) {
    const compoundVariant = compoundVariants[i];

    if (!matchesConditions(compoundVariant, completeProps)) continue;

    pushCompoundClassForSlot(result, slotKey, compoundVariant.source.class);
    pushCompoundClassForSlot(result, slotKey, compoundVariant.source.className);
  }

  return result;
};

const getCompoundSlotClasses = (
  compoundSlotsForKey: CompiledCompoundSlot[],
  completeProps: AnyRecord,
): any[] => {
  const result = compoundSlotClassesScratch;

  result.length = 0;

  for (let i = 0; i < compoundSlotsForKey.length; i++) {
    const compoundSlot = compoundSlotsForKey[i];

    if (!matchesConditions(compoundSlot, completeProps)) continue;

    if (compoundSlot.source.class) result.push(compoundSlot.source.class);
    if (compoundSlot.source.className) result.push(compoundSlot.source.className);
  }

  return result;
};

const createPlainResolver = (resolved: ResolvedOptions, cn: CnAdapter): RuntimeComponent => {
  const {base, config} = resolved;
  let core: string | undefined | typeof CACHE_MISS = CACHE_MISS;
  const mergeOverride = createLazyOverrideMerge(cn, config);

  return ((props?: AnyRecord): RuntimeResult => {
    if (core === CACHE_MISS) {
      core = cn(config, base);
    }

    return mergeOverride(core, props);
  }) as RuntimeComponent;
};

const createVariantResolver = (resolved: ResolvedOptions, cn: CnAdapter): RuntimeComponent => {
  const {base, config, defaultVariants, deferredError, variantKeys} = resolved;
  let compiledCompoundVariants = resolved.compiledCompoundVariants;
  let compiledVariants = resolved.compiledVariants;
  let compiledCompoundSlots: CompiledCompoundSlot[] = EMPTY_ARRAY;
  let cache: ResultCache | null = null;
  const mergeOverride = createLazyOverrideMerge(cn, config);
  // First invoke skips cache.
  let coldInvokesRemaining = 1;

  const computeCore = (props?: AnyRecord) => {
    const compoundClasses =
      compiledCompoundVariants!.length > 0
        ? getCompoundVariantClasses(
            compiledCompoundVariants!,
            getCompleteProps(defaultVariants, props),
          )
        : undefined;

    return cn(
      config,
      base,
      getVariantClassNames(compiledVariants!, defaultVariants, props),
      compoundClasses,
    );
  };

  return ((props?: AnyRecord): RuntimeResult => {
    if (deferredError) throw deferredError;
    if (compiledVariants === null || compiledCompoundVariants === null) {
      compileResolvedOptions(resolved);
      compiledVariants = resolved.compiledVariants!;
      compiledCompoundVariants = resolved.compiledCompoundVariants!;
      compiledCompoundSlots = resolved.compiledCompoundSlots ?? EMPTY_ARRAY;
    }

    let core: string | undefined;

    if (coldInvokesRemaining > 0) {
      coldInvokesRemaining--;
      core = computeCore(props);
    } else {
      cache ??= createResultCache();

      const propsFingerprint = buildPropsFingerprint(variantKeys, defaultVariants, props);

      if (propsFingerprint !== null) {
        const compoundsSig =
          compiledCompoundVariants.length > 0 || compiledCompoundSlots.length > 0
            ? buildCompoundsSignature(compiledCompoundVariants, compiledCompoundSlots)
            : "";
        const cacheKey = propsFingerprint + "#" + compoundsSig;
        const cached = cache.get(cacheKey);

        if (cached !== CACHE_MISS) {
          core = cached;
        } else {
          core = computeCore(props);
          cache.set(cacheKey, core);
        }
      } else {
        core = computeCore(props);
      }
    }

    return mergeOverride(core, props);
  }) as RuntimeComponent;
};

type SlotsResult = Record<string, (slotProps?: AnyRecord) => string | undefined>;
type SlotComputer = (propsRef?: AnyRecord, slotProps?: AnyRecord) => string | undefined;

const createSlotsResolver = (resolved: ResolvedOptions, cn: CnAdapter): RuntimeComponent => {
  const {config, defaultVariants, deferredError, slots, variantKeys} = resolved;

  let compoundVariants: CompiledCompoundVariant[] | null = null;
  let compoundSlots: CompiledCompoundSlot[] | null = null;
  let keys: string[] | null = null;
  let slotComputers: SlotComputer[] | null = null;
  let hasCompounds = false;
  let mergeOverride: ReturnType<typeof createLazyOverrideMerge> | null = null;
  let parentCache: ReturnType<typeof createBoundedCache<SlotsResult>> | null = null;
  // First parent invoke skips fingerprint/cache setup (lifecycle create+call once).
  let coldParentInvokesRemaining = 1;

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

    const variants = resolved.compiledVariants!;
    compoundVariants = resolved.compiledCompoundVariants!;
    compoundSlots = resolved.compiledCompoundSlots!;
    const compoundSlotsBySlot = resolved.compiledCompoundSlotsBySlot!;
    keys = resolved.slotKeys!;
    hasCompounds = compoundVariants.length > 0 || compoundSlots.length > 0;
    mergeOverride = createLazyOverrideMerge(cn, config);

    // One computer per slot for the lifetime of this tv() instance.
    const computers: SlotComputer[] = new Array(keys.length);

    for (let i = 0; i < keys.length; i++) {
      const slotKey = keys[i];
      const compoundSlotsForKey = compoundSlotsBySlot[slotKey] ?? EMPTY_ARRAY;

      computers[i] = (propsRef, slotProps) => {
        const completeProps = hasCompounds
          ? getCompleteProps(defaultVariants, propsRef, slotProps)
          : undefined;
        const compoundVariantClasses = completeProps
          ? getCompoundVariantClassesBySlot(slotKey, compoundVariants!, completeProps)
          : undefined;
        const compoundSlotClasses = completeProps
          ? getCompoundSlotClasses(compoundSlotsForKey, completeProps)
          : undefined;

        return cn(
          config,
          slots[slotKey],
          getVariantClassNamesBySlot(slotKey, variants, defaultVariants, propsRef, slotProps),
          compoundVariantClasses,
          compoundSlotClasses,
        );
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
      const core = compute(props);

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

  return ((props?: AnyRecord): RuntimeResult => {
    if (deferredError) throw deferredError;

    ensureCompiled();

    // Cold path: avoid fingerprint/compoundsSig/Map overhead on first invoke.
    if (coldParentInvokesRemaining > 0) {
      coldParentInvokesRemaining--;

      return createSlotsResult(props);
    }

    const propsFingerprint = buildPropsFingerprint(variantKeys, defaultVariants, props);

    if (propsFingerprint === null) {
      return createSlotsResult(props);
    }

    // Recompute each call so in-place compound metadata mutations invalidate cache keys
    // (aligned with createVariantResolver / tv-default mutation coverage).
    const compoundsSig = hasCompounds
      ? buildCompoundsSignature(compoundVariants!, compoundSlots!)
      : "";
    const cacheKey = propsFingerprint + "#" + compoundsSig;

    parentCache ??= createBoundedCache<SlotsResult>();

    const cached = parentCache.get(cacheKey);

    if (cached !== CACHE_MISS) return cached;

    const next = createSlotsResult(props);

    parentCache.set(cacheKey, next);

    return next;
  }) as RuntimeComponent;
};

export const createClassResolver = (resolved: ResolvedOptions, cn: CnAdapter): RuntimeComponent => {
  if (resolved.mode === "plain") return createPlainResolver(resolved, cn);

  let resolver: RuntimeComponent | undefined;

  // Defer slots/variants resolver setup until first call so tv() construction stays cheap.
  return ((props?: AnyRecord): RuntimeResult => {
    resolver ??=
      resolved.mode === "slots"
        ? createSlotsResolver(resolved, cn)
        : createVariantResolver(resolved, cn);

    return resolver(props);
  }) as RuntimeComponent;
};
