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
// different compound values compare equal. Rejecting them reports the
// compound metadata as unsafe instead of colliding.
const NON_FINITE = Symbol("tv-non-finite");

const stringifyFiniteOrThrow = (_key: string, value: unknown): unknown => {
  if (typeof value === "number" && !Number.isFinite(value)) throw NON_FINITE;

  return value;
};

export const UNCACHEABLE = Symbol("tv-uncacheable");

// An explicit `null` drops the variant's classes; the string "null" selects
// the option named "null". They must never share a token.
const NULL_TOKEN = Symbol("tv-null");

// Cache token of one prop value, or UNCACHEABLE. Two values share a token only
// when they select the same variant option and meet the same compound
// conditions: booleans and numbers share their string spelling's token
// (`true` / "true", `1` / "1"), and NaN resolves like `false`. Objects match
// compound conditions by identity only (and their JSON text could equal a
// string option), and BigInt `0n` resolves like `false` while `"0"` does not,
// so those, functions and symbols are never cached.
const toPropsToken = (value: unknown): string | symbol => {
  if (value === undefined) return "";
  if (value === null) return NULL_TOKEN;

  const type = typeof value;

  if (type === "string") return value as string;
  if (type === "boolean") return value ? "true" : "false";
  if (type === "number") return Number.isNaN(value) ? "false" : String(value);

  return UNCACHEABLE;
};

// `record[key]`, with inherited Object.prototype methods read as unset (all but
// `__proto__` are functions). Only function values pay the own check.
export const readOwn = (record: AnyRecord | undefined, key: string): any => {
  if (record == null) return undefined;

  const value = record[key];

  return typeof value === "function" && !Object.hasOwn(record, key) ? undefined : value;
};

// Effective value of one prop: defaults, then props, then slot props.
export const resolvePropValue = (
  key: string,
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  slotProps?: AnyRecord,
): unknown => {
  const slotValue = readOwn(slotProps, key);

  if (slotValue !== undefined) return slotValue;

  const propValue = readOwn(props, key);

  return propValue !== undefined ? propValue : readOwn(defaultVariants, key);
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

const matchArray = (items: unknown[], value: unknown): number => {
  if (!Array.isArray(value) || value.length !== items.length) return MISMATCH;
  for (let i = 0; i < items.length; i++) {
    if (!Object.is(items[i], value[i])) return MISMATCH;
  }

  return MATCH;
};

// Objects and JSON text, the rare kinds.
const matchStructured = (kind: number, token: unknown, value: unknown): number => {
  if (value === null || typeof value !== "object") return MISMATCH;

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

// Fast path for primitives and primitive arrays, nearly every compound value.
const matchValue = (kind: number, token: unknown, value: unknown): number => {
  if (kind === KIND_PRIMITIVE) return Object.is(token, value) ? MATCH : MISMATCH;
  if (kind === KIND_ARRAY) return matchArray(token as unknown[], value);

  return matchStructured(kind, token, value);
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

type PropsToken = string | symbol;

type PropsNode<T> = {
  // Values passed in props.
  children: Map<PropsToken, PropsNode<T>>;
  // Values taken from `defaultVariants` because the prop is unset. A held slot
  // result re-reads the defaults live for slot overrides, so it must not be
  // shared with calls that passed the same value explicitly.
  defaults: Map<PropsToken, PropsNode<T>> | null;
  hasLeaf: boolean;
  leaf: T | undefined;
};

const createPropsNode = <T>(): PropsNode<T> => ({
  children: new Map(),
  defaults: null,
  hasLeaf: false,
  leaf: undefined,
});

const walkKey = <T>(
  node: PropsNode<T>,
  token: PropsToken,
  fromDefaults: boolean,
  create: boolean,
): PropsNode<T> | undefined => {
  let next = fromDefaults ? node.defaults?.get(token) : node.children.get(token);

  if (!next) {
    if (!create) return undefined;
    next = createPropsNode<T>();
    (fromDefaults ? (node.defaults ??= new Map()) : node.children).set(token, next);
  }

  return next;
};

type PropsCache<T> = {
  get(defaultVariants: AnyRecord, props?: AnyRecord): T | CacheMiss | typeof UNCACHEABLE;
  set(defaultVariants: AnyRecord, props: AnyRecord | undefined, value: T): void;
};

// Nested props cache: one Map level per key, so the hot path walks Maps
// instead of concatenating one key string.
//
// `keys` must hold every prop key the cached value depends on: the variant
// axes plus the compound condition keys outside them. Any other prop (`id`,
// `onClick`, `children`, ...) cannot change the classes and is never read, so
// it neither misses nor bypasses the cache. Callers build a new cache when the
// key set can change (compound metadata edits).
export const createPropsCache = <T>(
  keys: readonly string[],
  limit = VARIANT_CACHE_LIMIT,
): PropsCache<T> => {
  let primary = createPropsNode<T>();
  let secondary: PropsNode<T> | null = null;
  let size = 0;

  const lookup = (
    root: PropsNode<T>,
    defaultVariants: AnyRecord,
    props: AnyRecord | undefined,
    create: boolean,
  ): PropsNode<T> | typeof UNCACHEABLE | undefined => {
    let node: PropsNode<T> | undefined = root;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      let value = readOwn(props, key);
      const fromDefaults = value === undefined;

      if (fromDefaults) value = readOwn(defaultVariants, key);

      const token = toPropsToken(value);

      if (token === UNCACHEABLE) return UNCACHEABLE;

      node = walkKey(node, token, fromDefaults, create);

      if (!node) return undefined;
    }

    return node;
  };

  return {
    get(defaultVariants, props) {
      const node = lookup(primary, defaultVariants, props, false);

      if (node === UNCACHEABLE) return UNCACHEABLE;

      if (node && node.hasLeaf) return node.leaf as T;

      if (secondary) {
        const fallback = lookup(secondary, defaultVariants, props, false);

        if (fallback === UNCACHEABLE) return UNCACHEABLE;

        if (fallback && fallback.hasLeaf) {
          const promoted = lookup(primary, defaultVariants, props, true);

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
    set(defaultVariants, props, value) {
      if (size >= limit) {
        secondary = primary;
        primary = createPropsNode<T>();
        size = 0;
      }

      const node = lookup(primary, defaultVariants, props, true);

      if (node === UNCACHEABLE || !node) return;

      if (!node.hasLeaf) size++;
      node.hasLeaf = true;
      node.leaf = value;
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
