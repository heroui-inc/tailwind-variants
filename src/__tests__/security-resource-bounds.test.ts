import {describe, expect, test} from "vitest";

import {tv} from "../index";
import {createCompoundsTracker, metadataBounds} from "../internal/compounds-tracker.js";
import {defineVariants} from "./support/loose.js";

// Denial-of-service and resource-exhaustion cases: what a component costs, and what it holds, when
// the metadata or the props are shaped by someone who wants it to be expensive.
//
// Every case here counts something DISCRETE — consumer property reads, resolves, cache entries —
// rather than measuring time. A timing assertion on a shared machine is a machine measurement,
// and the questions below all have exact answers: how many times did the caller's getter run, how
// many entries survived, did the same call resolve twice.

/**
 * Metadata whose keys sit `depth` levels up a prototype chain, with every read counted.
 *
 * `for...in` shadow-checks each key against every object above it, so enumerating this costs
 * O(keys x depth) while spending only O(keys) of the walk's step budget — which is the whole
 * point: the budget cannot see the depth factor.
 */
const countingDeepChain = (
  keys: number,
  depth: number,
): {value: object; reads: () => number; reset: () => void} => {
  let reads = 0;
  const root: Record<string, unknown> = {};

  for (let index = 0; index < keys; index++) {
    Object.defineProperty(root, `p${index}`, {
      enumerable: true,
      get() {
        reads++;

        return 0;
      },
    });
  }

  let value: object = root;

  for (let level = 0; level < depth; level++) value = Object.create(value);

  return {value, reads: () => reads, reset: () => (reads = 0)};
};

/** A metadata object whose keys are all INHERITED accessors, so every read is counted. */
const countingPrototype = (
  keys: number,
  own: boolean,
): {value: object; reads: () => number; reset: () => void} => {
  let reads = 0;
  const host: Record<string, unknown> = {};

  for (let index = 0; index < keys; index++) {
    Object.defineProperty(host, `p${index}`, {
      enumerable: true,
      get() {
        reads++;

        return 0;
      },
    });
  }

  return {
    value: own ? host : Object.create(host),
    reads: () => reads,
    reset: () => {
      reads = 0;
    },
  };
};

/** Counts resolves: the variant map is read exactly once per resolve, never on a cache hit. */
const countingVariants = (): {values: object; resolves: () => number} => {
  let resolves = 0;
  const values: Record<string, unknown> = {};

  Object.defineProperty(values, "a", {
    enumerable: true,
    get() {
      resolves++;

      return "text-a";
    },
  });

  return {values, resolves: () => resolves};
};

describe("resource bounds under hostile input", () => {
  test("a cache HIT still costs one consumer read per metadata key, on every call", () => {
    // The cost the three termination bounds do NOT cover. They bound a walk; nothing bounds how
    // OFTEN it runs, so change detection is O(metadata) per call whether or not the result is
    // served from cache. The reads below are the caller's own getters, and they run again on a
    // call that computes nothing.
    //
    // 500 keys is the measurable floor of a shape that has no ceiling: the step budget stops the
    // walk at 1,048,576 steps, and 500 keys spends 0.1% of it. Wall time is not asserted here —
    // it is not a property of the code — but it is what makes this matter: the same 1,000,001
    // steps measured 107 ms over own keys and 2,254 ms over a 200-deep prototype chain, per call,
    // for the life of the component, with the cache hitting throughout.
    const METADATA_KEYS = 500;
    const metadata = countingPrototype(METADATA_KEYS, false);
    const variants = countingVariants();
    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: variants.values},
      compoundVariants: [{tone: "a", class: metadata.value}],
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 5; call++) button({tone: "a"});

    metadata.reset();

    const resolvesBefore = variants.resolves();
    const CALLS = 10;

    for (let call = 0; call < CALLS; call++) button({tone: "a"});

    // Nothing was recomputed — every one of these calls was served from the cache.
    expect(variants.resolves()).toBe(resolvesBefore);
    // And every one of them still read all 500 keys of the metadata. Pinned as an EQUALITY rather
    // than a ceiling: were detection ever amortised across calls this would drop to `METADATA_KEYS`
    // or to zero, and that is a change worth failing on rather than passing silently. On this
    // build the ceiling form reads `expected 5000 to be less than or equal to 500`.
    expect(metadata.reads()).toBe(METADATA_KEYS * CALLS);
  });

  test("metadata on a deep prototype chain stops being walked, instead of being re-walked per ask", () => {
    // The bound the other three do not give you. A visited set, a depth cap and a step ceiling all
    // bound ONE walk; none of them bounds how expensive a single STEP is. `for...in` shadow-checks
    // every key it yields against every object above it, so enumerating one object on a 200-deep
    // chain costs O(keys x depth) while spending only O(keys) of the budget — and the budget
    // resets per walk, so it is paid again on every call, for the life of the component, with the
    // cache hitting throughout.
    //
    // Driven against the tracker directly, because through `tv()` the signal is unreadable: the
    // latch disables the cache, so every later call resolves, and resolving enumerates the same
    // class object. The getter count is identical either way — the 200x is shadow-checking, which
    // no consumer getter can observe. Here the walk is the only reader, so "did it walk again" is
    // exactly what the count answers.
    const chain = countingDeepChain(400, 200);
    const tracker = createCompoundsTracker(
      [{conditionKeys: [], source: {class: chain.value}}] as never,
      [] as never,
      () => undefined,
    );

    // First ask walks, meets the chain, and latches.
    tracker.takeChange();
    chain.reset();

    tracker.takeChange();
    tracker.takeChange();

    // Nothing further is read: a latched tracker reports "changed" without walking at all. It is
    // slower than a cache hit and never silently stale, which is the trade the other two
    // truncating bounds already make.
    expect(chain.reads()).toBe(0);
  });

  test("the bounds are configurable, and a tracker fixes them at construction", () => {
    // The bounds are a policy a consumer can state, so this pins that stating it WORKS — an
    // exported knob nothing reads is worse than no knob, because it reads as configurable.
    //
    // Also pins the granularity: a tracker snapshots the bounds when it is built, so raising one
    // afterwards does not reach back into a component already in flight. That is what stops one
    // walk recording against one limit and the next comparing against another, which would report
    // a change for a reason that has nothing to do with the metadata.
    const previous = {...metadataBounds};

    try {
      const chain = countingDeepChain(50, 40);

      // Raised past the chain: the walk now descends where the default latched it.
      metadataBounds.prototypeExcess = 100;

      const permissive = createCompoundsTracker(
        [{conditionKeys: [], source: {class: chain.value}}] as never,
        [] as never,
        () => undefined,
      );

      permissive.takeChange();
      chain.reset();
      permissive.takeChange();

      expect(chain.reads()).toBeGreaterThan(0);

      // Lowering it now must NOT reach the tracker above — it fixed its bounds at construction.
      metadataBounds.prototypeExcess = 1;
      chain.reset();
      permissive.takeChange();

      expect(chain.reads()).toBeGreaterThan(0);

      // A tracker built AFTER the change gets the new bound, and latches on the same metadata.
      const strict = createCompoundsTracker(
        [{conditionKeys: [], source: {class: chain.value}}] as never,
        [] as never,
        () => undefined,
      );

      strict.takeChange();
      chain.reset();
      strict.takeChange();

      expect(chain.reads()).toBe(0);
    } finally {
      Object.assign(metadataBounds, previous);
    }
  });

  test("the step budget counts steps, and a step's cost is the consumer's to choose", () => {
    // Own keys and inherited keys are the same NUMBER of steps and the same fraction of the
    // budget, which is the point: the ceiling that decides when to give up cannot see that one of
    // them is twenty times more expensive to take. `for...in` over a prototype chain shadow-checks
    // every key against every object above it, so the per-key cost rises with the chain while the
    // step count stays flat.
    const KEYS = 400;
    const measure = (own: boolean): number => {
      const metadata = countingPrototype(KEYS, own);
      const button = defineVariants(tv, {
        base: "base",
        variants: {tone: {a: "text-a"}},
        compoundVariants: [{tone: "a", class: metadata.value}],
        defaultVariants: {tone: "a"},
      });

      for (let call = 0; call < 4; call++) button({tone: "a"});

      metadata.reset();
      button({tone: "a"});

      return metadata.reads();
    };

    expect(measure(true)).toBe(KEYS);
    expect(measure(false)).toBe(KEYS);
  });

  test("a value past the step ceiling still renders, and still updates when it changes", () => {
    // Truncation must be slow-but-correct, never a silent wrong answer. Resolution recurses a
    // nested class value with no limit, so an element the walk never reached still RENDERS — and
    // if detection also reported "unchanged" for it, the cache would serve the pre-mutation string
    // for ever with nothing looking wrong.
    //
    // A sparse array is the cheap way to spend the ceiling: 1.1M holes read as undefined, one step
    // each, with no allocation. Index 1,050,000 sits past the 1,048,576-step budget.
    const oversized = new Array<unknown>(1_100_000);

    oversized[0] = "cv-first";
    oversized[1_050_000] = "cv-past-the-bound";

    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [{tone: "a", class: oversized}],
      defaultVariants: {tone: "a"},
    });

    // Warmed past the two calls that answer "changed" for a reason that is not the latch: the cold
    // invoke never asks the tracker at all, and its FIRST ask has no snapshot to compare against.
    // Mutating before those are spent asserts nothing about truncation, because the recompute is
    // owed either way — a tracker that RECORDS a truncated walk and then compares it against
    // itself, which is exactly the silently-stale answer this case exists to rule out, is served
    // by the same two calls and passes unchallenged.
    for (let call = 0; call < 4; call++) button({tone: "a"});

    expect(button({tone: "a"})).toHaveClass(["base", "text-a", "cv-first", "cv-past-the-bound"]);

    oversized[1_050_000] = "cv-mutated";

    expect(button({tone: "a"})).toHaveClass(["base", "text-a", "cv-first", "cv-mutated"]);
  });

  test("spending a bound disables the cache for the life of the component", () => {
    // The latch, end to end. It is the correct trade — a truncated walk compares equal to ITSELF
    // for ever, so reporting "changed" is the only answer that is not a silent stale one — but it
    // is permanent: shrinking the metadata afterwards does not bring the cache back, because a
    // latched tracker never walks again to find out.
    const oversized = new Array<unknown>(1_100_000);

    oversized[0] = "cv";

    const compound: Record<string, unknown> = {tone: "a", class: oversized};
    const variants = countingVariants();
    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: variants.values},
      compoundVariants: [compound],
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 3; call++) button({tone: "a"});

    const latchedBefore = variants.resolves();

    for (let call = 0; call < 5; call++) button({tone: "a"});

    expect(variants.resolves() - latchedBefore).toBe(5);

    // The oversized value is gone, and the component is still paying for it.
    compound.class = "cv";

    for (let call = 0; call < 3; call++) button({tone: "a"});

    const shrunkBefore = variants.resolves();

    for (let call = 0; call < 5; call++) button({tone: "a"});

    expect(variants.resolves() - shrunkBefore).toBe(5);
  });

  test("a stream of distinct prop values keeps at most two generations live", () => {
    // The entry bound, end to end rather than over `createBoundedCache` directly. A caller who
    // controls a variant prop mints a distinct key per call, so the only thing standing between
    // that and unbounded growth is the rotation and the guard on the promotion path.
    //
    // `nonce` is a COMPOUND CONDITION here, not a stray prop. Only a declared variant key or a
    // compound condition key reaches the fingerprint — a prop neither of those cannot change the
    // result, so it is not keyed and cannot mint an entry at all.
    const LIMIT = 256;
    const DISTINCT = LIMIT * 5;
    const variants = countingVariants();
    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: variants.values},
      compoundVariants: [{tone: "a", nonce: "never-matches", class: "cv"}],
      defaultVariants: {tone: "a"},
    });

    for (let index = 0; index < DISTINCT; index++) {
      button({tone: "a", nonce: `n-${index}`});
    }

    // Probed newest-first. Walking forwards would rotate the surviving generations out with the
    // misses the probe itself writes, and count zero however large the cache was.
    let live = 0;

    for (let index = DISTINCT - 1; index >= 0; index--) {
      const before = variants.resolves();

      button({tone: "a", nonce: `n-${index}`});
      if (variants.resolves() === before) live++;
    }

    expect(live).toBeLessThanOrEqual(LIMIT * 2);
    expect(live).toBeGreaterThan(0);
  });

  test("the entry bound is on COUNT, so a caller chooses how many bytes each entry holds", () => {
    // Two calls whose values differ by one character deep inside a 64 KB string are two distinct
    // entries, which is only possible if the key embeds the whole value. The cache therefore holds
    // up to 512 variant entries and 256 override pairs of WHATEVER SIZE the caller passes — the
    // bound is on how many, never on how big.
    //
    // Measured end to end: 600 calls at 100 KB per value settle at 32.9 MB retained for one
    // component, against 0.65 MB for the same load with no cache at all.
    const variants = countingVariants();
    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: variants.values},
      compoundVariants: [{tone: "a", nonce: "never-matches", class: "cv"}],
      defaultVariants: {tone: "a"},
    });
    const bulk = "x".repeat(64 * 1024);

    // The first invoke of a component deliberately skips the cache, so it is spent here rather
    // than on one of the values under test.
    button({tone: "a", nonce: "warm"});

    button({tone: "a", nonce: `${bulk}a${bulk}`});
    button({tone: "a", nonce: `${bulk}b${bulk}`});

    const repeatBefore = variants.resolves();

    button({tone: "a", nonce: `${bulk}a${bulk}`});
    button({tone: "a", nonce: `${bulk}b${bulk}`});

    // Both repeats hit, so both large values are being held verbatim as keys.
    expect(variants.resolves()).toBe(repeatBefore);

    // And a third value one character apart from the first is a MISS, not a collision.
    const distinctBefore = variants.resolves();

    button({tone: "a", nonce: `${bulk}c${bulk}`});

    expect(variants.resolves()).toBe(distinctBefore + 1);
  });

  test("an override stream is bounded by pair count, not by override size", () => {
    // The same shape on the override cache, whose key is `class`/`className` — the prop a consumer
    // most often forwards straight from caller-supplied data.
    //
    // The COUNT is pinned over the primitive, in `bounded-cache.test.ts`, and cannot be pinned from
    // here: through `tv()` a hit and a miss return the same string — the merge is deterministic and
    // re-syncs its config from the component on every call — so a cache that never evicts answers
    // exactly as one bounded at 128 pairs does. What a value CAN show is the half this case owns:
    // WHICH override each pair answers with, at whatever size the caller chose.
    const OVERRIDE_LIMIT = 128;
    const DISTINCT = OVERRIDE_LIMIT * 5;
    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      defaultVariants: {tone: "a"},
    });

    for (let index = 0; index < DISTINCT; index++) button({tone: "a", class: `o-${index}`});

    // Correctness survives the churn: the cache is a memo, not a source of truth. Probed at both
    // ends of retention — one written generations back and long evicted, one the last pair written
    // and still resident — and NEITHER of them is `o-0`. A cache that drops the override half of
    // its key collapses every pair sharing a core onto the FIRST value written, which makes `o-0`
    // the single override it still answers correctly while serving `o-0`'s classes to all the rest.
    expect(button({tone: "a", class: `o-${OVERRIDE_LIMIT - 1}`})).toHaveClass([
      "base",
      "text-a",
      `o-${OVERRIDE_LIMIT - 1}`,
    ]);
    expect(button({tone: "a", class: `o-${DISTINCT - 1}`})).toHaveClass([
      "base",
      "text-a",
      `o-${DISTINCT - 1}`,
    ]);
    expect(button({tone: "a"})).toHaveClass(["base", "text-a"]);

    // The size half of the claim: a pair holds whatever the caller passes, so two 64 KB overrides
    // differing by one character in the MIDDLE are two entries. Only a key embedding the whole
    // override separates them — a prefix, a suffix or a digest collides, and the second call is
    // served the first's classes.
    const bulk = "x".repeat(64 * 1024);
    // Read back as the one differing character rather than compared as the class string, so a
    // collision reports a marker instead of 128 KB of `x`.
    const markerPosition = `base text-a ${bulk}`.length;
    const answeredMarker = (marker: string): string =>
      button({tone: "a", class: `${bulk}${marker}${bulk}`}).slice(
        markerPosition,
        markerPosition + 1,
      );

    expect(answeredMarker("a")).toBe("a");
    expect(answeredMarker("b")).toBe("b");
    // `a` again, now that `b` is written: a key that cannot separate them answers with whichever
    // was written last from here on.
    expect(answeredMarker("a")).toBe("a");
  });
});
