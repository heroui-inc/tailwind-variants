/*
 * Whole-string merge cache + lazy merger factory.
 *
 * @see https://github.com/dcastil/tailwind-merge
 * @see https://github.com/dcastil/tailwind-merge/blob/main/LICENSE.md
 */

import {type JoinClassValue, joinClassValue} from "../join-class-value.js";
import {createConfigUtils} from "./config-utils.js";
import type {AnyConfig, ClassNameValue} from "./types.js";

type ConfigUtils = ReturnType<typeof createConfigUtils>;

export interface TailwindMerge {
  (...classLists: ClassNameValue[]): string;
  /** Merge an already-joined class string (skips join). */
  mergeString(classList: string): string;
}

/** Two-generation whole-string LRU capacity. */
const MERGE_CACHE_SIZE = 500;

export const createTailwindMerge = (createConfig: () => AnyConfig): TailwindMerge => {
  let configUtils: ConfigUtils;
  let mergeClassList: ConfigUtils["mergeClassList"];

  let cache: Record<string, string> = Object.create(null);
  let previousCache: Record<string, string> = Object.create(null);
  let cacheSize = 0;

  /** Lazy init; self-patches `mergeString` after first call. */
  const initTailwindMerge = (classList: string) => {
    configUtils = createConfigUtils(createConfig());
    mergeClassList = configUtils.mergeClassList;
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
    if (++cacheSize > MERGE_CACHE_SIZE) {
      cacheSize = 0;
      previousCache = cache;
      cache = Object.create(null);
    }

    return result;
  };

  const merge: TailwindMerge = (...args: ClassNameValue[]) =>
    merge.mergeString(joinClassValue(args as JoinClassValue[]));
  merge.mergeString = initTailwindMerge;
  return merge;
};
