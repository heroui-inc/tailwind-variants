import {falsyToString} from "../utils.js";
import {compileResolvedOptions} from "./resolve-options.js";
import type {
  AnyRecord,
  CnAdapter,
  CompiledCompoundVariant,
  CompiledVariant,
  ResolvedOptions,
  RuntimeComponent,
  RuntimeResult,
} from "./types.js";

const omitUndefined = (values?: AnyRecord): AnyRecord => {
  const result: AnyRecord = {};

  if (!values) return result;

  for (const key in values) {
    if (values[key] !== undefined) result[key] = values[key];
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

const getCompleteProps = (
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  slotProps?: AnyRecord,
): AnyRecord => ({
  ...defaultVariants,
  ...omitUndefined(props),
  ...omitUndefined(slotProps),
});

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

const getVariantClassNames = (
  variants: CompiledVariant[],
  defaultVariants: AnyRecord,
  props?: AnyRecord,
): any[] => {
  const result = [];

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
  const result = [];

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
  const result = [];

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
  const result = [];

  for (let i = 0; i < compoundVariants.length; i++) {
    const compoundVariant = compoundVariants[i];

    if (!matchesConditions(compoundVariant, completeProps)) continue;

    for (const classValue of [compoundVariant.source.class, compoundVariant.source.className]) {
      if (typeof classValue === "string") {
        if (slotKey === "base") result.push(classValue);
      } else if (classValue && typeof classValue === "object" && classValue[slotKey]) {
        result.push(classValue[slotKey]);
      }
    }
  }

  return result;
};

const createPlainResolver = (resolved: ResolvedOptions, cn: CnAdapter): RuntimeComponent =>
  ((props?: AnyRecord): RuntimeResult =>
    cn(resolved.config, resolved.base, props?.class, props?.className)) as RuntimeComponent;

const createVariantResolver = (resolved: ResolvedOptions, cn: CnAdapter): RuntimeComponent => {
  const {base, config, defaultVariants, deferredError} = resolved;
  let compiledCompoundVariants = resolved.compiledCompoundVariants;
  let compiledVariants = resolved.compiledVariants;

  return ((props?: AnyRecord): RuntimeResult => {
    if (deferredError) throw deferredError;
    if (compiledVariants === null || compiledCompoundVariants === null) {
      compileResolvedOptions(resolved);
      compiledVariants = resolved.compiledVariants!;
      compiledCompoundVariants = resolved.compiledCompoundVariants!;
    }

    const compoundClasses =
      compiledCompoundVariants.length > 0
        ? getCompoundVariantClasses(
            compiledCompoundVariants,
            getCompleteProps(defaultVariants, props),
          )
        : undefined;

    return cn(
      config,
      base,
      getVariantClassNames(compiledVariants, defaultVariants, props),
      compoundClasses,
      props?.class,
      props?.className,
    );
  }) as RuntimeComponent;
};

const createSlotsResolver = (resolved: ResolvedOptions, cn: CnAdapter): RuntimeComponent => {
  const {config, defaultVariants, deferredError, slots} = resolved;
  let compiledCompoundSlots = resolved.compiledCompoundSlots;
  let compiledCompoundVariants = resolved.compiledCompoundVariants;
  let compiledVariants = resolved.compiledVariants;
  let slotKeys = resolved.slotKeys;

  return ((props?: AnyRecord): RuntimeResult => {
    if (deferredError) throw deferredError;
    if (
      compiledVariants === null ||
      compiledCompoundVariants === null ||
      compiledCompoundSlots === null ||
      slotKeys === null
    ) {
      compileResolvedOptions(resolved);
      compiledVariants = resolved.compiledVariants!;
      compiledCompoundVariants = resolved.compiledCompoundVariants!;
      compiledCompoundSlots = resolved.compiledCompoundSlots!;
      slotKeys = resolved.slotKeys!;
    }

    const slotsFns: Record<string, (slotProps?: AnyRecord) => string | undefined> = {};
    const variants = compiledVariants;
    const compoundVariants = compiledCompoundVariants;
    const compoundSlots = compiledCompoundSlots;
    const keys = slotKeys;
    const hasCompounds = compoundVariants.length > 0 || compoundSlots.length > 0;

    for (let i = 0; i < keys.length; i++) {
      const slotKey = keys[i];

      slotsFns[slotKey] = (slotProps) => {
        const completeProps = hasCompounds
          ? getCompleteProps(defaultVariants, props, slotProps)
          : undefined;
        const compoundVariantClasses = completeProps
          ? getCompoundVariantClassesBySlot(slotKey, compoundVariants, completeProps)
          : undefined;
        const compoundSlotClasses = [];

        if (completeProps) {
          for (let j = 0; j < compoundSlots.length; j++) {
            const compoundSlot = compoundSlots[j];

            if (
              !matchesConditions(compoundSlot, completeProps) ||
              !(compoundSlot.source.slots ?? []).includes(slotKey)
            ) {
              continue;
            }

            compoundSlotClasses.push([compoundSlot.source.class, compoundSlot.source.className]);
          }
        }

        return cn(
          config,
          slots[slotKey],
          getVariantClassNamesBySlot(slotKey, variants, defaultVariants, props, slotProps),
          compoundVariantClasses,
          compoundSlotClasses,
          slotProps?.class,
          slotProps?.className,
        );
      };
    }

    return slotsFns;
  }) as RuntimeComponent;
};

export const createClassResolver = (resolved: ResolvedOptions, cn: CnAdapter): RuntimeComponent => {
  if (resolved.mode === "plain") return createPlainResolver(resolved, cn);

  let resolver: RuntimeComponent | undefined;

  return ((props?: AnyRecord): RuntimeResult => {
    resolver ??=
      resolved.mode === "slots"
        ? createSlotsResolver(resolved, cn)
        : createVariantResolver(resolved, cn);

    return resolver(props);
  }) as RuntimeComponent;
};
