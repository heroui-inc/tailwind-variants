import {describe, expect, test} from "vitest";

import {tv} from "../index";
import {defineSlots, defineVariants} from "./support/loose.js";

// Change detection walks consumer-supplied metadata, which can be cyclic, enormous, or a reactive
// proxy that counts every read. These pin the bounds that keep that walk finite AND complete.
//
// They are worth more than they look: a walk that is merely SLOW reads as a hang to a user, and a
// walk that truncates goes on producing plausible output while silently watching nothing. Neither
// failure shows up in a class-string assertion, so each case measures work or reads directly.

/** Counts what a reactive consumer would see: property reads and key enumerations. */
const countingMetadata = (
  selfReferences: number,
): {value: object; reads: () => number; enumerations: () => number} => {
  let reads = 0;
  let enumerations = 0;
  const target: Record<string, unknown> = {leaf: "cv"};
  const proxy: object = new Proxy(target, {
    get(object, key, receiver) {
      reads++;

      return Reflect.get(object, key, receiver);
    },
    ownKeys(object) {
      enumerations++;

      return Reflect.ownKeys(object);
    },
  });

  for (let index = 0; index < selfReferences; index++) target[`self${index}`] = proxy;

  return {value: proxy, reads: () => reads, enumerations: () => enumerations};
};

describe("termination", () => {
  test("a cyclic metadata graph costs a bounded number of consumer reads", () => {
    // Each object is walked once per walk. Without that, a cycle through TWO keys is re-entered
    // exponentially in depth and every re-entry re-reads and re-enumerates the object: measured
    // at 26,267 reads and 13,258 enumerations per call, never converging.
    const metadata = countingMetadata(2);
    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [{tone: "a", class: metadata.value}],
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 3; call++) button({tone: "a"});

    const readsBefore = metadata.reads();
    const enumerationsBefore = metadata.enumerations();

    button({tone: "a"});

    expect(metadata.reads() - readsBefore).toBeLessThanOrEqual(64);
    expect(metadata.enumerations() - enumerationsBefore).toBeLessThanOrEqual(32);
  });

  test("the per-call cost of a cycle does not grow with its branching", () => {
    // Ten self-references cost ten reads, not ten factorial. Branching is what turns a missing
    // visited set from slow into unusable.
    const wide = countingMetadata(10);
    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [{tone: "a", class: wide.value}],
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 3; call++) button({tone: "a"});

    const before = wide.reads();

    button({tone: "a"});

    expect(wide.reads() - before).toBeLessThanOrEqual(64);
  });

  test("one object shared by many compounds is enumerated once, not once per compound", () => {
    const shared = countingMetadata(0);
    const compounds = Array.from({length: 50}, () => ({tone: "a", class: shared.value}));
    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: compounds,
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 3; call++) button({tone: "a"});

    const before = shared.enumerations();

    button({tone: "a"});

    expect(shared.enumerations() - before).toBeLessThanOrEqual(2);
  });

  test("a large definition is still watched to its end", () => {
    // A work ceiling buys termination by ceasing to look, which is a silent wrong answer rather
    // than a slow one. This pins that a realistic-but-large definition stays fully watched: the
    // LAST compound must still invalidate.
    const ballast = Array.from({length: 4000}, (_unused, index) => ({
      tone: "a",
      class: `ballast-${index}`,
    }));
    const last = {tone: "a", class: "last-original"};
    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [...ballast, last],
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 3; call++) button({tone: "a"});

    expect(button({tone: "a"})).toContain("last-original");

    last.class = "last-mutated";

    expect(button({tone: "a"})).toContain("last-mutated");
  });

  test("a class value deeper than the walk descends is still honoured when it changes", () => {
    // The end-to-end half of the bound. Resolution recurses nested class values with no limit at
    // all — they are in the public contract — so a value past the walk's depth still RENDERS. If
    // detection also reported "unchanged" for it, the cache would serve the pre-mutation string
    // for the life of the component and nothing would look wrong.
    //
    // Reporting a change instead costs this definition its cache entirely. That is the intended
    // trade: it is the only answer that is not a silent wrong one.
    const deepest: unknown[] = ["cv-old"];
    let nested: unknown[] = deepest;

    for (let level = 0; level < 300; level++) nested = [nested];

    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [{tone: "a", class: nested}],
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 3; call++) button({tone: "a"});

    expect(button({tone: "a"})).toHaveClass(["base", "text-a", "cv-old"]);

    deepest[0] = "cv-new";

    expect(button({tone: "a"})).toHaveClass(["base", "text-a", "cv-new"]);
  });

  test("an untouched large definition still serves its cache", () => {
    // The converse of the case above, so the fix cannot be "always report changed": detection
    // that never settles disables the cache while producing correct output.
    let resolutions = 0;
    const values: Record<string, unknown> = {};

    Object.defineProperty(values, "a", {
      enumerable: true,
      get() {
        resolutions++;

        return "text-a";
      },
    });

    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: values},
      compoundVariants: Array.from({length: 2000}, (_unused, index) => ({
        tone: "a",
        class: `ballast-${index}`,
      })),
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 4; call++) button({tone: "a"});

    const warmed = resolutions;

    for (let call = 0; call < 8; call++) button({tone: "a"});

    expect(resolutions).toBe(warmed);
  });

  test("a cyclic compound SLOT is bounded on the slots path too", () => {
    // The two resolvers keep separate detection state, so a variants case is not coverage here.
    const metadata = countingMetadata(3);
    const menu = defineSlots(tv, {
      slots: {root: "root", title: "title"},
      variants: {tone: {a: {}}},
      compoundSlots: [{slots: ["root"], tone: "a", class: metadata.value}],
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 3; call++) menu({tone: "a"}).root();

    const before = metadata.reads();

    menu({tone: "a"}).root();

    expect(metadata.reads() - before).toBeLessThanOrEqual(64);
  });

  test("a cycle reached through an extend parent is bounded", () => {
    // `extend` merges the parent's compounds into the child, so the child's walk covers metadata
    // it did not declare — including the parent's cycles.
    const metadata = countingMetadata(2);
    const parent = defineVariants(tv, {
      base: "parent-base",
      variants: {tone: {a: "parent-a"}},
      compoundVariants: [{tone: "a", class: metadata.value}],
      defaultVariants: {tone: "a"},
    });
    const child = defineVariants(tv, {
      extend: parent,
      base: "child-base",
      variants: {size: {sm: "child-sm"}},
      defaultVariants: {size: "sm"},
    });

    for (let call = 0; call < 3; call++) child({});

    const before = metadata.reads();

    child({});

    expect(metadata.reads() - before).toBeLessThanOrEqual(64);
  });

  test("an unbounded stream of distinct keys does not grow without bound", () => {
    // Both cache generations plus the promotion path. A key stream nothing ever repeats is the
    // shape that finds a missing rotation or an unguarded promotion.
    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [{tone: "a", class: "cv"}],
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 20000; call++) {
      button({tone: "a", nonce: `n-${call}`, class: `override-${call}`});
    }

    // Correctness must survive the churn: the cache is a memo, not a source of truth.
    expect(button({tone: "a"})).toHaveClass(["base", "text-a", "cv"]);
  });

  test("a self-resolving metadata getter settles instead of wedging", () => {
    // Bounded self-resolution is a legal consumer shape — a reactive store reading another
    // component while this one resolves. It must terminate, stay correct, and settle.
    let depth = 0;
    let component: ((props?: Record<string, unknown>) => string) | undefined;
    const source: Record<string, unknown> = {tone: "a", class: "cv"};

    Object.defineProperty(source, "className", {
      enumerable: true,
      get() {
        if (depth < 3 && component !== undefined) {
          depth++;

          try {
            component({tone: "a"});
          } finally {
            depth--;
          }
        }

        return undefined;
      },
    });

    component = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [source],
      defaultVariants: {tone: "a"},
    });

    const outputs = Array.from({length: 5}, () => component({tone: "a"}));

    expect(new Set(outputs).size).toBe(1);
    expect(outputs[0]).toHaveClass(["base", "text-a", "cv"]);
  });

  test("metadata deeper than the walk descends does not reach the stack", () => {
    const deep: Record<string, unknown> = {leaf: "cv"};
    let node = deep;

    for (let level = 0; level < 50000; level++) {
      const next: Record<string, unknown> = {};

      node.nested = next;
      node = next;
    }

    const button = defineVariants(tv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [{tone: "a", class: deep}],
      defaultVariants: {tone: "a"},
    });

    expect(() => {
      for (let call = 0; call < 3; call++) button({tone: "a"});
    }).not.toThrow();
  });
});
