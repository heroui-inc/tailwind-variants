import type {TVConfig} from "../config.js";
import type {
  AnyRecord,
  CompiledCompoundSlot,
  CompiledCompoundVariant,
  CompiledVariant,
  NormalizedOption,
  ResolvedOptions,
  RuntimeComponent,
  RuntimeExtend,
  SlotClassMap,
} from "./types.js";

import {
  cx,
  flatMergeArrays,
  isEmptyObject,
  joinObjects,
  mergeObjects,
  normalizeClassString,
} from "../utils.js";

import {defaultConfig} from "./default-config.js";
import {joinClassValue} from "./join-class-value.js";

// Flattened recipe fields used while folding parents / merging the child.
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

// Merge two already-flattened recipes left-to-right.
// Later recipe wins class conflicts (same rules as single-parent extend).
const mergeRecipe = (acc: RecipeFields, next: RecipeFields): RecipeFields => {
  const base = acc.base != null || next.base != null ? cx(acc.base, next.base) : undefined;

  const variants = isEmptyObject(next.variants)
    ? acc.variants
    : isEmptyObject(acc.variants)
      ? next.variants
      : mergeObjects(next.variants, acc.variants);

  const defaultVariants = isEmptyObject(next.defaultVariants)
    ? acc.defaultVariants
    : {...acc.defaultVariants, ...next.defaultVariants};

  const accSlotsEmpty = isEmptyObject(acc.slots);
  const nextSlotsEmpty = isEmptyObject(next.slots);

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

  const compoundVariants = isEmptyObject(next.compoundVariants)
    ? acc.compoundVariants
    : isEmptyObject(acc.compoundVariants)
      ? next.compoundVariants
      : flatMergeArrays(acc.compoundVariants, next.compoundVariants);

  const compoundSlots = isEmptyObject(next.compoundSlots)
    ? acc.compoundSlots
    : isEmptyObject(acc.compoundSlots)
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

// Fold 2+ parents left-to-right. Single-parent callers skip this and use the parent as-is.
const foldParents = (parents: RuntimeComponent[]): RecipeFields => {
  let acc = emptyRecipe();

  for (let i = 0; i < parents.length; i++) {
    acc = mergeRecipe(acc, recipeFromComponent(parents[i]!));
  }

  return acc;
};

// Class value → single whitespace-normalized string. Falsy values (and NaN) become "".
export const normalizeClassValue = (value: unknown): string =>
  value ? normalizeClassString(joinClassValue(value as Parameters<typeof joinClassValue>[0])) : "";

// `class` + `className` of a compound as one string.
export const normalizeCompoundClasses = (source: AnyRecord): string => {
  const first = normalizeClassValue(source.class);
  const second = normalizeClassValue(source.className);

  if (!first) return second;
  if (!second) return first;

  return first + " " + second;
};

const appendSlotClasses = (target: SlotClassMap, slotKey: string, classes: string): void => {
  if (!classes) return;

  const existing = target[slotKey];

  target[slotKey] = existing ? existing + " " + classes : classes;
};

// Per-slot `class` / `className` of a compound. Strings and arrays belong to
// the `base` slot; an object spreads over its slot keys.
export const normalizeCompoundSlotClasses = (source: AnyRecord): SlotClassMap => {
  const target: SlotClassMap = {};
  const values = [source.class, source.className];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];

    if (typeof value === "string" || Array.isArray(value)) {
      appendSlotClasses(target, "base", normalizeClassValue(value));
    } else if (value && typeof value === "object") {
      for (const slotKey in value) {
        appendSlotClasses(target, slotKey, normalizeClassValue(value[slotKey]));
      }
    }
  }

  return target;
};

const compileVariants = (variants: AnyRecord, variantKeys: string[]): CompiledVariant[] => {
  const compiledVariants: CompiledVariant[] = [];

  for (let i = 0; i < variantKeys.length; i++) {
    const key = variantKeys[i];
    const values = variants[key];

    compiledVariants.push({
      key,
      values,
      isEmpty: isEmptyObject(values),
      normalizedFrom: null,
      normalized: null,
    });
  }

  return compiledVariants;
};

// Normalize one variant option. Slot-mode strings and arrays apply to the
// `base` slot only; an object carries one string per slot. Variants mode
// always yields a string. The raw value is remembered so an in-place edit of
// the option (a different value under the same key) is picked up.
export const normalizeVariantOption = (
  variant: CompiledVariant,
  optionKey: string,
  raw: unknown,
  slotMode: boolean,
): NormalizedOption => {
  let normalized: NormalizedOption;

  if (!slotMode || typeof raw === "string" || Array.isArray(raw)) {
    normalized = normalizeClassValue(raw);
  } else if (raw && typeof raw === "object") {
    const map: SlotClassMap = {};

    for (const slotKey in raw as AnyRecord) {
      const classes = normalizeClassValue((raw as AnyRecord)[slotKey]);

      if (classes) map[slotKey] = classes;
    }

    normalized = map;
  } else {
    normalized = "";
  }

  (variant.normalizedFrom ??= {})[optionKey] = raw;
  (variant.normalized ??= {})[optionKey] = normalized;

  return normalized;
};

// Forget the normalized classes of every compound. They are rebuilt from the
// live `source` the next time the compound matches, so a metadata edit is
// picked up without normalizing compounds that never apply.
export const invalidateCompoundClasses = (
  compoundVariants: CompiledCompoundVariant[],
  compoundSlots: CompiledCompoundSlot[],
): void => {
  for (let i = 0; i < compoundVariants.length; i++) {
    compoundVariants[i].classes = null;
    compoundVariants[i].slotClasses = null;
  }

  for (let i = 0; i < compoundSlots.length; i++) {
    compoundSlots[i].classes = null;
  }
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

    result.push({conditionKeys, source: compoundVariant, classes: null, slotClasses: null});
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

    result.push({conditionKeys, source: compoundSlot, classes: null});
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
  // Read each config property exactly once; every extra `options.x` access is
  // a separate inline-cache site that degrades once many config shapes have
  // flowed through here.
  const {
    extend: extendInput = null,
    base: baseProp,
    slots: rawSlots,
    variants: variantsProps = {},
    compoundVariants: compoundVariantsProps = [],
    compoundSlots: compoundSlotsProps = [],
    defaultVariants: defaultVariantsProps = {},
  } = options;

  const hasSlots = rawSlots !== undefined;
  const slotProps = hasSlots ? rawSlots : {};
  const originalExtend = extendInput as RuntimeExtend;
  // Single parent: use the component directly (same path as pre-multi-extend, no fold).
  // Multiple parents: fold left-to-right into one synthetic recipe for the child-merge path.
  let extend: RuntimeComponent | RecipeFields | null = null;

  if (Array.isArray(originalExtend)) {
    const parents = originalExtend.filter(Boolean) as RuntimeComponent[];

    if (parents.length === 1) extend = parents[0]!;
    else if (parents.length > 1) extend = foldParents(parents);
  } else if (originalExtend != null) {
    extend = originalExtend;
  }

  const config = {...defaultConfig, ...configProp};
  const base = extend?.base ? cx(extend.base, baseProp) : baseProp;
  const variants =
    extend?.variants && !isEmptyObject(extend.variants)
      ? mergeObjects(variantsProps, extend.variants)
      : variantsProps;
  const defaultVariants =
    extend?.defaultVariants && !isEmptyObject(extend.defaultVariants)
      ? {...extend.defaultVariants, ...defaultVariantsProps}
      : defaultVariantsProps;

  const isExtendedSlotsEmpty = !extend?.slots || isEmptyObject(extend.slots);
  const componentBase = hasSlots
    ? isExtendedSlotsEmpty && extend?.base
      ? cx(baseProp, extend.base)
      : typeof baseProp === "string" || baseProp == null
        ? baseProp
        : cx(baseProp)
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
        isEmptyObject(componentSlots) ? {base: baseProp} : componentSlots,
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
  resolved.slotKeys = Object.keys(resolved.slots);

  return resolved;
};
