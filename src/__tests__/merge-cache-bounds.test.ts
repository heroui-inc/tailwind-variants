import {describe, expect, test} from "vitest";

import {cn} from "../index";
import {MERGE_CACHE_BYTES, MERGE_CACHE_SIZE} from "../internal/merge/create-tailwind-merge.js";
import {createMerger} from "../internal/merge/index.js";
import {ARG_CACHE_BYTES, ARG_CACHE_SIZE, readArgCacheStats} from "../internal/tw-merge.js";

/*
 * The merge cache rotates on an entry COUNT alone unless a byte budget sits beside it, so a handful
 * of large merges grow it without limit. Five hundred entries of a few hundred bytes is the shape
 * the count was chosen for; five hundred entries of sixty kilobytes is thirty megabytes, and
 * nothing stops it.
 *
 * Eviction is observable, which is what makes this a test rather than a heap measurement. A class
 * validator is consulted while a class list is parsed, and parsing happens only on a MISS — a hit
 * returns the memoised string without reaching the parser. So a validator that counts its own calls
 * is an exact hit/miss oracle, and every assertion below is a count. Nothing here measures the
 * machine, and nothing is a duration.
 *
 * The cache keeps two generations, so one rotation moves an entry to `previousCache` where it is
 * still served; only the second drops it. The filler is therefore sized from `MERGE_CACHE_BYTES`
 * to force two, and measured rather than guessed — a hardcoded count would silently stop forcing
 * anything the first time the budget or the merge output changed.
 */

/** Distinct class names, so no two filler merges share a cache entry. */
const buildFiller = (index: number): string => {
  const parts: string[] = [];

  for (let i = 0; i < 4000; i++) parts.push(`probe-f${index}x${i}`);

  return parts.join(" ");
};

const createCountingMerger = (): {merge: (input: string) => string; calls: () => number} => {
  let validatorCalls = 0;
  const merge = createMerger((defaultConfig) => ({
    ...defaultConfig,
    classGroups: {
      ...defaultConfig.classGroups,
      probeGroup: [
        {
          probe: [
            (classPart: string) => {
              validatorCalls++;

              return classPart.length > 0;
            },
          ],
        },
      ],
    },
  }));

  return {merge: (input: string) => merge(input), calls: () => validatorCalls};
};

describe("merge cache bounds", () => {
  test("a counting validator sees a miss but not a hit", () => {
    // The control for the eviction case below. Without it, a validator that fired on every call
    // would make that test pass for a reason unrelated to eviction.
    const {merge, calls} = createCountingMerger();

    merge("probe-alpha probe-beta");
    const afterMiss = calls();

    expect(afterMiss).toBeGreaterThan(0);

    merge("probe-alpha probe-beta");

    expect(calls()).toBe(afterMiss);
  });

  test("large merges evict an earlier entry well below the entry limit", () => {
    const {merge, calls} = createCountingMerger();
    const subject = "probe-alpha probe-beta";
    const firstResult = merge(subject);

    // Both halves of an entry are charged: the joined input keys it and the merged output is the
    // value. Measured from a real filler rather than assumed, because this class group collapses
    // to a single class and the output is nothing like the input's size.
    const sampleInput = buildFiller(0);
    const entryCost = sampleInput.length + merge(sampleInput).length;
    // Two rotations, plus one entry so the second is actually crossed rather than just reached.
    const fillerCount = Math.ceil((2 * MERGE_CACHE_BYTES) / entryCost) + 1;

    // The whole point of the byte bound: this stays far below the entry ceiling, so the count
    // bound cannot be what rotated the cache. If this ever fails, the test has stopped testing
    // bytes and is testing entries instead.
    expect(fillerCount).toBeLessThan(MERGE_CACHE_SIZE);

    for (let i = 1; i <= fillerCount; i++) merge(buildFiller(i));

    const callsBeforeReMerge = calls();
    const secondResult = merge(subject);

    // Evicted by bytes, so this is a miss and the parser runs again.
    expect(calls()).toBeGreaterThan(callsBeforeReMerge);

    // Rotation must never change the answer.
    expect(secondResult).toBe(firstResult);
  });
});

/*
 * The argument cache carries the same byte budget, and it needs a different instrument.
 *
 * The validator oracle above cannot reach it: `mergeVariadicCached` runs only when the config IS
 * the default one, and installing a counting validator requires a custom config, which routes past
 * the argument cache entirely. The two are mutually exclusive by construction rather than by
 * accident, so the cache reports its own counters instead. They are still counts — nothing here is
 * a duration or a heap weight.
 */
describe("argument cache bounds", () => {
  test("rotates on bytes long before the entry ceiling", () => {
    const before = readArgCacheStats();

    // Each call is a distinct pair of long class lists, so no call can be served from a previous
    // one and every one charges its full weight against the budget.
    const buildArgument = (index: number, half: string): string => {
      const parts: string[] = [];

      for (let i = 0; i < 500; i++) parts.push(`argprobe-${half}-${index}-${i}`);

      return parts.join(" ");
    };

    // Sized from the budget rather than guessed: two arguments of ~9 KB each, so a couple of
    // hundred calls crosses a mebibyte while staying nowhere near 500 entries.
    const perCall = buildArgument(0, "a").length + buildArgument(0, "b").length;
    const calls = Math.ceil((2 * ARG_CACHE_BYTES) / perCall) + 1;

    expect(calls).toBeLessThan(ARG_CACHE_SIZE);

    for (let index = 1; index <= calls; index++) {
      cn(buildArgument(index, "a"), buildArgument(index, "b"));
    }

    const after = readArgCacheStats();

    // The byte bound is the only thing that could have rotated it: far fewer entries were stored
    // than the entry ceiling allows.
    expect(after.rotations).toBeGreaterThan(before.rotations);
    expect(after.entriesAtLastRotation).toBeLessThan(ARG_CACHE_SIZE);
  });
});
