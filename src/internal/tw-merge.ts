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
import type {JoinClassValue} from "./join-class-value.js";
import type {Merger} from "./merge/index.js";
import type {ConfigExtension} from "./merge/types.js";
import type {TwMergeFn} from "./state.js";
import type {CnAdapter} from "./types.js";

import {isEmptyObject, isEqual} from "../utils.js";

import {joinClassValue} from "./join-class-value.js";
import {createMerger} from "./merge/index.js";
import {state} from "./state.js";

/** Normalize TV config shapes into `{ extend, override }` plus static TM knobs. */
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
  ] as const) {
    if (source[key] !== undefined && extend[key] === undefined) {
      extend[key] = source[key];
    }
  }

  const result: ConfigExtension = {};

  if (source.cacheSize !== undefined) result.cacheSize = source.cacheSize as number;
  if (source.prefix !== undefined) result.prefix = source.prefix as string;
  if (source.experimentalParseClassName !== undefined) {
    result.experimentalParseClassName = source.experimentalParseClassName as NonNullable<
      ConfigExtension["experimentalParseClassName"]
    >;
  }

  if (Object.keys(extend).length > 0) {
    result.extend = extend as NonNullable<ConfigExtension["extend"]>;
  }

  if (source.override != null && !isEmptyObject(source.override as object)) {
    result.override = source.override as NonNullable<ConfigExtension["override"]>;
  }

  if (Object.keys(result).length === 0) return undefined;

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

const ensureConfiguredMerger = (): TwMergeFn => {
  if (!state.cachedTwMerge || state.didTwMergeConfigChange) {
    state.didTwMergeConfigChange = false;
    state.cachedTwMerge = createTwMerge(state.cachedTwMergeConfig);
  }

  return state.cachedTwMerge;
};

const syncTwMergeConfig = (config?: TWMConfig): void => {
  const next = config?.twMergeConfig;

  if (!next || isEmptyObject(next)) return;

  if (!isEqual(next as object, state.cachedTwMergeConfig as object)) {
    state.cachedTwMergeConfig = next;
    state.didTwMergeConfigChange = true;
  }
};

const joinArgs = (classnames: CnOptions): string => joinClassValue(classnames as JoinClassValue[]);

/** True when the string holds one class token (no ASCII whitespace), so merging can be skipped. */
const isSingleToken = (str: string): boolean => {
  if (str.indexOf(" ") !== -1) return false;

  for (let index = 0; index < str.length; index++) {
    const code = str.charCodeAt(index);

    if (code >= 9 && code <= 13) return false;
  }

  return true;
};

// V8 re-hashes freshly joined strings; cache on stable arg string identities instead.
// JSC/SpiderMonkey hash new strings cheaply, so this layer is skipped there.
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
  if (!joined) return "";
  if (isSingleToken(joined)) return joined;

  return getDefaultMerger().mergeString(joined);
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
  inputs: ArrayLike<unknown>,
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
      const item = inputs[index];

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

  if (truthyStringCount === 0) return "";
  if (truthyStringCount === 1) return mergeStringDefault(firstKey);

  const cached = lookupArgCache(firstKey, firstKeyIndex, truthyStringCount, length, inputs);
  if (cached !== undefined) return cached;

  let joined = firstKey;
  const rest: string[] = [];

  for (let index = firstKeyIndex + 1; index < length; index++) {
    const item = inputs[index];

    if (!item) continue;
    joined += " " + (item as string);
    rest.push(item as string);
  }

  const result = mergeStringDefault(joined);
  storeArgCache(firstKey, rest, result);

  return result;
};

const originalStateReset = state.reset.bind(state);

state.reset = () => {
  defaultMerger = undefined;
  clearArgCache();
  originalStateReset();
};

const executeMerge = (classnames: CnOptions, config?: TWMConfig): CnReturn => {
  const base = joinArgs(classnames);

  if (!base) return base;
  if (config?.twMerge === false) return base;
  if (typeof config?.twMerge === "function") return config.twMerge(base);

  if (isSingleToken(base)) return base;

  syncTwMergeConfig(config);

  const hasCustomConfig = Boolean(config?.twMergeConfig && !isEmptyObject(config.twMergeConfig));
  const merge = hasCustomConfig ? ensureConfiguredMerger() : getDefaultMerger().mergeString;

  return merge(base);
};

const isDefaultMergeConfig = (config?: TWMConfig): boolean => {
  if (config == null) return true;
  if (config.twMerge === false) return false;
  if (typeof config.twMerge === "function") return false;
  if (config.twMergeConfig && !isEmptyObject(config.twMergeConfig)) return false;

  return true;
};

export const cnAdapter: CnAdapter = (config, ...classnames) => executeMerge(classnames, config);

/**
 * Combines class names and merges conflicting Tailwind classes (default config).
 */
export const cn = function cn(): CnReturn {
  const length = arguments.length;

  if (length === 0) return "";

  const first = arguments[0];

  if (length === 1) {
    const joined =
      typeof first === "string" ? first : joinClassValue(first as JoinClassValue);

    return mergeStringDefault(joined);
  }

  // Copy values only. Never pass `arguments` out of this function: that would
  // materialize it and deopt the single-arg path above.
  if (IS_V8) {
    const inputs: unknown[] = new Array(length);

    for (let index = 0; index < length; index++) {
      inputs[index] = arguments[index];
    }

    return mergeVariadicCached(inputs);
  }

  let joined = "";

  for (let index = 0; index < length; index++) {
    const item = arguments[index] as JoinClassValue;

    if (!item && item !== 0 && item !== 0n) continue;

    const resolved = typeof item === "string" ? item : joinClassValue(item);

    if (!resolved) continue;

    if (joined) joined += " ";
    joined += resolved;
  }

  return mergeStringDefault(joined);
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
