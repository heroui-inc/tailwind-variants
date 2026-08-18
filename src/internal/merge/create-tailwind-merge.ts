/*
 * Whole-string merge cache + lazy merger factory.
 *
 * @see https://github.com/dcastil/tailwind-merge
 * @see https://github.com/dcastil/tailwind-merge/blob/main/LICENSE.md
 */

import type {JoinClassValue} from "../join-class-value.js";
import type {AnyConfig, ClassNameValue} from "./types.js";

import {joinClassValue} from "../join-class-value.js";

import {createConfigUtils} from "./config-utils.js";

type ConfigUtils = ReturnType<typeof createConfigUtils>;

export interface TailwindMerge {
  (...classLists: ClassNameValue[]): string;
  /** Merge an already-joined class string (skips join). */
  mergeString(classList: string): string;
}

/** Default two-generation whole-string LRU capacity when config omits `cacheSize`. */
const DEFAULT_CACHE_SIZE = 500;

export const createTailwindMerge = (createConfig: () => AnyConfig): TailwindMerge => {
  let configUtils: ConfigUtils;
  let mergeClassList: ConfigUtils["mergeClassList"];

  let cache: Record<string, string> = Object.create(null);
  let previousCache: Record<string, string> = Object.create(null);
  let cacheCount = 0;
  let cacheLimit = DEFAULT_CACHE_SIZE;

  /** Lazy init; self-patches `mergeString` after first call. */
  const initTailwindMerge = (classList: string) => {
    const config = createConfig();
    configUtils = createConfigUtils(config);
    mergeClassList = configUtils.mergeClassList;
    cacheLimit = config.cacheSize ?? DEFAULT_CACHE_SIZE;

    if (cacheLimit < 1) {
      merge.mergeString = mergeClassList;
      return mergeClassList(classList);
    }

    merge.mergeString = tailwindMerge;
    return tailwindMerge(classList);
  };

  const tailwindMerge = (classList: string) => {
    let result = cache[classList];
    if (result !== undefined) {
      return result;
    }

    result = previousCache[classList];
    if (result === undefined) {
      result = mergeClassList(classList);
    }

    cache[classList] = result;
    if (++cacheCount > cacheLimit) {
      cacheCount = 0;
      previousCache = cache;
      cache = Object.create(null);
    }

    return result;
  };

  const merge: TailwindMerge = function (this: void): string {
    const length = arguments.length;

    if (length === 1) {
      const only = arguments[0];

      return typeof only === "string"
        ? merge.mergeString(only)
        : merge.mergeString(joinClassValue(only as JoinClassValue));
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

    return merge.mergeString(joined);
  } as TailwindMerge;

  merge.mergeString = initTailwindMerge;
  return merge;
};
