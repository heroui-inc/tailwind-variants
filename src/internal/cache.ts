import type {TVConfig} from "../config.js";
import type {AnyRecord, CnAdapter} from "./types.js";

const VARIANT_CACHE_LIMIT = 256;
const OVERRIDE_CACHE_LIMIT = 128;

export const CACHE_MISS = Symbol("tv-cache-miss");

export type CacheMiss = typeof CACHE_MISS;
export type CacheValue = string | undefined;
export type CacheLookup = CacheValue | CacheMiss;

type NestedOverrideCache = {
  get(coreKey: string, overrideKey: string): CacheLookup;
  set(coreKey: string, overrideKey: string, value: CacheValue): void;
};

export type OverrideMerge = (core: CacheValue, props?: AnyRecord) => CacheValue;

// A predicate rather than a boolean, so the caller reads `props` as present afterwards without
// re-asserting it: the check already proves both halves.
const hasClassOverride = (props?: AnyRecord): props is AnyRecord =>
  (props?.class != null && props.class !== "") ||
  (props?.className != null && props.className !== "");

// Tagged per kind: resolution tells `null` from "null" and `0` from "0", so the key must too.
const UNDEFINED_TAG = "u";
const NULL_TAG = "n";
const BOOLEAN_TAG = "b";
const NUMBER_TAG = "#";
const BIGINT_TAG = "i";
const STRING_TAG = "s";

// An absent prop falls back to the default; an explicit null suppresses the variant. Same
// value when the default is null, different result, so the key records which it was.
const DEFAULTED_TAG = "d";

const serializeFingerprintValue = (value: unknown): string | null => {
  // A key with no value and no default is undefined, which is the common case for a variant
  // that carries no default and for a compound-only condition a call omits. It compares by
  // value like any other primitive, so leaving it unkeyable would bypass the cache for exactly
  // those components rather than key them.
  if (value === undefined) return UNDEFINED_TAG;
  if (value === null) return NULL_TAG;

  if (typeof value === "string") return STRING_TAG + value;
  if (typeof value === "boolean") return BOOLEAN_TAG + (value ? "1" : "0");
  // `String(-0)` is already "0", so -0 and 0 share a key without special-casing — which is what
  // resolution does too, since it compares with `===`.
  if (typeof value === "number") return NUMBER_TAG + String(value);
  if (typeof value === "bigint") return BIGINT_TAG + String(value);

  // Objects, functions and symbols compare by IDENTITY in resolution, which no value-based
  // key can represent — so they are unkeyable, and null bypasses the cache for that call.
  return null;
};

/**
 * One read of each dependency prop, yielding both the values resolution will use and the key they
 * will be filed under.
 *
 * Reading twice is the defect this exists to prevent. A prop is under no obligation to answer the
 * same way each time — a reactive getter can recompute, and one that mutates as a side effect can
 * change what the second read sees — so building the KEY from one read and the CLASSES from
 * another files one call's output under another call's key. That entry is then served to every
 * later call with the first key, for the life of the component.
 */
export type PropsSnapshot = {
  /** The dependency props actually supplied, or undefined when the call supplied none of them. */
  captured: AnyRecord | undefined;
  /**
   * The cache key over those values, or null when one of them compares by IDENTITY — an object,
   * a function or a symbol — which no value-based key can represent.
   *
   * Length-prefixed, not delimited: a Tailwind arbitrary value can hold a data URL, so any
   * in-band separator is forgeable by an ordinary class name.
   */
  fingerprint: string | null;
};

/** A record with no prototype, so every consumer-supplied key reads back as the caller left it. */
const createRecord = (): AnyRecord => ({__proto__: null});

/**
 * Reads every dependency prop once, into a reused array, alongside what the key will actually use.
 *
 * Two slots per key, because a repeat call is only answerable from a previous result if BOTH halves
 * are unchanged, and they move independently:
 *
 * - `out[i]` — the value the key is built from: the caller's value, or the DEFAULT when the caller
 *   supplied none. Comparing the caller's raw value alone is wrong, and wrong in the worst way: a
 *   consumer mutating `component.defaultVariants` leaves every raw value identical while the
 *   resolved classes change, so a fast path keyed on raw values serves the old string for ever.
 * - `out[length + i]` — whether it was supplied, which the key records separately because an absent
 *   prop and one explicitly set to the default value resolve the same and key differently.
 *
 * The read itself must happen exactly once — a prop is under no obligation to answer the same way
 * twice — so it happens here and everything downstream works from `out`.
 */
export const readDependencyValues = (
  dependencyKeys: string[],
  defaultVariants: AnyRecord,
  out: unknown[],
  props?: AnyRecord,
): void => {
  const length = dependencyKeys.length;

  for (let i = 0; i < length; i++) {
    const key = dependencyKeys[i];
    // Nullish-guarded because `component(null)` is legal and reaches here. By NAME, which is what
    // both readers in resolution do — see `capturePropsSnapshot`.
    const value = props?.[key];
    const provided = value !== undefined;

    out[i] = provided ? value : defaultVariants[key];
    out[length + i] = provided;
  }
};

/**
 * Whether two reads of the dependency set are the same, across both halves.
 *
 * `!==` rather than `Object.is`, deliberately: resolution compares with `===`, so `-0` and `0` are
 * one value to it and must be one value here. The second clause is the NaN case — `NaN !== NaN`
 * would otherwise report a change on every call and disable the fast path for any component
 * carrying one.
 */
export const sameDependencyValues = (
  previous: unknown[],
  next: unknown[],
  length: number,
): boolean => {
  for (let i = 0; i < length * 2; i++) {
    const a = previous[i];
    const b = next[i];

    if (a !== b && (a === a || b === b)) return false;
  }

  return true;
};

export const capturePropsSnapshot = (
  dependencyKeys: string[],
  values: unknown[],
): PropsSnapshot => {
  let captured: AnyRecord | undefined;
  let fingerprint: string | null = "";

  for (let i = 0; i < dependencyKeys.length; i++) {
    const key = dependencyKeys[i];
    // By NAME, which is what both readers in resolution do, so the capture reproduces what they
    // would have read from the caller's own object. `getVariantValue` reads `props[variant.key]`
    // directly; `getCompleteProps` collects with `for...in` into a plain `{}`, whose reads fall
    // through to `Object.prototype` in exactly the same way. An own-key test matches neither: it
    // drops an INHERITED ENUMERABLE prop — `Object.create({color: "ghost"})` is an ordinary way
    // to build props — so the value stops reaching resolution AND stops reaching the key, and two
    // callers differing only there collide on one entry and render each other's classes.
    //
    // Already read, by `readDependencyValues`. Reading again here is the defect this split exists
    // to prevent: a getter that answers differently across two reads would file one call's classes
    // under another call's key, for the life of the component. `value` is the caller's value when
    // it supplied one and the default otherwise, which is exactly what the key is built from.
    const provided = values[dependencyKeys.length + i] === true;
    const value = values[i];

    if (provided) {
      // Null-prototype, because this is a COPY and `{}` cannot copy faithfully: assigning to
      // `__proto__` sets the prototype and stores nothing, so the value vanishes, and reading
      // `constructor` or `toString` back finds an inherited function where the caller supplied
      // none. Prop names are consumer strings; a dozen of them collide with `Object.prototype`.
      captured ??= createRecord();
      captured[key] = value;
    }

    // An unkeyable value ends the KEY, never the capture: that call still has to resolve, and it
    // resolves from these values.
    if (fingerprint === null) continue;

    const serialized = serializeFingerprintValue(value);

    if (serialized === null) fingerprint = null;
    else fingerprint += `${provided ? "" : DEFAULTED_TAG}${serialized.length}:${serialized}`;
  }

  return {captured, fingerprint};
};

export type BoundedCache<T> = {
  get(key: string): T | CacheMiss;
  set(key: string, value: T): void;
  clear(): void;
};

/** Two-generation bounded Map cache for arbitrary values. */
export const createBoundedCache = <T>(limit = VARIANT_CACHE_LIMIT): BoundedCache<T> => {
  let primary: Map<string, T> = new Map();
  let secondary: Map<string, T> | null = null;

  const rotateIfFull = (): void => {
    if (primary.size < limit) return;

    secondary = primary;
    primary = new Map();
  };

  return {
    get(key: string): T | CacheMiss {
      if (primary.has(key)) return primary.get(key) as T;

      if (secondary?.has(key)) {
        const value = secondary.get(key) as T;

        // Promotion grows primary exactly as `set` does, so it has to respect the same limit —
        // without this, primary reached limit + |secondary| and a 500-key working set against
        // a limit of 256 settled at 756 live entries rather than 512. Rotating here instead
        // would be worse than not promoting: it would discard the very generation being read.
        if (primary.size < limit) primary.set(key, value);

        return value;
      }

      return CACHE_MISS;
    },
    set(key: string, value: T) {
      rotateIfFull();
      primary.set(key, value);
    },
    clear() {
      primary.clear();
      secondary = null;
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
            // Promotion grows primary as `set` does, so it respects the same limit.
            if (size < limit) {
              let promoteInner = primary.get(coreKey);

              if (!promoteInner) {
                promoteInner = new Map();
                primary.set(coreKey, promoteInner);
              }

              // Unconditional: `promoteInner` IS the map read at the top of this method, and an
              // entry it already held would have returned there. This pair is new to primary.
              size++;
              promoteInner.set(overrideKey, value);
            }

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

      // Guarded, unlike the promotion above: the only caller writes after a miss, but the merge
      // between that miss and this write runs `cn`, and a custom tailwind-merge validator is
      // consumer code that can re-enter and write this exact pair first. Counting it twice would
      // shrink the cache a little further on every such call, permanently.
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

    const classVal = props.class;
    const classNameVal = props.className;

    if (
      (classVal != null && classVal !== "" && typeof classVal !== "string") ||
      (classNameVal != null && classNameVal !== "" && typeof classNameVal !== "string")
    ) {
      return cn(config, core, classVal, classNameVal);
    }

    cache ??= createNestedOverrideCache();

    const coreKey = core ?? "";
    // Length-prefixed for the same reason the props fingerprint is: joining two values with a
    // separator lets either of them forge the boundary, and both halves here are strings the
    // caller supplies.
    const classText = typeof classVal === "string" ? classVal : "";
    const classNameText = typeof classNameVal === "string" ? classNameVal : "";
    const overrideKey = `${classText.length}:${classText}${classNameText.length}:${classNameText}`;
    const cached = cache.get(coreKey, overrideKey);

    if (cached !== CACHE_MISS) return cached;

    const merged = cn(config, core, classVal, classNameVal);

    cache.set(coreKey, overrideKey, merged);

    return merged;
  };
};
