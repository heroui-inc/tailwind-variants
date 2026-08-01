/*
 * Public `cn` / `cnMerge` adapters over the built-in merger.
 *
 * @see https://github.com/aidenybai/cnfast
 * @see https://github.com/aidenybai/cnfast/blob/main/LICENSE
 * @see https://github.com/dcastil/tailwind-merge
 * @see https://github.com/dcastil/tailwind-merge/blob/main/LICENSE.md
 */

import type {TWMConfig, TWMergeConfig} from "../config.js";
import type {CnOptions, CnReturn} from "../types.js";
import {isEmptyObject} from "../utils.js";
import {type JoinClassValue, joinClassValue} from "./join-class-value.js";
import {createMerger, type Merger} from "./merge/index.js";
import type {ConfigExtension} from "./merge/types.js";
import type {TwMergeFn} from "./state.js";
import {state} from "./state.js";
import type {CnAdapter} from "./types.js";

/** Normalize TV config shapes into `{ extend, override }`. */
const toMergerConfig = (config: TWMergeConfig): ConfigExtension | undefined => {
  if (isEmptyObject(config)) return undefined;

  const source = config as TWMergeConfig & Record<string, unknown>;
  const extend: Record<string, unknown> = {
    ...((source.extend as object | undefined) ?? {}),
  };

  for (const key of [
    "theme",
    "classGroups",
    "conflictingClassGroups",
    "conflictingClassGroupModifiers",
    "postfixLookupClassGroups",
    "orderSensitiveModifiers",
    "cacheSize",
    "prefix",
    "separator",
    "experimentalParseClassName",
  ] as const) {
    if (source[key] !== undefined && extend[key] === undefined) {
      extend[key] = source[key];
    }
  }

  const result: ConfigExtension = {};

  if (Object.keys(extend).length > 0) {
    result.extend = extend as NonNullable<ConfigExtension["extend"]>;
  }

  if (source.override != null && !isEmptyObject(source.override as object)) {
    result.override = source.override as NonNullable<ConfigExtension["override"]>;
  }

  if (!result.extend && !result.override) return undefined;

  return result;
};

const createTwMerge = (cachedTwMergeConfig: TWMergeConfig): TwMergeFn => {
  const extension = toMergerConfig(cachedTwMergeConfig);
  const merger: Merger = createMerger(extension);

  return (classList: string) => merger.mergeString(classList);
};

let defaultMerger: Merger | undefined;

const getDefaultMerger = (): Merger => {
  if (!defaultMerger) defaultMerger = createMerger();

  return defaultMerger;
};

/**
 * One merger per config OBJECT, keyed by identity.
 *
 * A single module slot plus a "did it change" flag served every config in the process, and the
 * flag was set by a shallow comparison — so two objects equal in every value but distinct in
 * identity read as a change, and alternating between them rebuilt the whole tailwind-merge trie on
 * each call. The README's own advice produces exactly that pair: it tells consumers to reuse one
 * config across `tv` / `createTV` / `cnMerge`, so a design system and the application consuming it
 * are two objects that happen to be equal. Measured past the result cache, where the rebuild is
 * actually reached: 702 ns/call for one component against 356,951 ns/call for two.
 *
 * Weak, so a merger dies with the config that keyed it and a component built from a throwaway
 * config leaks nothing.
 *
 * The residual this does NOT close, and cannot: mutating a live config object in place is still
 * invisible, because the identity is unchanged. That is true of every published version and is its
 * own report.
 */
let mergersByConfig = new WeakMap<object, TwMergeFn>();

const ensureConfiguredMerger = (twMergeConfig: TWMergeConfig): TwMergeFn => {
  const existing = mergersByConfig.get(twMergeConfig as object);

  if (existing !== undefined) return existing;

  const created = createTwMerge(twMergeConfig);

  mergersByConfig.set(twMergeConfig as object, created);

  return created;
};

const joinArgs = (classnames: CnOptions): string => joinClassValue(classnames as JoinClassValue[]);

// V8 re-hashes freshly joined strings; cache on stable arg string identities instead.
// JSC/SpiderMonkey hash new strings cheaply — skip this layer there.
const IS_V8 = (() => {
  const error = new Error();

  return !("line" in error) && !("lineNumber" in error);
})();

interface ArgCacheEntry {
  rest: string[];
  result: string;
}

const ARG_CACHE_BUCKET_SIZE = 64;
const ARG_CACHE_SIZE = 500;

let argCache = new Map<string, ArgCacheEntry[]>();
let previousArgCache = new Map<string, ArgCacheEntry[]>();
let argCacheCount = 0;

const clearArgCache = (): void => {
  argCache = new Map();
  previousArgCache = new Map();
  argCacheCount = 0;
};

const mergeStringDefault = (joined: string): CnReturn => {
  if (!joined) return undefined;
  if (joined.indexOf(" ") === -1) return joined;

  return getDefaultMerger().mergeString(joined) || undefined;
};

const storeArgCache = (firstKey: string, rest: string[], result: string): void => {
  let target = argCache.get(firstKey);
  if (target === undefined) {
    target = [];
    argCache.set(firstKey, target);
  }
  if (target.length >= ARG_CACHE_BUCKET_SIZE) target.shift();
  target.push({rest, result});

  if (++argCacheCount > ARG_CACHE_SIZE) {
    argCacheCount = 0;
    previousArgCache = argCache;
    argCache = new Map();
  }
};

const lookupArgCache = (
  firstKey: string,
  firstKeyIndex: number,
  truthyStringCount: number,
  length: number,
  getItem: (index: number) => unknown,
): string | undefined => {
  let bucket = argCache.get(firstKey);
  if (bucket === undefined) bucket = previousArgCache.get(firstKey);
  if (bucket === undefined) return undefined;

  for (let entryIndex = 0; entryIndex < bucket.length; entryIndex++) {
    const entry = bucket[entryIndex]!;
    const rest = entry.rest;

    if (rest.length !== truthyStringCount - 1) continue;

    let restIndex = 0;
    let isMatch = true;

    for (let index = firstKeyIndex + 1; index < length; index++) {
      const item = getItem(index);

      if (!item) continue;
      if (item !== rest[restIndex++]) {
        isMatch = false;
        break;
      }
    }

    if (isMatch) return entry.result;
  }

  return undefined;
};

/** Array-backed path (cnMerge captured args, or cn miss after copy). */
const mergeVariadicCached = (inputs: ArrayLike<unknown>): CnReturn => {
  const length = inputs.length;
  let firstKey = "";
  let firstKeyIndex = -1;
  let truthyStringCount = 0;
  let everyTruthyIsString = true;

  for (let index = 0; index < length; index++) {
    const item = inputs[index];

    if (!item) continue;

    if (typeof item !== "string") {
      everyTruthyIsString = false;
      break;
    }

    if (firstKeyIndex === -1) {
      firstKey = item;
      firstKeyIndex = index;
    }

    truthyStringCount++;
  }

  if (!everyTruthyIsString) {
    return mergeStringDefault(joinArgs(inputs as CnOptions));
  }

  if (truthyStringCount === 0) return undefined;
  if (truthyStringCount === 1) return mergeStringDefault(firstKey);

  const cached = lookupArgCache(
    firstKey,
    firstKeyIndex,
    truthyStringCount,
    length,
    (index) => inputs[index],
  );
  if (cached !== undefined) return cached || undefined;

  let joined = firstKey;
  const rest: string[] = [];

  for (let index = firstKeyIndex + 1; index < length; index++) {
    const item = inputs[index];

    if (!item) continue;
    joined += " " + (item as string);
    rest.push(item as string);
  }

  const result = mergeStringDefault(joined) ?? "";
  storeArgCache(firstKey, rest, result);

  return result || undefined;
};

/**
 * Probe/store arg-cache via getter (cn multi-arg uses `arguments` index access — no copy on hit).
 */
const mergeVariadicFromGetter = (length: number, getItem: (index: number) => unknown): CnReturn => {
  let firstKey = "";
  let firstKeyIndex = -1;
  let truthyStringCount = 0;
  let everyTruthyIsString = true;

  for (let index = 0; index < length; index++) {
    const item = getItem(index);

    if (!item) continue;

    if (typeof item !== "string") {
      everyTruthyIsString = false;
      break;
    }

    if (firstKeyIndex === -1) {
      firstKey = item;
      firstKeyIndex = index;
    }

    truthyStringCount++;
  }

  if (!everyTruthyIsString) {
    const inputs: unknown[] = new Array(length);

    for (let index = 0; index < length; index++) {
      inputs[index] = getItem(index);
    }

    return mergeStringDefault(joinArgs(inputs as CnOptions));
  }

  if (truthyStringCount === 0) return undefined;
  if (truthyStringCount === 1) return mergeStringDefault(firstKey);

  const cached = lookupArgCache(firstKey, firstKeyIndex, truthyStringCount, length, getItem);
  if (cached !== undefined) return cached || undefined;

  let joined = firstKey;
  const rest: string[] = [];

  for (let index = firstKeyIndex + 1; index < length; index++) {
    const item = getItem(index);

    if (!item) continue;
    joined += " " + (item as string);
    rest.push(item as string);
  }

  const result = mergeStringDefault(joined) ?? "";
  storeArgCache(firstKey, rest, result);

  return result || undefined;
};

/**
 * The generation this module's derived state was built under.
 *
 * Read on the way IN rather than cleared on the way out, because clearing would mean writing to
 * `state.reset` at evaluation time — and `"sideEffects": false` tells every bundler it may drop a
 * module imported only for such a write. It did: the `lite` entry never pulls this module, so a
 * reset there cleared the cached config and left the merger and the argument cache alive, a partial
 * reset that reads as a complete one.
 *
 * One integer comparison per merge, and both entries now behave the same whichever modules a
 * bundler kept.
 */
let observedGeneration = state.generation;

const discardStateFromPreviousGeneration = (): void => {
  if (state.generation === observedGeneration) return;

  observedGeneration = state.generation;
  defaultMerger = undefined;
  // A WeakMap cannot be emptied, so it is replaced. Any config still held by a live component
  // rebuilds its merger on the next merge, which is what a reset asks for.
  mergersByConfig = new WeakMap();
  clearArgCache();
};

const executeMerge = (classnames: CnOptions, config?: TWMConfig): CnReturn => {
  // Ahead of `joinArgs`, which reads the argument cache — a stale entry there survives a reset just
  // as a stale merger does.
  discardStateFromPreviousGeneration();

  const base = joinArgs(classnames);

  if (!base || !(config?.twMerge ?? true)) return base || undefined;

  if (base.indexOf(" ") === -1) return base;

  const twMergeConfig = config?.twMergeConfig;
  const merge =
    twMergeConfig && !isEmptyObject(twMergeConfig)
      ? ensureConfiguredMerger(twMergeConfig)
      : getDefaultMerger().mergeString;

  return merge(base) || undefined;
};

const isDefaultMergeConfig = (config?: TWMConfig): boolean => {
  if (config == null) return true;
  if (config.twMerge === false) return false;
  if (config.twMergeConfig && !isEmptyObject(config.twMergeConfig)) return false;

  return true;
};

export const cnAdapter: CnAdapter = (config, ...classnames) => executeMerge(classnames, config);

/**
 * Combines class names and merges conflicting Tailwind classes (default config).
 */
export const cn = function cn(): CnReturn {
  const length = arguments.length;

  if (length === 0) return undefined;

  const first = arguments[0];

  if (length === 1) {
    const joined = typeof first === "string" ? first : joinArgs([first] as CnOptions);

    return mergeStringDefault(joined);
  }

  if (IS_V8) {
    // Capture length; read by index only — no Array allocation on arg-cache hit.
    return mergeVariadicFromGetter(length, (index) => arguments[index]);
  }

  const inputs: unknown[] = new Array(length);

  for (let index = 0; index < length; index++) {
    inputs[index] = arguments[index];
  }

  return mergeStringDefault(joinArgs(inputs as CnOptions));
} as <T extends CnOptions>(...classnames: T) => CnReturn;

/**
 * Combines class names and merges conflicting Tailwind classes.
 * Pass optional `twMerge` / `twMergeConfig` on the second call.
 */
export const cnMerge = <T extends CnOptions>(
  ...classnames: T
): ((config?: TWMConfig) => CnReturn) => {
  return (config) => {
    if (isDefaultMergeConfig(config)) {
      if (IS_V8) return mergeVariadicCached(classnames);

      return mergeStringDefault(joinArgs(classnames));
    }

    return executeMerge(classnames, config);
  };
};
