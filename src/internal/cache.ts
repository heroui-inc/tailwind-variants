import type {TVConfig} from "../config.js";
import {falsyToString} from "../utils.js";
import type {AnyRecord, CnAdapter, CompiledCompoundSlot, CompiledCompoundVariant} from "./types.js";

const VARIANT_CACHE_LIMIT = 256;
const OVERRIDE_CACHE_LIMIT = 128;

export const CACHE_MISS = Symbol("tv-cache-miss");

export type CacheMiss = typeof CACHE_MISS;
export type CacheValue = string | undefined;
export type CacheLookup = CacheValue | CacheMiss;

export type ResultCache = {
  get(key: string): CacheLookup;
  set(key: string, value: CacheValue): void;
};

type NestedOverrideCache = {
  get(coreKey: string, overrideKey: string): CacheLookup;
  set(coreKey: string, overrideKey: string, value: CacheValue): void;
};

export type OverrideMerge = (core: CacheValue, props?: AnyRecord) => CacheValue;

const hasClassOverride = (props?: AnyRecord): boolean =>
  (props?.class != null && props.class !== "") ||
  (props?.className != null && props.className !== "");

const serializeFingerprintValue = (value: unknown): string | null => {
  if (value === undefined) return "";
  if (value === null) return "null";

  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return value === 0 ? "0" : String(value);
  if (typeof value === "bigint") return String(value);

  const mapped = falsyToString(value as any);
  const mappedType = typeof mapped;

  if (
    mappedType === "string" ||
    mappedType === "number" ||
    mappedType === "boolean" ||
    mappedType === "bigint"
  ) {
    return String(mapped);
  }

  if (mappedType === "object") {
    try {
      return JSON.stringify(mapped);
    } catch {
      return null;
    }
  }

  return null;
};

const appendSignatureValue = (out: string, value: unknown): string => {
  if (value === undefined) return out;
  if (value === null) return out + "null";

  const type = typeof value;

  if (type === "string" || type === "number" || type === "boolean" || type === "bigint") {
    return out + String(value);
  }

  if (Array.isArray(value)) {
    return out + value.join("\0");
  }

  try {
    return out + JSON.stringify(value);
  } catch {
    return out + "?";
  }
};

/** Result-cache key; omits class/className. */
export const buildPropsFingerprint = (
  variantKeys: string[],
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  slotProps?: AnyRecord,
): string | null => {
  let fingerprint = "";
  const seen: Record<string, 1> = Object.create(null);

  for (let i = 0; i < variantKeys.length; i++) {
    const key = variantKeys[i];

    seen[key] = 1;

    let value = defaultVariants[key];

    if (props && props[key] !== undefined) value = props[key];
    if (slotProps && slotProps[key] !== undefined) value = slotProps[key];

    const serialized = serializeFingerprintValue(value);

    if (serialized === null) return null;

    fingerprint += key + ":" + serialized + ";";
  }

  const extras: string[] = [];

  for (const key in defaultVariants) {
    if (key === "class" || key === "className" || seen[key]) continue;
    seen[key] = 1;
    extras.push(key);
  }

  if (props) {
    for (const key in props) {
      if (key === "class" || key === "className" || seen[key] || props[key] === undefined) continue;
      seen[key] = 1;
      extras.push(key);
    }
  }

  if (slotProps) {
    for (const key in slotProps) {
      if (key === "class" || key === "className" || seen[key] || slotProps[key] === undefined) {
        continue;
      }
      seen[key] = 1;
      extras.push(key);
    }
  }

  if (extras.length > 1) extras.sort();

  for (let i = 0; i < extras.length; i++) {
    const key = extras[i];
    let value = defaultVariants[key];

    if (props && props[key] !== undefined) value = props[key];
    if (slotProps && slotProps[key] !== undefined) value = slotProps[key];

    const serialized = serializeFingerprintValue(value);

    if (serialized === null) return null;

    fingerprint += key + ":" + serialized + ";";
  }

  return fingerprint;
};

/** Invalidates cache when compound metadata mutates. */
export const buildCompoundsSignature = (
  compoundVariants: CompiledCompoundVariant[],
  compoundSlots: CompiledCompoundSlot[],
): string => {
  let signature = "";

  for (let i = 0; i < compoundVariants.length; i++) {
    const {conditionKeys, source} = compoundVariants[i];

    for (let j = 0; j < conditionKeys.length; j++) {
      const key = conditionKeys[j];

      signature += key + "=";
      signature = appendSignatureValue(signature, source[key]);
      signature += ",";
    }

    signature += "c=";
    signature = appendSignatureValue(signature, source.class);
    signature += "|cn=";
    signature = appendSignatureValue(signature, source.className);
    signature += ";";
  }

  for (let i = 0; i < compoundSlots.length; i++) {
    const {conditionKeys, source} = compoundSlots[i];

    for (let j = 0; j < conditionKeys.length; j++) {
      const key = conditionKeys[j];

      signature += key + "=";
      signature = appendSignatureValue(signature, source[key]);
      signature += ",";
    }

    if (Array.isArray(source.slots)) {
      signature += "slots=" + source.slots.join(",") + ",";
    }

    signature += "c=";
    signature = appendSignatureValue(signature, source.class);
    signature += "|cn=";
    signature = appendSignatureValue(signature, source.className);
    signature += ";";
  }

  return signature;
};

type BoundedCache<T> = {
  get(key: string): T | CacheMiss;
  set(key: string, value: T): void;
};

/** Two-generation bounded Map cache for arbitrary values. */
export const createBoundedCache = <T>(limit = VARIANT_CACHE_LIMIT): BoundedCache<T> => {
  let primary: Map<string, T> = new Map();
  let secondary: Map<string, T> | null = null;

  return {
    get(key: string): T | CacheMiss {
      if (primary.has(key)) return primary.get(key) as T;

      if (secondary?.has(key)) {
        const value = secondary.get(key) as T;

        primary.set(key, value);

        return value;
      }

      return CACHE_MISS;
    },
    set(key: string, value: T) {
      if (primary.size >= limit) {
        secondary = primary;
        primary = new Map();
      }
      primary.set(key, value);
    },
  };
};

/** Two-generation bounded Map cache. */
export const createResultCache = (limit = VARIANT_CACHE_LIMIT): ResultCache => {
  const cache = createBoundedCache<CacheValue>(limit);

  return {
    get(key: string): CacheLookup {
      return cache.get(key);
    },
    set(key: string, value: CacheValue) {
      cache.set(key, value);
    },
  };
};

const createNestedOverrideCache = (limit = OVERRIDE_CACHE_LIMIT): NestedOverrideCache => {
  let primary: Map<string, Map<string, CacheValue>> = new Map();
  let secondary: Map<string, Map<string, CacheValue>> | null = null;
  let size = 0;

  return {
    get(coreKey: string, overrideKey: string): CacheLookup {
      const primaryInner = primary.get(coreKey);

      if (primaryInner) {
        const value = primaryInner.get(overrideKey);

        if (value !== undefined || primaryInner.has(overrideKey)) return value;
      }

      if (secondary) {
        const secondaryInner = secondary.get(coreKey);

        if (secondaryInner) {
          const value = secondaryInner.get(overrideKey);

          if (value !== undefined || secondaryInner.has(overrideKey)) {
            let promoteInner = primary.get(coreKey);

            if (!promoteInner) {
              promoteInner = new Map();
              primary.set(coreKey, promoteInner);
            }

            if (!promoteInner.has(overrideKey)) size++;
            promoteInner.set(overrideKey, value);

            return value;
          }
        }
      }

      return CACHE_MISS;
    },
    set(coreKey: string, overrideKey: string, value: CacheValue) {
      if (size >= limit) {
        secondary = primary;
        primary = new Map();
        size = 0;
      }

      let inner = primary.get(coreKey);

      if (!inner) {
        inner = new Map();
        primary.set(coreKey, inner);
      }

      if (!inner.has(overrideKey)) size++;
      inner.set(overrideKey, value);
    },
  };
};

/** Lazy override merge cache. */
export const createLazyOverrideMerge = (cn: CnAdapter, config: TVConfig): OverrideMerge => {
  let cache: NestedOverrideCache | null = null;

  return (core, props) => {
    if (!hasClassOverride(props)) return core;

    const classVal = props!.class;
    const classNameVal = props!.className;

    if (
      (classVal != null && classVal !== "" && typeof classVal !== "string") ||
      (classNameVal != null && classNameVal !== "" && typeof classNameVal !== "string")
    ) {
      return cn(config, core, classVal, classNameVal);
    }

    cache ??= createNestedOverrideCache();

    const coreKey = core ?? "";
    const overrideKey =
      (typeof classVal === "string" ? classVal : "") +
      "\0" +
      (typeof classNameVal === "string" ? classNameVal : "");
    const cached = cache.get(coreKey, overrideKey);

    if (cached !== CACHE_MISS) return cached;

    const merged = cn(config, core, classVal, classNameVal);

    cache.set(coreKey, overrideKey, merged);

    return merged;
  };
};
