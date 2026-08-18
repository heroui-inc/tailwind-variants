import type {TVConfig} from "../config.js";
import type {AnyRecord, CnAdapter, CompiledCompoundSlot, CompiledCompoundVariant} from "./types.js";

const VARIANT_CACHE_LIMIT = 256;
const OVERRIDE_CACHE_LIMIT = 128;

export const CACHE_MISS = Symbol("tv-cache-miss");

export type CacheMiss = typeof CACHE_MISS;

type NestedOverrideCache = {
  get(coreKey: string, overrideKey: string): string | CacheMiss;
  set(coreKey: string, overrideKey: string, value: string): void;
};

export type OverrideMerge = (core: string, props?: AnyRecord) => string;

const hasClassOverride = (props?: AnyRecord): boolean =>
  (props?.class != null && props.class !== "") ||
  (props?.className != null && props.className !== "");

// `JSON.stringify` turns NaN/Infinity into `null`, which would make two
// different variant values share one cache key and serve the wrong classes.
// Rejecting them bails to the uncached path instead of colliding.
const NON_FINITE = Symbol("tv-non-finite");

const stringifyFiniteOrThrow = (_key: string, value: unknown): unknown => {
  if (typeof value === "number" && !Number.isFinite(value)) throw NON_FINITE;

  return value;
};

const serializeFingerprintValue = (value: unknown): string | null => {
  if (value === undefined) return "";
  if (value === null) return "null";

  const type = typeof value;

  if (type === "string") return value as string;
  if (type === "boolean") return value ? "true" : "false";
  // `String(NaN)` / `String(Infinity)` stay distinct from "null", so top-level
  // numbers never need the finite check.
  if (type === "number" || type === "bigint") return String(value);

  if (type === "object") {
    try {
      return JSON.stringify(value, stringifyFiniteOrThrow);
    } catch {
      return null;
    }
  }

  // Functions and symbols cannot be serialized losslessly.
  return null;
};

const appendSignatureValue = (out: string, value: unknown): string | null => {
  if (value === undefined) return out;
  if (value === null) return out + "null";

  const type = typeof value;

  if (type === "string" || type === "number" || type === "boolean" || type === "bigint") {
    // `String(NaN)` is "NaN" — distinct from "null", so top-level primitives
    // never collide. Only the object/array branches need the finite check.
    return out + String(value);
  }

  if (Array.isArray(value)) {
    // Primitive arrays serialize through `join` — the v3.3.1 fast path. Arrays
    // containing objects keep their full shape via the replacer, and arrays
    // with non-finite numbers bail to the uncached path to avoid key collisions.
    for (let i = 0; i < value.length; i++) {
      const item = value[i];

      if (item !== null && typeof item === "object") {
        try {
          return out + JSON.stringify(value, stringifyFiniteOrThrow);
        } catch {
          return null;
        }
      }
      if (typeof item === "number" && !Number.isFinite(item)) return null;
    }

    return out + value.join("\0");
  }

  if (value !== null && type === "object") {
    // Flat objects of primitives (the common compound-class shape) stringify
    // without the replacer; nested structures or non-finite values fall back to
    // the replacer or the uncached path.
    let allPrimitive = true;

    for (const key in value as AnyRecord) {
      const item = (value as AnyRecord)[key];

      if (typeof item === "number" && !Number.isFinite(item)) return null;
      if (item !== null && typeof item === "object") {
        allPrimitive = false;
        break;
      }
    }

    if (allPrimitive) {
      try {
        return out + JSON.stringify(value);
      } catch {
        return null;
      }
    }
  }

  try {
    return out + JSON.stringify(value, stringifyFiniteOrThrow);
  } catch {
    return null;
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

/**
 * Invalidates cache when compound metadata mutates.
 *
 * Returns `null` when a value cannot be serialized losslessly (non-finite
 * numbers, circular objects), so callers skip the cache instead of keying two
 * different configs alike.
 */
export const buildCompoundsSignature = (
  compoundVariants: CompiledCompoundVariant[],
  compoundSlots: CompiledCompoundSlot[],
): string | null => {
  let signature = "";

  for (let i = 0; i < compoundVariants.length; i++) {
    const {conditionKeys, source} = compoundVariants[i];

    for (let j = 0; j < conditionKeys.length; j++) {
      const key = conditionKeys[j];
      const appended = appendSignatureValue(signature + key + "=", source[key]);

      if (appended === null) return null;

      signature = appended + ",";
    }

    signature += "c=";
    const withClass = appendSignatureValue(signature, source.class);

    if (withClass === null) return null;

    signature = withClass + "|cn=";
    const withClassName = appendSignatureValue(signature, source.className);

    if (withClassName === null) return null;

    signature = withClassName + ";";
  }

  for (let i = 0; i < compoundSlots.length; i++) {
    const {conditionKeys, source} = compoundSlots[i];

    for (let j = 0; j < conditionKeys.length; j++) {
      const key = conditionKeys[j];
      const appended = appendSignatureValue(signature + key + "=", source[key]);

      if (appended === null) return null;

      signature = appended + ",";
    }

    if (Array.isArray(source.slots)) {
      signature += "slots=" + source.slots.join(",") + ",";
    }

    signature += "c=";
    const withClass = appendSignatureValue(signature, source.class);

    if (withClass === null) return null;

    signature = withClass + "|cn=";
    const withClassName = appendSignatureValue(signature, source.className);

    if (withClassName === null) return null;

    signature = withClassName + ";";
  }

  return signature;
};

type BoundedCache<T> = {
  get(key: string): T | CacheMiss;
  set(key: string, value: T): void;
};

/**
 * Two-generation bounded Map cache. Stored values are never `undefined`
 * (strings or slot-result objects), so `get` uses a single lookup per
 * generation instead of a `has` + `get` pair.
 */
export const createBoundedCache = <T>(limit = VARIANT_CACHE_LIMIT): BoundedCache<T> => {
  let primary: Map<string, T> = new Map();
  let secondary: Map<string, T> | null = null;

  return {
    get(key: string): T | CacheMiss {
      const value = primary.get(key);

      if (value !== undefined) return value;

      if (secondary) {
        const fallback = secondary.get(key);

        if (fallback !== undefined) {
          primary.set(key, fallback);

          return fallback;
        }
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

export const UNCACHEABLE = Symbol("tv-uncacheable");

type PropsNode<T> = {
  children: Map<string, PropsNode<T>>;
  hasLeaf: boolean;
  leaf: T | undefined;
};

const createPropsNode = <T>(): PropsNode<T> => ({
  children: new Map(),
  hasLeaf: false,
  leaf: undefined,
});

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

const walkKey = <T>(
  node: PropsNode<T>,
  token: string,
  create: boolean,
): PropsNode<T> | undefined => {
  let next = node.children.get(token);

  if (!next) {
    if (!create) return undefined;
    next = createPropsNode<T>();
    node.children.set(token, next);
  }

  return next;
};

export type PropsCache<T> = {
  get(
    defaultVariants: AnyRecord,
    props?: AnyRecord,
    slotProps?: AnyRecord,
  ): T | CacheMiss | typeof UNCACHEABLE;
  set(
    defaultVariants: AnyRecord,
    props: AnyRecord | undefined,
    slotProps: AnyRecord | undefined,
    value: T,
  ): void;
  clear(): void;
};

/**
 * Nested props cache. Same key space as `buildPropsFingerprint`, but the hot
 * path walks Maps instead of concatenating one string.
 */
export const createPropsCache = <T>(
  variantKeys: string[],
  limit = VARIANT_CACHE_LIMIT,
): PropsCache<T> => {
  let primary = createPropsNode<T>();
  let secondary: PropsNode<T> | null = null;
  let size = 0;

  // Built once; extras are prop keys outside the recipe's variant axes.
  const variantKeySet: Record<string, 1> = Object.create(null);

  for (let i = 0; i < variantKeys.length; i++) {
    variantKeySet[variantKeys[i]] = 1;
  }

  /**
   * Keys beyond `variantKeys` that feed the cache key. `null` when there are
   * none (the common case), so nothing is allocated per lookup.
   */
  const collectExtraKeys = (
    defaultVariants: AnyRecord,
    props?: AnyRecord,
    slotProps?: AnyRecord,
  ): string[] | null => {
    let extras: string[] | null = null;
    let seen: Record<string, 1> | null = null;

    for (const key in defaultVariants) {
      if (key === "class" || key === "className" || variantKeySet[key]) continue;
      (seen ??= Object.create(null))[key] = 1;
      (extras ??= []).push(key);
    }

    if (props) {
      for (const key in props) {
        if (
          key === "class" ||
          key === "className" ||
          variantKeySet[key] ||
          seen?.[key] ||
          props[key] === undefined
        ) {
          continue;
        }
        (seen ??= Object.create(null))[key] = 1;
        (extras ??= []).push(key);
      }
    }

    if (slotProps) {
      for (const key in slotProps) {
        if (
          key === "class" ||
          key === "className" ||
          variantKeySet[key] ||
          seen?.[key] ||
          slotProps[key] === undefined
        ) {
          continue;
        }
        (seen ??= Object.create(null))[key] = 1;
        (extras ??= []).push(key);
      }
    }

    if (extras && extras.length > 1) extras.sort();

    return extras;
  };

  const lookup = (
    root: PropsNode<T>,
    defaultVariants: AnyRecord,
    props: AnyRecord | undefined,
    slotProps: AnyRecord | undefined,
    extras: string[] | null,
    create: boolean,
  ): PropsNode<T> | typeof UNCACHEABLE | undefined => {
    let node: PropsNode<T> | undefined = root;

    for (let i = 0; i < variantKeys.length; i++) {
      const serialized = serializeFingerprintValue(
        resolvePropValue(variantKeys[i], defaultVariants, props, slotProps),
      );

      if (serialized === null) return UNCACHEABLE;

      node = walkKey(node, serialized, create);

      if (!node) return undefined;
    }

    if (extras) {
      for (let i = 0; i < extras.length; i++) {
        const key = extras[i];
        const serialized = serializeFingerprintValue(
          resolvePropValue(key, defaultVariants, props, slotProps),
        );

        if (serialized === null) return UNCACHEABLE;

        node = walkKey(node, key + "\0" + serialized, create);

        if (!node) return undefined;
      }
    }

    return node;
  };

  return {
    get(defaultVariants, props, slotProps) {
      const extras = collectExtraKeys(defaultVariants, props, slotProps);
      const node = lookup(primary, defaultVariants, props, slotProps, extras, false);

      if (node === UNCACHEABLE) return UNCACHEABLE;

      if (node && node.hasLeaf) return node.leaf as T;

      if (secondary) {
        const fallback = lookup(secondary, defaultVariants, props, slotProps, extras, false);

        if (fallback === UNCACHEABLE) return UNCACHEABLE;

        if (fallback && fallback.hasLeaf) {
          const promoted = lookup(primary, defaultVariants, props, slotProps, extras, true);

          if (promoted !== UNCACHEABLE && promoted) {
            if (!promoted.hasLeaf) size++;
            promoted.hasLeaf = true;
            promoted.leaf = fallback.leaf;
          }

          return fallback.leaf as T;
        }
      }

      return CACHE_MISS;
    },
    set(defaultVariants, props, slotProps, value) {
      if (size >= limit) {
        secondary = primary;
        primary = createPropsNode<T>();
        size = 0;
      }

      const extras = collectExtraKeys(defaultVariants, props, slotProps);
      const node = lookup(primary, defaultVariants, props, slotProps, extras, true);

      if (node === UNCACHEABLE || !node) return;

      if (!node.hasLeaf) size++;
      node.hasLeaf = true;
      node.leaf = value;
    },
    clear() {
      primary = createPropsNode<T>();
      secondary = null;
      size = 0;
    },
  };
};

const createNestedOverrideCache = (limit = OVERRIDE_CACHE_LIMIT): NestedOverrideCache => {
  let primary: Map<string, Map<string, string>> = new Map();
  let secondary: Map<string, Map<string, string>> | null = null;
  let size = 0;

  return {
    get(coreKey: string, overrideKey: string): string | CacheMiss {
      const primaryInner = primary.get(coreKey);

      if (primaryInner) {
        const value = primaryInner.get(overrideKey);

        if (value !== undefined) return value;
      }

      if (secondary) {
        const secondaryInner = secondary.get(coreKey);

        if (secondaryInner) {
          const value = secondaryInner.get(overrideKey);

          if (value !== undefined) {
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
    set(coreKey: string, overrideKey: string, value: string) {
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

    const overrideKey =
      (typeof classVal === "string" ? classVal : "") +
      "\0" +
      (typeof classNameVal === "string" ? classNameVal : "");
    const cached = cache.get(core, overrideKey);

    if (cached !== CACHE_MISS) return cached;

    const merged = cn(config, core, classVal, classNameVal);

    cache.set(core, overrideKey, merged);

    return merged;
  };
};
