import type {
  AnyRecord,
  CompiledCompoundSlot,
  CompiledCompoundVariant,
  MergeAdapter,
} from "./types.js";

const VARIANT_CACHE_LIMIT = 256;

export const CACHE_MISS = Symbol("tv-cache-miss");

type CacheMiss = typeof CACHE_MISS;

type OverrideMerge = (core: string, props?: AnyRecord) => string;

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

// Result-cache key; omits class/className.
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

// Detects in-place compound metadata mutation without serializing it.
//
// Each resolver keeps one guard. The first call records every compound
// condition value, `class`, `className`, and compound-slot `slots` list into a
// flat snapshot; later calls compare the live values item by item with
// `Object.is` and allocate nothing while they match. Only a mismatch (or a
// value that needs JSON) rebuilds or re-serializes.
//
// Safety mirrors the old signature: any value the signature could not
// serialize losslessly (non-finite numbers inside arrays or objects, BigInt
// inside objects, circular structures) reports `COMPOUNDS_UNSAFE`, so callers
// skip the cache exactly as before. Objects nested in arrays or objects are
// compared through their JSON text, as the signature did.
export const COMPOUNDS_UNCHANGED = 0;
export const COMPOUNDS_CHANGED = 1;
export const COMPOUNDS_UNSAFE = 2;

export type CompoundsGuard = ReturnType<typeof createCompoundsGuard>;

export type CompoundsState =
  | typeof COMPOUNDS_UNCHANGED
  | typeof COMPOUNDS_CHANGED
  | typeof COMPOUNDS_UNSAFE;

type CompoundSources = {
  compoundVariants: readonly Pick<CompiledCompoundVariant, "conditionKeys" | "source">[];
  compoundSlots: readonly Pick<CompiledCompoundSlot, "conditionKeys" | "source">[];
};

// Snapshot kinds: the live value is compared against the stored token.
const KIND_PRIMITIVE = 0; // token is the value itself (identity)
const KIND_ARRAY = 1; // token is a shallow copy of a primitive array
const KIND_OBJECT = 2; // token is [key0, value0, key1, value1, ...] of a flat plain object
const KIND_JSON = 3; // token is the JSON text (nested structures)

const MATCH = 0;
const MISMATCH = 1;
const UNSAFE = 2;

type Snapshot = {kinds: number[]; tokens: unknown[]};

const isPlainObject = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
};

const isNonFiniteNumber = (value: unknown): boolean =>
  typeof value === "number" && !Number.isFinite(value);

const recordJson = (snapshot: Snapshot, index: number, value: unknown): boolean => {
  try {
    snapshot.kinds[index] = KIND_JSON;
    snapshot.tokens[index] = JSON.stringify(value, stringifyFiniteOrThrow);

    return true;
  } catch {
    return false;
  }
};

// Records one value. Returns false when it cannot be compared losslessly.
const recordValue = (snapshot: Snapshot, index: number, value: unknown): boolean => {
  if (value === null || typeof value !== "object") {
    snapshot.kinds[index] = KIND_PRIMITIVE;
    snapshot.tokens[index] = value;

    return true;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];

      if (item !== null && typeof item === "object") return recordJson(snapshot, index, value);
      if (isNonFiniteNumber(item)) return false;
    }

    snapshot.kinds[index] = KIND_ARRAY;
    snapshot.tokens[index] = value.slice();

    return true;
  }

  if (isPlainObject(value)) {
    const flat: unknown[] = [];

    for (const key in value as AnyRecord) {
      const item = (value as AnyRecord)[key];

      if (isNonFiniteNumber(item)) return false;
      if (item !== null && typeof item === "object") return recordJson(snapshot, index, value);
      // The signature's `JSON.stringify` threw on BigInt members.
      if (typeof item === "bigint") return false;
      flat.push(key, item);
    }

    snapshot.kinds[index] = KIND_OBJECT;
    snapshot.tokens[index] = flat;

    return true;
  }

  return recordJson(snapshot, index, value);
};

const matchValue = (kind: number, token: unknown, value: unknown): number => {
  if (kind === KIND_PRIMITIVE) return Object.is(token, value) ? MATCH : MISMATCH;

  if (value === null || typeof value !== "object") return MISMATCH;

  if (kind === KIND_ARRAY) {
    const items = token as unknown[];

    if (!Array.isArray(value) || value.length !== items.length) return MISMATCH;
    for (let i = 0; i < items.length; i++) {
      if (!Object.is(items[i], value[i])) return MISMATCH;
    }

    return MATCH;
  }

  if (kind === KIND_OBJECT) {
    if (Array.isArray(value) || !isPlainObject(value)) return MISMATCH;

    const flat = token as unknown[];
    let j = 0;

    for (const key in value as AnyRecord) {
      if (j >= flat.length || flat[j] !== key) return MISMATCH;
      if (!Object.is(flat[j + 1], (value as AnyRecord)[key])) return MISMATCH;
      j += 2;
    }

    return j === flat.length ? MATCH : MISMATCH;
  }

  try {
    return JSON.stringify(value, stringifyFiniteOrThrow) === token ? MATCH : MISMATCH;
  } catch {
    return UNSAFE;
  }
};

// Compound-slot `slots` lists were only ever joined; anything else is ignored.
const slotsValue = (slots: unknown): unknown => (Array.isArray(slots) ? slots : undefined);

const recordSlots = (snapshot: Snapshot, index: number, slots: unknown): void => {
  const value = slotsValue(slots) as unknown[] | undefined;

  snapshot.kinds[index] = value === undefined ? KIND_PRIMITIVE : KIND_ARRAY;
  snapshot.tokens[index] = value === undefined ? undefined : value.slice();
};

// Fills a fresh snapshot. Returns false when any value is unsafe.
const takeSnapshot = (
  snapshot: Snapshot,
  compoundVariants: CompoundSources["compoundVariants"],
  compoundSlots: CompoundSources["compoundSlots"],
) => {
  let index = 0;

  for (let i = 0; i < compoundVariants.length; i++) {
    const {conditionKeys, source} = compoundVariants[i];

    for (let j = 0; j < conditionKeys.length; j++) {
      if (!recordValue(snapshot, index++, source[conditionKeys[j]])) return false;
    }
    if (!recordValue(snapshot, index++, source.class)) return false;
    if (!recordValue(snapshot, index++, source.className)) return false;
  }

  for (let i = 0; i < compoundSlots.length; i++) {
    const {conditionKeys, source} = compoundSlots[i];

    for (let j = 0; j < conditionKeys.length; j++) {
      if (!recordValue(snapshot, index++, source[conditionKeys[j]])) return false;
    }
    recordSlots(snapshot, index++, source.slots);
    if (!recordValue(snapshot, index++, source.class)) return false;
    if (!recordValue(snapshot, index++, source.className)) return false;
  }

  snapshot.kinds.length = index;
  snapshot.tokens.length = index;

  return true;
};

const compareSnapshot = (
  {kinds, tokens}: Snapshot,
  compoundVariants: CompoundSources["compoundVariants"],
  compoundSlots: CompoundSources["compoundSlots"],
): number => {
  const size = kinds.length;
  let index = 0;
  let state: number;

  for (let i = 0; i < compoundVariants.length; i++) {
    const {conditionKeys, source} = compoundVariants[i];

    if (index + conditionKeys.length + 2 > size) return MISMATCH;
    for (let j = 0; j < conditionKeys.length; j++, index++) {
      state = matchValue(kinds[index], tokens[index], source[conditionKeys[j]]);
      if (state !== MATCH) return state;
    }
    state = matchValue(kinds[index], tokens[index], source.class);
    if (state !== MATCH) return state;
    index++;
    state = matchValue(kinds[index], tokens[index], source.className);
    if (state !== MATCH) return state;
    index++;
  }

  for (let i = 0; i < compoundSlots.length; i++) {
    const {conditionKeys, source} = compoundSlots[i];

    if (index + conditionKeys.length + 3 > size) return MISMATCH;
    for (let j = 0; j < conditionKeys.length; j++, index++) {
      state = matchValue(kinds[index], tokens[index], source[conditionKeys[j]]);
      if (state !== MATCH) return state;
    }
    state = matchValue(kinds[index], tokens[index], slotsValue(source.slots));
    if (state !== MATCH) return state;
    index++;
    state = matchValue(kinds[index], tokens[index], source.class);
    if (state !== MATCH) return state;
    index++;
    state = matchValue(kinds[index], tokens[index], source.className);
    if (state !== MATCH) return state;
    index++;
  }

  return index === size ? MATCH : MISMATCH;
};

/**
 * One guard per resolver. Each call reports whether the compound metadata is
 * unchanged since the previous call, changed (snapshot refreshed), or unsafe
 * to cache against (nothing may be cached for this call).
 */
export const createCompoundsGuard = () => {
  let snapshot: Snapshot | null = null;

  return (
    compoundVariants: CompoundSources["compoundVariants"],
    compoundSlots: CompoundSources["compoundSlots"],
  ): CompoundsState => {
    if (snapshot !== null) {
      const state = compareSnapshot(snapshot, compoundVariants, compoundSlots);

      if (state === MATCH) return COMPOUNDS_UNCHANGED;
      if (state === UNSAFE) {
        snapshot = null;

        return COMPOUNDS_UNSAFE;
      }
    }

    const next: Snapshot = {kinds: [], tokens: []};

    if (!takeSnapshot(next, compoundVariants, compoundSlots)) {
      snapshot = null;

      return COMPOUNDS_UNSAFE;
    }

    snapshot = next;

    return COMPOUNDS_CHANGED;
  };
};

type BoundedCache<T> = {
  get(key: string): T | CacheMiss;
  set(key: string, value: T): void;
};

// Two-generation bounded Map cache. Stored values are never `undefined`
// (strings or slot-result objects), so `get` uses a single lookup per
// generation instead of a `has` + `get` pair.
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

type PropsCache<T> = {
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

// Nested props cache. Same key space as `buildPropsFingerprint`, but the hot
// path walks Maps instead of concatenating one string.
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

  // Keys beyond `variantKeys` that feed the cache key. `null` when there are
  // none (the common case), so nothing is allocated per lookup.
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

// Merge `class` / `className` onto a resolved core only when one is present.
// The merge adapter's argument-identity cache serves repeats: the core is a
// cached string and a stable className literal keeps its identity, so a hit
// costs a few pointer compares and no string is built.
export const createLazyOverrideMerge = (merge: MergeAdapter): OverrideMerge => {
  return (core, props) => {
    if (!hasClassOverride(props)) return core;

    return merge.override(core, props!.class, props!.className);
  };
};
