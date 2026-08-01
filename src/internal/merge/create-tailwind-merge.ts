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
export const MERGE_CACHE_SIZE = 500;

/**
 * Second bound on the same cache, in UTF-16 code units rather than entries.
 *
 * Counting entries alone says nothing about what a generation holds: 500 short class lists are a
 * few hundred kilobytes, and 500 large ones are hundreds of megabytes. A component with thousands
 * of compound variants, or a design system composing long arbitrary-value lists, merges strings
 * big enough that the entry ceiling is never reached at all — so the cache grew linearly and
 * without limit under a legal workload. Measured before this bound: successive blocks of the same
 * workload each added ~1.8 MB and never plateaued.
 *
 * A budget rather than a per-entry cap, so one large merge is still cached — it is the ACCUMULATION
 * that has to stop, not the caching of anything big. An entry larger than the whole budget rotates
 * the generation on its own, which is the correct degenerate case: it stays cached, and it is the
 * only thing in its generation.
 *
 * Sized so the common case never reaches it: a realistic component merges a handful of tokens, so
 * 500 entries land far under a mebibyte and the entry bound still decides.
 *
 * Exported so `merge-cache-bounds.test.ts` derives its workload from the budget rather than
 * hardcoding a size that a change here would silently invalidate. Eviction is observable without
 * weighing the heap: a class validator is consulted while a class list is parsed, and parsing
 * happens only on a MISS, so a counting validator is an exact hit/miss oracle.
 */
export const MERGE_CACHE_BYTES = 1 << 20;

export const createTailwindMerge = (createConfig: () => AnyConfig): TailwindMerge => {
  let configUtils: ConfigUtils;
  let mergeClassList: ConfigUtils["mergeClassList"];

  let cache: Record<string, string> = Object.create(null);
  let previousCache: Record<string, string> = Object.create(null);
  let cacheSize = 0;
  let cacheBytes = 0;

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
    // Both halves of the entry are retained — the joined input keys it and the merged output is
    // the value — so both are charged against the budget.
    cacheBytes += classList.length + result.length;

    if (++cacheSize > MERGE_CACHE_SIZE || cacheBytes > MERGE_CACHE_BYTES) {
      cacheSize = 0;
      cacheBytes = 0;
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
