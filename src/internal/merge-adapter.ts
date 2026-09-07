/*
 * Product adapter over the vendored engine. A `twMergeConfig` needs the table
 * compiler, which only the `tailwind-variants/config` entry ships, so this
 * module knows three merge modes: the default engine, `twMerge: false`, and an
 * injected `twMerge` function.
 */

import type {TWMConfig, TwMergeFn} from "../config.js";
import type {CnOptions, CnReturn} from "../types.js";
import type {JoinClassValue} from "./join-class-value.js";
import type {CnFunction, Engine} from "./merge-engine/types.js";
import type {MergeAdapter, MergeAdapterFactory} from "./types.js";

import {cx, isEmptyObject} from "../utils.js";

import {cn, DEFAULT_CACHE_SIZE, engine} from "./engine-instance.js";
import {joinClassValue} from "./join-class-value.js";
import {state} from "./state.js";

// One engine, its clsx-style `cn`, and the adapter recipes use.
export interface MergeApi {
  engine: Engine;
  cn: CnFunction;
  adapter: MergeAdapter;
  // Drop cached override results (test isolation).
  reset(): void;
}

// True when the string holds one class token (no ASCII whitespace), so merging can be skipped.
const isSingleToken = (str: string): boolean => {
  if (str.indexOf(" ") !== -1) return false;

  for (let index = 0; index < str.length; index++) {
    const code = str.charCodeAt(index);

    if (code >= 9 && code <= 13) return false;
  }

  return true;
};

const OVERRIDE_GENERATION_SIZE = 1024;
const PARTS_BUCKET_CAP = 256;
const PARTS_GENERATION_SIZE = 1000;

interface PartsEntry {
  // the strings, in order (compared with `===`)
  a: string[];
  // merged result
  r: string;
}

// Override value → class string; `0` and bigint zero keep their text like `cx`.
const overrideText = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : joinClassValue(value as JoinClassValue);

const joinOverride = (core: string, first: string, second: string): string => {
  if (!core) return first ? (second ? `${first} ${second}` : first) : second;
  if (!first) return second ? `${core} ${second}` : core;

  return second ? `${core} ${first} ${second}` : `${core} ${first}`;
};

// Build the adapter for an engine. `cacheSize === 0` bypasses the override
// cache and the doorkeeper: every call joins and runs `mergeUncached`.
export const createMergeApi = (engine: Engine, cn: CnFunction, cacheSize: number): MergeApi => {
  const {mergeString, mergeUncached, seenBefore} = engine;
  const cached = cacheSize > 0;

  // Recipe strings keep their identity call after call, so tuples are cached
  // per first string and a hit never joins or hashes. The doorkeeper admits a
  // joined string on its second sighting; generations rotate, never clear.
  let partsCache = new Map<string, PartsEntry[]>();
  let prevPartsCache = new Map<string, PartsEntry[]>();
  let partsCount = 0;

  const parts = (list: readonly string[], count: number): string => {
    if (count === 0) return "";

    const first = list[0]!;

    if (count === 1) {
      if (isSingleToken(first)) return first;
      if (!cached) return mergeUncached(first);

      return seenBefore(first) ? mergeString(first) : mergeUncached(first);
    }

    if (!cached) {
      let joined = first;

      for (let i = 1; i < count; i++) joined += ` ${list[i]}`;

      return mergeUncached(joined);
    }

    let bucket = partsCache.get(first);

    if (bucket === undefined) {
      bucket = prevPartsCache.get(first);
      if (bucket !== undefined) partsCache.set(first, bucket); // promote
    }

    if (bucket !== undefined) {
      outer: for (let b = 0; b < bucket.length; b++) {
        const entry = bucket[b]!;
        const tuple = entry.a;

        if (tuple.length !== count) continue;
        for (let i = 1; i < count; i++) {
          if (list[i] !== tuple[i]) continue outer;
        }

        return entry.r;
      }
    }

    let joined = first;

    for (let i = 1; i < count; i++) joined += ` ${list[i]}`;

    // first sighting: merge straight through, remember nothing
    if (!seenBefore(joined)) return mergeUncached(joined);

    const merged = mergeString(joined);

    if (bucket === undefined) partsCache.set(first, (bucket = []));
    if (bucket.length >= PARTS_BUCKET_CAP) bucket.shift();
    bucket.push({a: list.slice(0, count), r: merged});
    if (++partsCount > PARTS_GENERATION_SIZE) {
      partsCount = 0;
      prevPartsCache = partsCache;
      partsCache = new Map();
    }

    return merged;
  };

  // `class` / `className` arrive as fresh strings with the same text on most
  // renders, so overrides are keyed by text (core → text → merged), with the
  // same doorkeeper admission and generation rotation as above.
  let overrideCache = new Map<string, Map<string, string>>();
  let prevOverrideCache = new Map<string, Map<string, string>>();
  let overrideCount = 0;
  let memoCore = "";
  let memoFirst = "";
  let memoSecond = "";
  let memoResult = "";

  const override = (core: string, classValue: unknown, classNameValue: unknown): string => {
    const first = overrideText(classValue);
    const second = overrideText(classNameValue);

    if (!first && !second) return core;
    if (!cached) return mergeUncached(joinOverride(core, first, second));
    if (core === memoCore && first === memoFirst && second === memoSecond) return memoResult;

    const key = first ? (second ? `${first}\0${second}` : first) : second;
    let inner = overrideCache.get(core);

    if (inner === undefined) {
      inner = prevOverrideCache.get(core);
      if (inner !== undefined) overrideCache.set(core, inner); // promote
    }

    let merged = inner === undefined ? undefined : inner.get(key);

    if (merged === undefined) {
      const joined = joinOverride(core, first, second);

      // first sighting: merge straight through, remember nothing
      if (!seenBefore(joined)) return mergeUncached(joined);

      merged = mergeString(joined);
      if (inner === undefined) overrideCache.set(core, (inner = new Map()));
      inner.set(key, merged);
      if (++overrideCount > OVERRIDE_GENERATION_SIZE) {
        overrideCount = 0;
        prevOverrideCache = overrideCache;
        overrideCache = new Map();
      }
    }

    memoCore = core;
    memoFirst = first;
    memoSecond = second;
    memoResult = merged;

    return merged;
  };

  return {
    engine,
    cn,
    adapter: {parts, override},
    reset() {
      partsCache = new Map();
      prevPartsCache = new Map();
      partsCount = 0;
      overrideCache = new Map();
      prevOverrideCache = new Map();
      overrideCount = 0;
      memoCore = "";
      memoFirst = "";
      memoSecond = "";
      memoResult = "";
    },
  };
};

export const defaultApi = createMergeApi(engine, cn, DEFAULT_CACHE_SIZE);

state.onReset(() => {
  defaultApi.reset();
});

// True when a config carries a non-empty `twMergeConfig`.
export const hasCustomMergeConfig = (config: TWMConfig): boolean => {
  const custom = (config as {twMergeConfig?: unknown}).twMergeConfig;

  return custom != null && !isEmptyObject(custom);
};

// The default entry cannot compile tables; point at the entry that can.
const customMergeConfigError = (): TypeError =>
  new TypeError(
    "[tailwind-variants] `twMergeConfig` is only supported by the `tailwind-variants/config` " +
      "entry. Import `tv`, `createTV`, or `cnMerge` from there, or inject a merge function " +
      "with `twMerge`.",
  );

// Recipe strings are whitespace-normalized at compile time, so a plain join equals `cx`.
const joinParts = (list: readonly string[], count: number): string => {
  if (count === 0) return "";

  let joined = list[0]!;

  for (let i = 1; i < count; i++) joined += ` ${list[i]}`;

  return joined;
};

// `twMerge: false`: `cx` only.
const joinAdapter: MergeAdapter = {
  parts: joinParts,
  override: (core, classValue, classNameValue) =>
    cx(core, classValue as JoinClassValue, classNameValue as JoinClassValue),
};

// `twMerge: fn`: join, then hand the whole string to the injected function.
const createFunctionAdapter = (merge: TwMergeFn): MergeAdapter => {
  const apply = (joined: string): string => (joined ? merge(joined) : "");

  return {
    parts: (list, count) => apply(joinParts(list, count)),
    override: (core, classValue, classNameValue) =>
      apply(cx(core, classValue as JoinClassValue, classNameValue as JoinClassValue)),
  };
};

// Adapter for the merge modes every entry supports. Returns null for a custom
// table config, which only the `tailwind-variants/config` entry can serve.
export const createBaseMergeAdapter = (config: TWMConfig): MergeAdapter | null => {
  if (config.twMerge === false) return joinAdapter;
  if (typeof config.twMerge === "function") return createFunctionAdapter(config.twMerge);
  if (hasCustomMergeConfig(config)) return null;

  return defaultApi.adapter;
};

// Adapter for a resolved recipe config on the default entry.
export const createMergeAdapter: MergeAdapterFactory = (config) => {
  const adapter = createBaseMergeAdapter(config);

  if (adapter === null) throw customMergeConfigError();

  return adapter;
};

// Join the captured arguments with `cx` semantics (used for `twMerge: false` / functions).
const joinValues = (values: readonly unknown[]): string => cx(...(values as JoinClassValue[]));

/**
 * Combines class names and merges conflicting Tailwind classes.
 * Pass optional `twMerge` on the second call.
 */
export const cnMerge = <T extends CnOptions>(
  ...classnames: T
): ((config?: TWMConfig) => CnReturn) => {
  return (config) => {
    if (config == null) return cn(...(classnames as Parameters<CnFunction>));
    if (config.twMerge === false) return joinValues(classnames);
    if (typeof config.twMerge === "function") {
      const joined = joinValues(classnames);

      return joined ? config.twMerge(joined) : "";
    }
    if (hasCustomMergeConfig(config)) throw customMergeConfigError();

    return cn(...(classnames as Parameters<CnFunction>));
  };
};

export {cn};
