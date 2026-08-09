import type {TVConfig} from "../config.js";
import type {
  AnyRecord,
  CompiledCompoundSlot,
  CompiledCompoundVariant,
  CompiledVariant,
  ResolvedOptions,
  RuntimeComponent,
  RuntimeExtend,
} from "./types.js";

import {cx, flatMergeArrays, isEmptyObject, isEqual, joinObjects, mergeObjects} from "../utils.js";

import {defaultConfig} from "./default-config.js";
import {state} from "./state.js";

/** Flattened recipe fields used while folding parents / merging the child. */
type RecipeFields = {
  base: any;
  variants: AnyRecord;
  defaultVariants: AnyRecord;
  slots: AnyRecord;
  compoundVariants: any[];
  compoundSlots: any[];
};

const emptyRecipe = (): RecipeFields => ({
  base: undefined,
  variants: {},
  defaultVariants: {},
  slots: {},
  compoundVariants: [],
  compoundSlots: [],
});

const recipeFromComponent = (component: RuntimeComponent): RecipeFields => ({
  base: component.base,
  variants: component.variants ?? {},
  defaultVariants: component.defaultVariants ?? {},
  slots: component.slots ?? {},
  compoundVariants: component.compoundVariants ?? [],
  compoundSlots: component.compoundSlots ?? [],
});

/**
 * Merge two already-flattened recipes left-to-right.
 * Later recipe wins class conflicts (same rules as single-parent extend).
 */
const mergeRecipe = (acc: RecipeFields, next: RecipeFields): RecipeFields => {
  const base = acc.base != null || next.base != null ? cx(acc.base, next.base) : undefined;

  const variants =
    !next.variants || isEmptyObject(next.variants)
      ? acc.variants
      : isEmptyObject(acc.variants)
        ? next.variants
        : mergeObjects(next.variants, acc.variants);

  const defaultVariants =
    !next.defaultVariants || isEmptyObject(next.defaultVariants)
      ? acc.defaultVariants
      : {...acc.defaultVariants, ...next.defaultVariants};

  const accSlotsEmpty = !acc.slots || isEmptyObject(acc.slots);
  const nextSlotsEmpty = !next.slots || isEmptyObject(next.slots);

  let slots: AnyRecord;

  if (accSlotsEmpty && nextSlotsEmpty) {
    slots = {};
  } else if (accSlotsEmpty) {
    // Later parent introduces slots; fold earlier base into the base slot.
    slots = acc.base != null ? joinObjects({base: acc.base}, {...next.slots}) : {...next.slots};
  } else if (nextSlotsEmpty) {
    slots = next.base != null ? joinObjects({...acc.slots}, {base: next.base}) : {...acc.slots};
  } else {
    slots = joinObjects({...acc.slots}, next.slots);
  }

  const compoundVariants =
    !next.compoundVariants || isEmptyObject(next.compoundVariants)
      ? acc.compoundVariants
      : !acc.compoundVariants || isEmptyObject(acc.compoundVariants)
        ? next.compoundVariants
        : flatMergeArrays(acc.compoundVariants, next.compoundVariants);

  const compoundSlots =
    !next.compoundSlots || isEmptyObject(next.compoundSlots)
      ? acc.compoundSlots
      : !acc.compoundSlots || isEmptyObject(acc.compoundSlots)
        ? next.compoundSlots
        : flatMergeArrays(acc.compoundSlots, next.compoundSlots);

  return {
    base,
    variants,
    defaultVariants,
    slots,
    compoundVariants,
    compoundSlots,
  };
};

const normalizeParents = (extend: RuntimeExtend): RuntimeComponent[] => {
  if (extend == null) return [];
  if (Array.isArray(extend)) return extend.filter(Boolean) as RuntimeComponent[];

  return [extend];
};

/** Fold 2+ parents left-to-right. Single-parent callers skip this and use the parent as-is. */
const foldParents = (parents: RuntimeComponent[]): RecipeFields => {
  let acc = emptyRecipe();

  for (let i = 0; i < parents.length; i++) {
    acc = mergeRecipe(acc, recipeFromComponent(parents[i]!));
  }

  return acc;
};

const synchronizeTwMergeConfig = (config: TVConfig): void => {
  if (
    !isEmptyObject(config.twMergeConfig) &&
    !isEqual(config.twMergeConfig as object, state.cachedTwMergeConfig)
  ) {
    state.didTwMergeConfigChange = true;
    state.cachedTwMergeConfig = config.twMergeConfig!;
  }
};

const compileVariants = (variants: AnyRecord, variantKeys: string[]): CompiledVariant[] => {
  const compiledVariants: CompiledVariant[] = [];

  for (let i = 0; i < variantKeys.length; i++) {
    const key = variantKeys[i];
    const values = variants[key];

    compiledVariants.push({key, values, isEmpty: isEmptyObject(values)});
  }

  return compiledVariants;
};

const compileCompoundVariants = (compoundVariants: unknown): CompiledCompoundVariant[] => {
  if (!Array.isArray(compoundVariants) || compoundVariants.length === 0) return [];
  const result: CompiledCompoundVariant[] = [];

  for (let i = 0; i < compoundVariants.length; i++) {
    const compoundVariant = compoundVariants[i];
    const conditionKeys: string[] = [];

    for (const key in compoundVariant) {
      if (key !== "class" && key !== "className") {
        conditionKeys.push(key);
      }
    }

    result.push({conditionKeys, source: compoundVariant});
  }

  return result;
};

const compileCompoundSlots = (compoundSlots: unknown): CompiledCompoundSlot[] => {
  if (!Array.isArray(compoundSlots) || compoundSlots.length === 0) return [];
  const result: CompiledCompoundSlot[] = [];

  for (let i = 0; i < compoundSlots.length; i++) {
    const compoundSlot = compoundSlots[i];
    const conditionKeys: string[] = [];

    for (const key in compoundSlot) {
      if (key !== "slots" && key !== "class" && key !== "className") {
        conditionKeys.push(key);
      }
    }

    result.push({conditionKeys, source: compoundSlot});
  }

  return result;
};

const indexCompoundSlotsBySlot = (
  compiledCompoundSlots: CompiledCompoundSlot[],
): Record<string, CompiledCompoundSlot[]> => {
  const index: Record<string, CompiledCompoundSlot[]> = {};

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

export const resolveOptions = (options: AnyRecord, configProp?: TVConfig): ResolvedOptions => {
  const {
    extend: extendInput = null,
    slots: slotProps = {},
    variants: variantsProps = {},
    compoundVariants: compoundVariantsProps = [],
    compoundSlots: compoundSlotsProps = [],
    defaultVariants: defaultVariantsProps = {},
  } = options;

  const originalExtend = extendInput as RuntimeExtend;
  // Single parent: use the component directly (same path as pre-multi-extend, no fold).
  // Multiple parents: fold left-to-right into one synthetic recipe for the child-merge path.
  let extend: RuntimeComponent | RecipeFields | null = null;

  if (Array.isArray(originalExtend)) {
    const parents = normalizeParents(originalExtend);

    if (parents.length === 1) extend = parents[0]!;
    else if (parents.length > 1) extend = foldParents(parents);
  } else if (originalExtend != null) {
    extend = originalExtend;
  }

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
  // Seed base from root/`extend`, then let `slots.base` replace it when provided.
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
    extend: originalExtend,
    base,
    variants,
    defaultVariants,
    slots,
    compoundVariants,
    compoundSlots,
    compiledVariants: null,
    compiledCompoundVariants: null,
    compiledCompoundSlots: null,
    compiledCompoundSlotsBySlot: null,
    deferredError,
    mode,
    slotKeys: null,
    variantKeys,
  };
};

export const compileResolvedOptions = (resolved: ResolvedOptions): ResolvedOptions => {
  if (resolved.compiledVariants !== null) return resolved;

  resolved.compiledVariants = compileVariants(resolved.variants, resolved.variantKeys);
  resolved.compiledCompoundVariants = compileCompoundVariants(resolved.compoundVariants);
  resolved.compiledCompoundSlots = compileCompoundSlots(resolved.compoundSlots);
  resolved.compiledCompoundSlotsBySlot = indexCompoundSlotsBySlot(resolved.compiledCompoundSlots);
  resolved.slotKeys =
    resolved.slots && typeof resolved.slots === "object" ? Object.keys(resolved.slots) : [];

  return resolved;
};
