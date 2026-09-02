import {describe, expect, test} from "vitest";

import {CACHE_MISS, createBoundedCache, createLazyOverrideMerge} from "../internal/cache.js";

const LIMIT = 8;

const countLive = (cache: ReturnType<typeof createBoundedCache<number>>, keys: string[]): number =>
  keys.reduce((total, key) => (cache.get(key) === CACHE_MISS ? total : total + 1), 0);

describe("bounded cache", () => {
  test("retains at most two generations, however the entries were reached", () => {
    // Two generations means the ceiling is 2x the limit. Promoting a secondary hit grows
    // primary exactly as `set` does, so a promotion that ignores the limit lets primary reach
    // limit + |secondary|. That is invisible until the NEXT rotation hands that oversized map
    // over as secondary — which is why this writes another generation after the reads.
    const cache = createBoundedCache<number>(LIMIT);
    const keys = Array.from({length: LIMIT * 4}, (_unused, index) => `key-${index}`);
    const written = keys.slice(0, LIMIT * 3);

    for (const [index, key] of written.entries()) cache.set(key, index);

    for (let round = 0; round < 5; round++) countLive(cache, written);

    for (const key of keys.slice(LIMIT * 3)) cache.set(key, -1);

    expect(countLive(cache, keys)).toBeLessThanOrEqual(LIMIT * 2);
  });

  test("keeps the most recently written entries", () => {
    const cache = createBoundedCache<number>(LIMIT);
    const keys = Array.from({length: LIMIT * 2}, (_unused, index) => `key-${index}`);

    for (const [index, key] of keys.entries()) cache.set(key, index);

    // The whole working set fits inside two generations, so nothing has been dropped yet.
    expect(countLive(cache, keys)).toBe(keys.length);
    expect(cache.get(keys[keys.length - 1])).toBe(keys.length - 1);
  });

  test("clear drops both generations", () => {
    const cache = createBoundedCache<number>(LIMIT);
    const keys = Array.from({length: LIMIT * 2}, (_unused, index) => `key-${index}`);

    for (const [index, key] of keys.entries()) cache.set(key, index);

    cache.clear();

    expect(countLive(cache, keys)).toBe(0);
  });

  test("the override cache serves a working set that fits in two generations", () => {
    const OVERRIDE_LIMIT = 128;
    let merges = 0;
    const merge = createLazyOverrideMerge(() => {
      merges++;

      return "merged";
    }, {});
    const overrides = Array.from({length: OVERRIDE_LIMIT + 64}, (_unused, index) => `m-${index}`);

    for (const className of overrides) merge("core", {className});

    merges = 0;

    for (const className of overrides) merge("core", {className});

    expect(merges).toBe(0);
  });

  test("the override cache promotes within its limit, not past it", () => {
    // Its twin in `createBoundedCache` is covered above; this one is not reachable by asserting
    // hit rate, because an unguarded promotion can only produce MORE hits. It shows up as
    // over-retention: promoting past the limit lets primary reach limit + |secondary|, and the
    // next rotation then hands that oversized map over as secondary.
    const OVERRIDE_LIMIT = 128;
    let merges = 0;
    const merge = createLazyOverrideMerge(() => {
      merges++;

      return "merged";
    }, {});
    const key = (index: number): string => `m-${index}`;

    // Three generations' worth, so the middle third is sitting in secondary with primary full.
    for (let index = 0; index < OVERRIDE_LIMIT * 3; index++) merge("core", {className: key(index)});

    // Re-read the middle third, which is what triggers promotion.
    for (let index = OVERRIDE_LIMIT; index < OVERRIDE_LIMIT * 2; index++) {
      merge("core", {className: key(index)});
    }

    // One more generation forces the rotation that would expose an oversized primary.
    for (let index = OVERRIDE_LIMIT * 3; index < OVERRIDE_LIMIT * 4; index++) {
      merge("core", {className: key(index)});
    }

    merges = 0;

    for (let index = OVERRIDE_LIMIT; index < OVERRIDE_LIMIT + 64; index++) {
      merge("core", {className: key(index)});
    }

    // Two generations cannot hold four, so every one of these is a miss. Without the guard the
    // cache is holding more than it is allowed to and some of them hit.
    expect(merges).toBe(64);
  });

  test("a repeated working set inside the limit never evicts", () => {
    const cache = createBoundedCache<number>(LIMIT);
    const keys = Array.from({length: LIMIT - 1}, (_unused, index) => `key-${index}`);

    for (const [index, key] of keys.entries()) cache.set(key, index);

    for (let round = 0; round < 50; round++) {
      expect(countLive(cache, keys)).toBe(keys.length);
    }
  });

  test("a promoted entry survives the rotation that drops the generation it came from", () => {
    // Promotion is what the second generation is FOR: an entry read while it sits in secondary
    // moves back into primary, so the next rotation keeps it. Returning the value without
    // promoting is indistinguishable from one read — it shows up a rotation later, when the entry
    // that was read most recently is the one that disappears.
    const cache = createBoundedCache<number>(LIMIT);
    const key = (index: number): string => `key-${index}`;

    for (let index = 0; index < LIMIT; index++) cache.set(key(index), index);

    // One more write rotates, so key-0 is now in secondary and primary has room to promote into.
    cache.set(key(LIMIT), LIMIT);

    expect(cache.get(key(0))).toBe(0);

    // Fill primary again so the next write rotates a second time, discarding the generation key-0
    // was originally written into. Only the promoted copy can answer after this.
    for (let index = LIMIT + 1; index <= LIMIT * 2; index++) cache.set(key(index), index);

    expect(cache.get(key(0))).toBe(0);
  });

  test("an override that merges to nothing is still a cache HIT", () => {
    // `undefined` is a legal merge result — a whitespace-only override over an empty core produces
    // it — and a Map returns `undefined` both for a stored undefined and for an absent key. Asking
    // `has` is the only thing that separates them. Without it the entry is re-merged on every call
    // for ever, with correct output throughout, so nothing above this layer can notice.
    let merges = 0;
    const merge = createLazyOverrideMerge(() => {
      merges++;

      return undefined;
    }, {});

    expect(merge("core", {className: "x"})).toBeUndefined();

    merges = 0;

    expect(merge("core", {className: "x"})).toBeUndefined();
    expect(merges).toBe(0);
  });

  test("the override cache promotes an entry whose core is absent from the new generation", () => {
    // Every other case here reuses one core string, so the promotion target always exists
    // already. A real component has one core per variant combination and reuses the same override
    // across them, which makes "the core being promoted is not in this generation yet" the
    // ordinary case rather than the exotic one. As in the flat cache, a promotion that does not
    // land is invisible until the following rotation.
    const OVERRIDE_LIMIT = 128;
    let merges = 0;
    const merge = createLazyOverrideMerge(() => {
      merges++;

      return "merged";
    }, {});

    for (let index = 0; index < OVERRIDE_LIMIT; index++) merge("core-a", {className: `m-${index}`});

    // A different core rotates the cache: core-a's whole generation moves to secondary and the
    // new primary has no entry for it at all.
    merge("core-b", {className: "m-0"});

    merges = 0;

    expect(merge("core-a", {className: "m-5"})).toBe("merged");
    expect(merges).toBe(0);

    // Enough to rotate exactly once more. The promoted copy is in the surviving generation; the
    // original is in the one just discarded.
    for (let index = 0; index < 160; index++) merge("core-c", {className: `c-${index}`});

    merges = 0;

    expect(merge("core-a", {className: "m-5"})).toBe("merged");
    expect(merges).toBe(0);
  });
});
