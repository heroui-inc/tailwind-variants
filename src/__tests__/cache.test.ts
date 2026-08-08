import {describe, expect, test} from "vitest";

import {
  buildPropsFingerprint,
  CACHE_MISS,
  createBoundedCache,
  createLazyOverrideMerge,
  createResultCache,
} from "../internal/cache.js";
import {createMerger} from "../internal/merge/index.js";
import type {CnAdapter} from "../internal/types.js";
import {cx} from "../utils.js";

const joinAdapter: CnAdapter = (_config, ...classnames) => cx(...(classnames as string[]));

describe("createBoundedCache", () => {
  test("misses unknown keys and distinguishes a stored empty string from a miss", () => {
    const cache = createResultCache();

    cache.set("empty", "");

    expect(cache.get("empty")).toBe("");
    expect(cache.get("unknown")).toBe(CACHE_MISS);
  });

  test("keeps entries from the previous generation readable after rotation", () => {
    const cache = createBoundedCache<number>(4);

    for (let i = 1; i <= 4; i++) cache.set(`k${i}`, i);
    cache.set("k5", 5);

    for (let i = 1; i <= 5; i++) {
      expect(cache.get(`k${i}`)).toBe(i);
    }
  });

  test("promotes previous-generation hits so they survive the next rotation", () => {
    const cache = createBoundedCache<string>(4);

    for (const key of ["a", "b", "c", "d"]) cache.set(key, key);
    cache.set("e", "e");

    expect(cache.get("a")).toBe("a");

    cache.set("f", "f");
    cache.set("g", "g");
    cache.set("h", "h");

    expect(cache.get("a")).toBe("a");
    expect(cache.get("b")).toBe(CACHE_MISS);
    for (const key of ["e", "f", "g", "h"]) {
      expect(cache.get(key)).toBe(key);
    }
  });

  test("serves correct values across many inserts at the default limit", () => {
    const cache = createBoundedCache<number>();

    for (let i = 0; i < 600; i++) cache.set(`key${i}`, i);

    expect(cache.get("key0")).toBe(CACHE_MISS);
    expect(cache.get("key300")).toBe(300);
    expect(cache.get("key599")).toBe(599);
  });
});

describe("createLazyOverrideMerge", () => {
  test("returns the core untouched without class overrides", () => {
    const merge = createLazyOverrideMerge(joinAdapter, {});

    expect(merge("px-2")).toBe("px-2");
    expect(merge("px-2", {})).toBe("px-2");
    expect(merge("px-2", {size: "sm"})).toBe("px-2");
    expect(merge("")).toBe("");
  });

  test("returns the core untouched for empty-string class and className", () => {
    const merge = createLazyOverrideMerge(joinAdapter, {});

    expect(merge("px-2", {class: ""})).toBe("px-2");
    expect(merge("px-2", {className: ""})).toBe("px-2");
  });

  test("merges string class and className overrides onto the core", () => {
    const merge = createLazyOverrideMerge(joinAdapter, {});

    expect(merge("px-2", {class: "extra"})).toBe("px-2 extra");
    expect(merge("px-2", {className: "other"})).toBe("px-2 other");
    expect(merge("px-2", {class: "a", className: "b"})).toBe("px-2 a b");
    expect(merge("", {class: "only"})).toBe("only");
  });

  test("merges non-string overrides without corrupting later cached lookups", () => {
    const merge = createLazyOverrideMerge(joinAdapter, {});

    expect(merge("px-2", {class: ["py-1", ["font-bold"]]})).toBe("px-2 py-1 font-bold");
    expect(merge("px-2", {class: {hidden: true, block: false}})).toBe("px-2 hidden");
    expect(merge("px-2", {class: "plain"})).toBe("px-2 plain");
    expect(merge("px-2", {class: "plain"})).toBe("px-2 plain");
  });

  test("stays correct past the override cache limit", () => {
    const merge = createLazyOverrideMerge(joinAdapter, {});

    for (let core = 0; core < 20; core++) {
      for (let override = 0; override < 10; override++) {
        expect(merge(`core-${core}`, {class: `ov-${override}`})).toBe(
          `core-${core} ov-${override}`,
        );
      }
    }

    expect(merge("core-0", {class: "ov-0"})).toBe("core-0 ov-0");
    expect(merge("core-19", {class: "ov-9"})).toBe("core-19 ov-9");
  });
});

describe("buildPropsFingerprint", () => {
  const variantKeys = ["size", "color"];

  test("is insensitive to prop insertion order", () => {
    const forward = buildPropsFingerprint(variantKeys, {}, {size: "sm", color: "red"});
    const reversed = buildPropsFingerprint(variantKeys, {}, {color: "red", size: "sm"});

    expect(forward).not.toBeNull();
    expect(forward).toBe(reversed);
  });

  test("sorts extra keys outside the declared variant axes", () => {
    const forward = buildPropsFingerprint(variantKeys, {}, {size: "sm", alpha: 1, beta: 2});
    const reversed = buildPropsFingerprint(variantKeys, {}, {beta: 2, alpha: 1, size: "sm"});

    expect(forward).not.toBeNull();
    expect(forward).toBe(reversed);
  });

  test("distinguishes different values and ignores explicit undefined", () => {
    const sm = buildPropsFingerprint(variantKeys, {}, {size: "sm"});
    const lg = buildPropsFingerprint(variantKeys, {}, {size: "lg"});
    const withUndefined = buildPropsFingerprint(variantKeys, {}, {size: "sm", color: undefined});

    expect(sm).not.toBe(lg);
    expect(withUndefined).toBe(sm);
  });

  test("bails out for function-valued props", () => {
    expect(buildPropsFingerprint(variantKeys, {}, {size: "sm", onClick: () => {}})).toBeNull();
  });

  test("bails out for symbol-valued props", () => {
    expect(buildPropsFingerprint(variantKeys, {}, {size: "sm", marker: Symbol("x")})).toBeNull();
  });

  test("bails out for circular objects and serializes plain objects", () => {
    const circular: Record<string, unknown> = {};

    circular.self = circular;

    expect(buildPropsFingerprint(variantKeys, {}, {size: "sm", data: circular})).toBeNull();
    expect(buildPropsFingerprint(variantKeys, {}, {size: "sm", data: {a: 1}})).not.toBeNull();
  });

  test("lets slotProps win over props and defaults", () => {
    const viaSlotProps = buildPropsFingerprint(
      variantKeys,
      {size: "sm"},
      {size: "md"},
      {size: "lg"},
    );
    const direct = buildPropsFingerprint(variantKeys, {}, {size: "lg"});

    expect(viaSlotProps).toBe(direct);
  });

  test("normalizes boolean and string variant values the same way", () => {
    const asBoolean = buildPropsFingerprint(["disabled"], {}, {disabled: false});
    const asString = buildPropsFingerprint(["disabled"], {}, {disabled: "false"});

    expect(asBoolean).toBe(asString);
  });
});

describe("merge engine cache limits", () => {
  test("whole-string cache stays correct past its limit", () => {
    const merger = createMerger();

    for (let i = 0; i < 600; i++) {
      expect(merger.mergeString(`px-${i} px-${i + 1}`)).toBe(`px-${i + 1}`);
    }

    expect(merger.mergeString("px-0 px-1")).toBe("px-1");
  });

  test("descriptor cache and conflict-key registry stay correct across resets", () => {
    const merger = createMerger();

    for (let i = 0; i < 8000; i++) {
      expect(merger.mergeString(`[&_.a${i}]:px-2 [&_.a${i}]:px-4`)).toBe(`[&_.a${i}]:px-4`);
    }

    expect(merger.mergeString("[&_.a0]:px-2 [&_.a0]:px-4")).toBe("[&_.a0]:px-4");
    expect(merger.mergeString("px-2 px-4")).toBe("px-4");
  });
});
