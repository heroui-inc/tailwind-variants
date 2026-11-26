import type {AnyRecord, MergeAdapter} from "../internal/types.js";

import {describe, expect, test} from "vitest";

import {cnMerge, createTV, tv} from "../index";
import {
  CACHE_MISS,
  COMPOUNDS_CHANGED,
  COMPOUNDS_UNCHANGED,
  COMPOUNDS_UNSAFE,
  createBoundedCache,
  createCompoundsGuard,
  createLazyOverrideMerge,
  createPropsCache,
  UNCACHEABLE,
} from "../internal/cache.js";
import {tv as liteTV} from "../lite";
import {cx} from "../utils.js";

type GuardInput = Parameters<ReturnType<typeof createCompoundsGuard>>[0];

// First guard call on fresh metadata: CHANGED when it can be snapshotted, UNSAFE otherwise.
const guardOnce = (compoundVariants: GuardInput): number =>
  createCompoundsGuard()(compoundVariants, []);

const joinAdapter: MergeAdapter = {
  parts: (list, count) => cx(...list.slice(0, count)),
  override: (core, classValue, classNameValue) =>
    cx(core, classValue as any, classNameValue as any),
};

describe("createBoundedCache", () => {
  test("misses unknown keys and distinguishes a stored empty string from a miss", () => {
    const cache = createBoundedCache<string>();

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
    const merge = createLazyOverrideMerge(joinAdapter);

    expect(merge("px-2")).toBe("px-2");
    expect(merge("px-2", {})).toBe("px-2");
    expect(merge("px-2", {size: "sm"})).toBe("px-2");
    expect(merge("")).toBe("");
  });

  test("returns the core untouched for empty-string class and className", () => {
    const merge = createLazyOverrideMerge(joinAdapter);

    expect(merge("px-2", {class: ""})).toBe("px-2");
    expect(merge("px-2", {className: ""})).toBe("px-2");
  });

  test("merges string class and className overrides onto the core", () => {
    const merge = createLazyOverrideMerge(joinAdapter);

    expect(merge("px-2", {class: "extra"})).toBe("px-2 extra");
    expect(merge("px-2", {className: "other"})).toBe("px-2 other");
    expect(merge("px-2", {class: "a", className: "b"})).toBe("px-2 a b");
    expect(merge("", {class: "only"})).toBe("only");
  });

  test("merges non-string overrides without corrupting later cached lookups", () => {
    const merge = createLazyOverrideMerge(joinAdapter);

    expect(merge("px-2", {class: ["py-1", ["font-bold"]]})).toBe("px-2 py-1 font-bold");
    expect(merge("px-2", {class: {hidden: true, block: false}})).toBe("px-2 hidden");
    expect(merge("px-2", {class: "plain"})).toBe("px-2 plain");
    expect(merge("px-2", {class: "plain"})).toBe("px-2 plain");
  });

  test("stays correct across many distinct core and override pairs", () => {
    const merge = createLazyOverrideMerge(joinAdapter);

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

// Stores a value for `fill` in a fresh props cache and reports what `probe`
// reads back: "hit" (same entry), "miss" (another entry) or "uncacheable".
const readBack = (
  keys: string[],
  fill: AnyRecord,
  probe: AnyRecord,
  defaultVariants: AnyRecord = {},
) => {
  const cache = createPropsCache<string>(keys);

  cache.set(defaultVariants, fill, "stored");

  const value = cache.get(defaultVariants, probe);

  if (value === "stored") return "hit";
  if (value === CACHE_MISS) return "miss";
  if (value === UNCACHEABLE) return "uncacheable";

  return value;
};

describe("createPropsCache", () => {
  const variantKeys = ["size", "color"];

  test("is insensitive to prop insertion order", () => {
    expect(readBack(variantKeys, {size: "sm", color: "red"}, {color: "red", size: "sm"})).toBe(
      "hit",
    );
  });

  test("ignores every prop outside its keys", () => {
    const circular: Record<string, unknown> = {};

    circular.self = circular;

    expect(
      readBack(variantKeys, {size: "sm", alpha: 1}, {size: "sm", beta: 2, id: "x", data: circular}),
    ).toBe("hit");
  });

  test("distinguishes different values and ignores explicit undefined", () => {
    expect(readBack(variantKeys, {size: "sm"}, {size: "lg"})).toBe("miss");
    expect(readBack(variantKeys, {size: "sm"}, {size: "sm", color: undefined})).toBe("hit");
  });

  test("bails out for function values on its keys only", () => {
    expect(readBack(variantKeys, {size: "sm"}, {size: "sm", color: () => {}})).toBe("uncacheable");
    expect(readBack(variantKeys, {size: "sm"}, {size: "sm", onClick: () => {}})).toBe("hit");
  });

  test("bails out for symbol values on its keys only", () => {
    expect(readBack(variantKeys, {size: "sm"}, {size: "sm", color: Symbol("x")})).toBe(
      "uncacheable",
    );
    expect(readBack(variantKeys, {size: "sm"}, {size: "sm", marker: Symbol("x")})).toBe("hit");
  });

  test("never caches object or BigInt values on its keys", () => {
    const circular: Record<string, unknown> = {};

    circular.self = circular;

    expect(readBack(variantKeys, {size: "sm"}, {size: circular})).toBe("uncacheable");
    expect(readBack(variantKeys, {size: "sm"}, {size: {a: 1}})).toBe("uncacheable");
    expect(readBack(variantKeys, {size: "sm"}, {size: ["sm"]})).toBe("uncacheable");
    expect(readBack(variantKeys, {size: "0"}, {size: 0n})).toBe("uncacheable");
  });

  test("normalizes boolean, number and string variant values the same way", () => {
    expect(readBack(["disabled"], {disabled: false}, {disabled: "false"})).toBe("hit");
    expect(readBack(["disabled"], {disabled: false}, {disabled: NaN})).toBe("hit");
    expect(readBack(["level"], {level: 1}, {level: "1"})).toBe("hit");
    expect(readBack(["level"], {level: Infinity}, {level: "Infinity"})).toBe("hit");
  });

  test("keeps null apart from 'null', 'NaN' apart from NaN, '' apart from unset", () => {
    expect(readBack(["tone"], {tone: "null"}, {tone: null})).toBe("miss");
    expect(readBack(["tone"], {tone: "NaN"}, {tone: NaN})).toBe("miss");
    expect(readBack(["tone"], {tone: "undefined"}, {tone: undefined})).toBe("miss");
    expect(readBack(["tone"], {tone: ""}, {})).toBe("miss");
  });

  test("keeps a value taken from defaults apart from the same value passed explicitly", () => {
    expect(readBack(["tone"], {}, {tone: "a"}, {tone: "a"})).toBe("miss");
    expect(readBack(["tone"], {}, {tone: null}, {tone: null})).toBe("miss");
    expect(readBack(["tone"], {}, {}, {tone: "a"})).toBe("hit");
  });
});

describe("non-finite number serialization", () => {
  test("compounds guard bails out for non-finite condition values", () => {
    const nan = [{conditionKeys: ["size"], source: {size: {level: NaN}}}];
    const finite = [{conditionKeys: ["size"], source: {size: {level: 2}}}];

    expect(guardOnce(nan)).toBe(COMPOUNDS_UNSAFE);
    expect(guardOnce(finite)).toBe(COMPOUNDS_CHANGED);
  });

  test("compounds guard bails out for non-finite class values", () => {
    const nanClass = [{conditionKeys: [], source: {class: {width: NaN}}}];
    const nullClass = [{conditionKeys: [], source: {class: {width: null}}}];

    expect(guardOnce(nanClass)).toBe(COMPOUNDS_UNSAFE);
    expect(guardOnce(nullClass)).toBe(COMPOUNDS_CHANGED);
  });

  test("compounds guard bails out for circular objects", () => {
    const circular: Record<string, unknown> = {};

    circular.self = circular;

    const source = [{conditionKeys: [], source: {class: circular}}];

    expect(guardOnce(source)).toBe(COMPOUNDS_UNSAFE);
  });
});

describe("compounds guard fast paths", () => {
  test("serializes primitive-array conditions deterministically", () => {
    const compounds = [{conditionKeys: ["s"], source: {s: ["a", "b"], class: "x"}}];
    const guard = createCompoundsGuard();

    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    expect(guard(compounds, [])).toBe(COMPOUNDS_UNCHANGED);
  });

  test("tolerates empty and falsy-filled arrays", () => {
    const empty = [{conditionKeys: ["s"], source: {s: [], class: "x"}}];
    const falsy = [{conditionKeys: ["s"], source: {s: ["a", null, undefined, false], class: "x"}}];

    expect(guardOnce(empty)).toBe(COMPOUNDS_CHANGED);
    expect(guardOnce(falsy)).toBe(COMPOUNDS_CHANGED);
  });

  test("keeps the full shape of arrays containing objects", () => {
    const withObjectA = [{conditionKeys: ["s"], source: {s: ["a", {x: 1}], class: "x"}}];
    const withObjectB = [{conditionKeys: ["s"], source: {s: ["a", {y: 2}], class: "x"}}];

    const guard = createCompoundsGuard();

    expect(guard(withObjectA, [])).toBe(COMPOUNDS_CHANGED);
    expect(guard(withObjectA, [])).toBe(COMPOUNDS_UNCHANGED);
    expect(guard(withObjectB, [])).toBe(COMPOUNDS_CHANGED);
  });

  test("bails out for non-finite numbers inside arrays", () => {
    const nan = [{conditionKeys: ["s"], source: {s: [NaN, "a"], class: "x"}}];
    const infinity = [{conditionKeys: ["s"], source: {s: [Infinity, "a"], class: "x"}}];

    expect(guardOnce(nan)).toBe(COMPOUNDS_UNSAFE);
    expect(guardOnce(infinity)).toBe(COMPOUNDS_UNSAFE);
  });

  test("serializes flat objects of primitives without collapsing them", () => {
    const classValue = [{conditionKeys: [], source: {class: {base: "r", label: "m"}}}];
    const otherClassValue = [{conditionKeys: [], source: {class: {base: "r", label: "n"}}}];

    const guard = createCompoundsGuard();

    expect(guard(classValue, [])).toBe(COMPOUNDS_CHANGED);
    expect(guard(classValue, [])).toBe(COMPOUNDS_UNCHANGED);
    expect(guard(otherClassValue, [])).toBe(COMPOUNDS_CHANGED);
  });

  test("bails out for non-finite numbers inside objects", () => {
    const nan = [{conditionKeys: [], source: {class: {base: "r", n: NaN}}}];
    const infinity = [{conditionKeys: [], source: {class: {base: Infinity}}}];
    const nested = [{conditionKeys: [], source: {class: {base: {inner: NaN}}}}];

    expect(guardOnce(nan)).toBe(COMPOUNDS_UNSAFE);
    expect(guardOnce(infinity)).toBe(COMPOUNDS_UNSAFE);
    expect(guardOnce(nested)).toBe(COMPOUNDS_UNSAFE);
  });

  test("bails out for BigInt and circular values without throwing", () => {
    const bigint = [{conditionKeys: [], source: {class: {base: 123n}}}];
    const circular: Record<string, unknown> = {};

    circular.self = circular;

    const circularSource = [{conditionKeys: [], source: {class: circular}}];

    expect(() => guardOnce(bigint)).not.toThrow();
    expect(guardOnce(bigint)).toBe(COMPOUNDS_UNSAFE);
    expect(() => guardOnce(circularSource)).not.toThrow();
    expect(guardOnce(circularSource)).toBe(COMPOUNDS_UNSAFE);
  });
});

describe("tv props cache (key ordering)", () => {
  test("returns identical results regardless of prop key order", () => {
    const button = tv({
      base: "font-medium",
      variants: {
        size: {sm: "text-sm", lg: "text-lg"},
        color: {red: "text-red-500", blue: "text-blue-500"},
      },
    });

    button();

    const forward = button({size: "sm", color: "red"});
    const reversed = button({color: "red", size: "sm"});

    expect(forward).toBe(reversed);
    expect(forward).toHaveClass(["font-medium", "text-sm", "text-red-500"]);
    expect(button({size: "lg", color: "blue"})).toHaveClass([
      "font-medium",
      "text-lg",
      "text-blue-500",
    ]);
  });

  test("orders compound conditions on undeclared axes consistently", () => {
    const badge = tv({
      base: "badge",
      variants: {
        color: {red: "badge-red", blue: "badge-blue"},
      },
      compoundVariants: [{color: "red", isFancy: true, class: "badge-fancy"} as any],
    });

    badge();

    const forward = badge({color: "red", isFancy: true} as any);
    const reversed = badge({isFancy: true, color: "red"} as any);

    expect(forward).toBe(reversed);
    expect(forward).toHaveClass(["badge", "badge-red", "badge-fancy"]);
    expect(badge({color: "red", isFancy: false} as any)).toHaveClass(["badge", "badge-red"]);
    expect(badge({color: "blue", isFancy: true} as any)).toHaveClass(["badge", "badge-blue"]);
  });

  test("keeps slot results order-insensitive", () => {
    const card = tv({
      slots: {root: "root", label: "label"},
      variants: {
        size: {sm: {root: "root-sm"}, lg: {root: "root-lg"}},
        tone: {light: {label: "label-light"}, dark: {label: "label-dark"}},
      },
    });

    card();

    const forward = card({size: "sm", tone: "dark"});
    const reversed = card({tone: "dark", size: "sm"});

    expect(forward).toBe(reversed);
    expect(forward.root()).toHaveClass(["root", "root-sm"]);
    expect(forward.label()).toHaveClass(["label", "label-dark"]);
  });
});

describe("tv props cache (fingerprint bail-out)", () => {
  test("function-valued props return correct classes and stay stable", () => {
    const button = tv({
      base: "font-medium",
      variants: {
        color: {red: "text-red-500", blue: "text-blue-500"},
      },
    });
    const onClick = () => {};

    for (let i = 0; i < 3; i++) {
      expect(button({color: "red", onClick} as any)).toHaveClass(["font-medium", "text-red-500"]);
    }

    expect(button({color: "blue", onClick} as any)).toHaveClass(["font-medium", "text-blue-500"]);
    expect(button({color: "red"})).toHaveClass(["font-medium", "text-red-500"]);
    expect(button({color: "red", onClick} as any)).toHaveClass(["font-medium", "text-red-500"]);
  });

  test("function-valued props do not poison the cache for later calls", () => {
    const button = tv({
      base: "base",
      variants: {
        size: {sm: "size-sm", lg: "size-lg"},
      },
    });

    button({size: "sm", onClick: () => {}} as any);

    expect(button({size: "sm"})).toHaveClass(["base", "size-sm"]);
    expect(button({size: "lg"})).toHaveClass(["base", "size-lg"]);
    expect(button({size: "sm"})).toHaveClass(["base", "size-sm"]);
  });

  test("held slot results with function props survive later calls", () => {
    const chip = tv({
      slots: {root: "root"},
      variants: {
        size: {sm: {root: "root-sm"}, lg: {root: "root-lg"}},
      },
      defaultVariants: {size: "sm"},
    });

    const held = chip({size: "sm", onRender: () => {}} as any);

    chip({size: "lg"});

    expect(held.root()).toHaveClass(["root", "root-sm"]);
    expect(held.root()).not.toHaveClass(["root-lg"]);
  });

  test("symbol-valued props bypass the cache without breaking results", () => {
    const button = tv({
      base: "base",
      variants: {
        size: {sm: "size-sm"},
      },
    });
    const marker = Symbol("marker");

    expect(button({size: "sm", marker} as any)).toHaveClass(["base", "size-sm"]);
    expect(button({size: "sm"})).toHaveClass(["base", "size-sm"]);
  });
});

describe("tv props cache (rotation sweeps)", () => {
  test("variants mode stays correct past the result cache limit", () => {
    const options: Record<string, string> = {};

    for (let i = 0; i < 300; i++) options[`o${i}`] = `w-${i}`;

    const box = tv({variants: {size: options}});

    box({size: "o0"});

    for (let i = 0; i < 300; i++) {
      expect(box({size: `o${i}`})).toBe(`w-${i}`);
    }

    for (const i of [0, 1, 100, 255, 299]) {
      expect(box({size: `o${i}`})).toBe(`w-${i}`);
    }
  });

  test("slots mode stays correct past the parent cache limit", () => {
    const options: Record<string, {root: string}> = {};

    for (let i = 0; i < 300; i++) options[`o${i}`] = {root: `w-${i}`};

    const box = tv({slots: {root: "root"}, variants: {size: options}});

    box({size: "o0"});

    for (let i = 0; i < 300; i++) {
      expect(box({size: `o${i}`}).root()).toHaveClass(["root", `w-${i}`]);
    }

    for (const i of [0, 1, 100, 255, 299]) {
      expect(box({size: `o${i}`}).root()).toHaveClass(["root", `w-${i}`]);
    }
  });

  test("cn argument cache stays correct past bucket and total limits", () => {
    for (let i = 0; i < 70; i++) {
      expect(cnMerge("px-2", `m-${i}`)()).toBe(`px-2 m-${i}`);
    }

    expect(cnMerge("px-2", "m-0")()).toBe("px-2 m-0");
    expect(cnMerge("px-2", "px-4")()).toBe("px-4");
    expect(cnMerge("px-2", "px-4")()).toBe("px-4");

    for (let i = 0; i < 600; i++) {
      expect(cnMerge(`base-${i}`, `extra-${i}`)()).toBe(`base-${i} extra-${i}`);
    }

    expect(cnMerge("base-0", "extra-0")()).toBe("base-0 extra-0");
  });
});

/*
 * Characterization of post-creation metadata mutation. compoundVariants /
 * compoundSlots invalidation is covered in tv-default and
 * tv-slots-independence; these tests freeze the boundary for the remaining
 * metadata fields so refactors cannot silently change it.
 */
describe("tv metadata mutation (defaultVariants)", () => {
  test("in-place edits take effect in variants mode", () => {
    const button = tv({
      variants: {
        size: {sm: "text-sm", lg: "text-lg"},
      },
      defaultVariants: {size: "sm"},
    });

    button();

    expect(button()).toBe("text-sm");

    button.defaultVariants.size = "lg";

    expect(button()).toBe("text-lg");
  });

  test("in-place edits take effect in slots mode", () => {
    const card = tv({
      slots: {root: "root"},
      variants: {
        size: {sm: {root: "root-sm"}, lg: {root: "root-lg"}},
      },
      defaultVariants: {size: "sm"},
    });

    card();

    expect(card().root()).toHaveClass(["root", "root-sm"]);

    card.defaultVariants.size = "lg";

    expect(card().root()).toHaveClass(["root", "root-lg"]);
  });
});

describe("tv metadata mutation (variants)", () => {
  test("in-place option edits reach only prop combinations not yet cached", () => {
    const button = tv({
      variants: {
        size: {sm: "text-sm", lg: "text-lg"},
      },
    });

    button();
    expect(button({size: "sm"})).toBe("text-sm");
    expect(button({size: "sm"})).toBe("text-sm");

    button.variants.size.sm = "text-sm-edited";
    button.variants.size.lg = "text-lg-edited";

    expect(button({size: "sm"})).toBe("text-sm");
    expect(button({size: "lg"})).toBe("text-lg-edited");
  });

  test("replacing a whole axis after the first call is not picked up", () => {
    const button = tv({
      variants: {
        size: {sm: "text-sm"},
      },
    });

    button();

    button.variants.size = {sm: "replaced"};

    expect(button({size: "sm"})).toBe("text-sm");
  });

  test("replacing a whole axis before the first call is picked up", () => {
    const button = tv({
      variants: {
        size: {sm: "text-sm"},
      },
    });

    button.variants.size = {sm: "replaced"};

    expect(button({size: "sm"})).toBe("replaced");
  });
});

describe("tv metadata mutation (slots)", () => {
  test("in-place slot class edits reach only calls not served from cache", () => {
    const card = tv({
      slots: {root: "root-a", label: "label-a"},
      variants: {
        size: {sm: {root: "r-sm"}, lg: {root: "r-lg"}},
      },
    });

    card({size: "sm"});
    expect(card({size: "sm"}).root()).toHaveClass(["root-a", "r-sm"]);

    card.slots.root = "root-b";

    expect(card({size: "sm"}).root()).toHaveClass(["root-a", "r-sm"]);
    expect(card({size: "lg"}).root()).toHaveClass(["root-b", "r-lg"]);
  });

  test("adding a slot after the first call is not picked up", () => {
    const panel = tv({slots: {root: "root"}});

    panel();

    (panel.slots as Record<string, string>).extra = "extra";

    expect("extra" in panel()).toBe(false);
  });

  test("adding a slot before the first call is picked up", () => {
    const panel = tv({slots: {root: "root"}});

    (panel.slots as Record<string, string>).extra = "extra";

    const slots = panel() as Record<string, () => string | undefined>;

    expect(slots.extra()).toBe("extra");
  });
});

// A counting merge function makes merges observable: the function adapter
// joins and calls it once per `parts` merge and once per override merge, and
// never caches, so a static hit shows up as "no new call".
const createCounting = () => {
  let calls = 0;
  const merge = (classList: string) => {
    calls++;

    return classList;
  };

  return {tv: createTV({twMerge: merge}), calls: () => calls};
};

describe("compounds guard (snapshot and fallbacks)", () => {
  const compound = (source: AnyRecord) =>
    [
      {
        conditionKeys: Object.keys(source).filter((k) => k !== "class" && k !== "className"),
        source,
      },
    ] as unknown as GuardInput;

  test("reports unchanged until a snapshotted value changes in place", () => {
    const source: AnyRecord = {color: ["red", "blue"], size: "sm", class: "font-bold"};
    const compounds = compound(source);
    const guard = createCompoundsGuard();

    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    expect(guard(compounds, [])).toBe(COMPOUNDS_UNCHANGED);

    (source.color as string[])[1] = "green";
    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    expect(guard(compounds, [])).toBe(COMPOUNDS_UNCHANGED);

    (source.color as string[]).push("blue");
    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);

    source.class = "font-normal";
    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    expect(guard(compounds, [])).toBe(COMPOUNDS_UNCHANGED);
  });

  test("compares functions by identity", () => {
    const first = () => "a";
    const second = () => "a";
    const source: AnyRecord = {color: first, class: "x"};
    const compounds = compound(source);
    const guard = createCompoundsGuard();

    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    expect(guard(compounds, [])).toBe(COMPOUNDS_UNCHANGED);

    source.color = second;
    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    expect(guard(compounds, [])).toBe(COMPOUNDS_UNCHANGED);
  });

  test("treats NaN as unsafe on every call until it is gone", () => {
    const source: AnyRecord = {size: ["sm", Number.NaN], class: "x"};
    const compounds = compound(source);
    const guard = createCompoundsGuard();

    expect(guard(compounds, [])).toBe(COMPOUNDS_UNSAFE);
    expect(guard(compounds, [])).toBe(COMPOUNDS_UNSAFE);

    (source.size as unknown[])[1] = "lg";
    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    expect(guard(compounds, [])).toBe(COMPOUNDS_UNCHANGED);

    source.class = {title: Number.POSITIVE_INFINITY};
    expect(guard(compounds, [])).toBe(COMPOUNDS_UNSAFE);
  });

  test("a value turning unsafe after a safe snapshot is reported unsafe", () => {
    const nested: AnyRecord = {title: ["a"]};
    const source: AnyRecord = {color: "red", class: nested};
    const compounds = compound(source);
    const guard = createCompoundsGuard();

    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    nested.self = nested;
    expect(guard(compounds, [])).toBe(COMPOUNDS_UNSAFE);
    delete nested.self;
    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    expect(guard(compounds, [])).toBe(COMPOUNDS_UNCHANGED);
  });

  test("detects nested object mutation", () => {
    const nested: AnyRecord = {title: ["a", "b"]};
    const source: AnyRecord = {color: "red", class: nested};
    const compounds = compound(source);
    const guard = createCompoundsGuard();

    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    expect(guard(compounds, [])).toBe(COMPOUNDS_UNCHANGED);

    (nested.title as string[])[1] = "c";
    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    expect(guard(compounds, [])).toBe(COMPOUNDS_UNCHANGED);
  });

  test("detects added, removed and reordered keys of flat class objects", () => {
    const classes: AnyRecord = {title: "a", root: "b"};
    const source: AnyRecord = {color: "red", class: classes};
    const compounds = compound(source);
    const guard = createCompoundsGuard();

    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    classes.extra = "c";
    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    delete classes.extra;
    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    delete classes.title;
    classes.title = "a";
    expect(guard(compounds, [])).toBe(COMPOUNDS_CHANGED);
    expect(guard(compounds, [])).toBe(COMPOUNDS_UNCHANGED);
  });

  test("tracks compound slot lists and compound counts", () => {
    const slotSource: AnyRecord = {slots: ["title"], color: "red", class: "x"};
    const slots = [{conditionKeys: ["color"], source: slotSource}] as unknown as Parameters<
      ReturnType<typeof createCompoundsGuard>
    >[1];
    const variants: AnyRecord[] = [];
    const guard = createCompoundsGuard();

    expect(guard(variants as unknown as GuardInput, slots)).toBe(COMPOUNDS_CHANGED);
    expect(guard(variants as unknown as GuardInput, slots)).toBe(COMPOUNDS_UNCHANGED);

    (slotSource.slots as string[]).push("root");
    expect(guard(variants as unknown as GuardInput, slots)).toBe(COMPOUNDS_CHANGED);

    variants.push({conditionKeys: [], source: {class: "y"}});
    expect(guard(variants as unknown as GuardInput, slots)).toBe(COMPOUNDS_CHANGED);
    expect(guard(variants as unknown as GuardInput, slots)).toBe(COMPOUNDS_UNCHANGED);
  });

  test("unsafe compound metadata is resolved uncached but correctly", () => {
    const {tv: countingTV, calls} = createCounting();
    const button = countingTV({
      variants: {
        size: {sm: "text-sm", lg: "text-lg"},
      },
      compoundVariants: [{size: ["sm", Number.NaN] as unknown as "sm", class: "font-bold"}],
    });

    expect(button({size: "sm"})).toBe("text-sm font-bold");
    const afterFirst = calls();

    expect(button({size: "sm"})).toBe("text-sm font-bold");
    expect(calls()).toBeGreaterThan(afterFirst);
    expect(button({size: "lg"})).toBe("text-lg");

    (button.compoundVariants[0].size as unknown as unknown[])[1] = "lg";

    expect(button({size: "lg"})).toBe("text-lg font-bold");
    const cached = calls();

    expect(button({size: "lg"})).toBe("text-lg font-bold");
    expect(calls()).toBe(cached);
  });

  test("nested compound class mutation reaches slot output", () => {
    const menu = tv({
      slots: {root: "root", title: "title"},
      variants: {color: {primary: {title: "title-p"}}},
      compoundVariants: [{color: "primary", class: {title: ["c-a", "c-b"]}}],
      defaultVariants: {color: "primary"},
    });

    expect(menu().title()).toHaveClass(["title", "title-p", "c-a", "c-b"]);
    expect(menu().title()).toHaveClass(["title", "title-p", "c-a", "c-b"]);

    ((menu.compoundVariants[0].class as Record<string, string[]>).title as string[])[1] = "c-z";

    expect(menu().title()).toHaveClass(["title", "title-p", "c-a", "c-z"]);
    expect(menu().title()).not.toHaveClass(["c-b"]);
  });
});

describe("definition-time static core", () => {
  test("default-only calls merge once and then return the same string", () => {
    const {tv: countingTV, calls} = createCounting();
    const button = countingTV({
      base: "inline-flex px-2",
      variants: {
        color: {primary: "bg-blue-500", secondary: "bg-white"},
        size: {sm: "text-sm", lg: "text-lg"},
      },
      defaultVariants: {color: "primary", size: "sm"},
    });

    const first = button();

    expect(first).toBe("inline-flex px-2 bg-blue-500 text-sm");
    expect(calls()).toBe(1);

    expect(button()).toBe(first);
    expect(button({})).toBe(first);
    expect(button(undefined)).toBe(first);
    expect(button({color: "primary", size: "sm"})).toBe(first);
    expect(button({color: undefined, size: "sm"})).toBe(first);
    expect(button({onClick: () => {}} as any)).toBe(first);
    expect(calls()).toBe(1);
  });

  test("a non-default variant is not served from the static core", () => {
    const {tv: countingTV, calls} = createCounting();
    const button = countingTV({
      base: "px-2",
      variants: {size: {sm: "text-sm", lg: "text-lg"}},
      defaultVariants: {size: "sm"},
    });

    expect(button()).toBe("px-2 text-sm");
    expect(button({size: "lg"})).toBe("px-2 text-lg");
    expect(button({size: null} as any)).toBe("px-2");
    expect(calls()).toBe(3);
    expect(button()).toBe("px-2 text-sm");
    expect(calls()).toBe(3);
  });

  test("a class override merges onto the static core without re-merging variants", () => {
    const {tv: countingTV, calls} = createCounting();
    const button = countingTV({
      base: "px-2",
      variants: {size: {sm: "text-sm", lg: "text-lg"}},
      defaultVariants: {size: "sm"},
    });

    expect(button()).toBe("px-2 text-sm");
    expect(calls()).toBe(1);
    expect(button({className: "mt-2"})).toBe("px-2 text-sm mt-2");
    // one call for the override merge, none for the variants
    expect(calls()).toBe(2);
    expect(button({class: "mt-4", size: "sm"})).toBe("px-2 text-sm mt-4");
    expect(calls()).toBe(3);
    expect(button({className: ""})).toBe("px-2 text-sm");
    expect(calls()).toBe(3);
  });

  test("a compound condition key in props bypasses the static core", () => {
    const {tv: countingTV, calls} = createCounting();
    const badge = countingTV({
      base: "badge",
      variants: {color: {red: "badge-red"}},
      compoundVariants: [{color: "red", isFancy: true, class: "badge-fancy"} as any],
      defaultVariants: {color: "red"},
    });

    expect(badge()).toBe("badge badge-red");
    expect(badge()).toBe("badge badge-red");
    expect(badge({isFancy: true} as any)).toBe("badge badge-red badge-fancy");
    expect(badge({isFancy: false} as any)).toBe("badge badge-red");
    expect(calls()).toBe(4);
    expect(badge()).toBe("badge badge-red");
    expect(calls()).toBe(4);
  });

  test("compounds that match the defaults are part of the static core", () => {
    const button = tv({
      base: "btn",
      variants: {
        intent: {primary: "intent-primary", secondary: "intent-secondary"},
        size: {sm: "size-sm", md: "size-md"},
      },
      compoundVariants: [{intent: "primary", size: "md", class: "uppercase"}],
      defaultVariants: {intent: "primary", size: "md"},
    });

    const expected = "btn intent-primary size-md uppercase";

    for (let i = 0; i < 4; i++) {
      expect(button()).toBe(expected);
      expect(button({intent: "primary"})).toBe(expected);
      expect(button({size: "sm"})).toBe("btn intent-primary size-sm");
    }
  });

  test("in-place default and option edits refresh the static core", () => {
    const button = tv({
      variants: {size: {sm: "text-sm", lg: "text-lg"}},
      defaultVariants: {size: "sm"},
    });

    expect(button()).toBe("text-sm");
    expect(button()).toBe("text-sm");

    button.defaultVariants.size = "lg";

    expect(button()).toBe("text-lg");

    button.variants.size.lg = "text-lg-edited";

    expect(button()).toBe("text-lg-edited");
    expect(button({})).toBe("text-lg-edited");
  });

  test("in-place edits of a non-variant condition default refresh the static core", () => {
    const button = tv({
      base: "b",
      variants: {size: {sm: "s"}},
      compoundVariants: [{tone: "x", class: "cx"} as any],
      defaultVariants: {tone: "y"} as any,
    });

    expect(button()).toBe("b");
    expect(button({id: "a"} as any)).toBe("b");

    (button.defaultVariants as AnyRecord).tone = "x";

    expect(button()).toBe("b cx");
    expect(button({id: "b"} as any)).toBe("b cx");
  });

  test("in-place compound edits refresh the static core", () => {
    const button = tv({
      variants: {color: {red: "text-red-500"}},
      compoundVariants: [{color: "red", class: "font-normal"}],
      defaultVariants: {color: "red"},
    });

    expect(button()).toBe("text-red-500 font-normal");
    expect(button()).toBe("text-red-500 font-normal");

    button.compoundVariants[0].class = "font-bold";

    expect(button()).toBe("text-red-500 font-bold");
    expect(button()).toBe("text-red-500 font-bold");
  });

  test("boolean and numeric defaults compare by option key", () => {
    const {tv: countingTV, calls} = createCounting();
    const box = countingTV({
      variants: {
        disabled: {true: "opacity-50", false: "opacity-100"},
        level: {"1": "z-10", "2": "z-20"},
      },
      defaultVariants: {disabled: false, level: "1"},
    });

    expect(box()).toBe("opacity-100 z-10");
    expect(box({disabled: false, level: "1"})).toBe("opacity-100 z-10");
    // numbers and "false" strings resolve to the same option keys
    expect(box({disabled: "false", level: 1} as any)).toBe("opacity-100 z-10");
    expect(calls()).toBe(1);
    expect(box({disabled: true})).toBe("opacity-50 z-10");
    expect(box({level: 2} as any)).toBe("opacity-100 z-20");
    expect(calls()).toBe(3);
  });
});

describe("static slot cores", () => {
  test("parent calls without variant overrides return the same result object", () => {
    const card = tv({
      slots: {root: "p-2 rounded", label: "text-sm"},
      variants: {size: {sm: {root: "p-3"}, lg: {root: "p-6", label: "text-lg"}}},
      defaultVariants: {size: "sm"},
    });

    const first = card();

    expect(first.root()).toBe("rounded p-3");
    expect(first.label()).toBe("text-sm");
    expect(card()).toBe(first);
    expect(card({})).toBe(first);
    expect(card({size: "sm"})).toBe(first);
    expect(card({className: "ignored"})).toBe(first);
    expect(card({size: "lg"})).not.toBe(first);
    expect(card({size: "lg"}).root()).toBe("rounded p-6");
  });

  test("slot props still override the static core per call", () => {
    const card = tv({
      slots: {root: "p-2", label: "text-sm"},
      variants: {size: {sm: {label: "text-xs"}, lg: {label: "text-lg"}}},
      defaultVariants: {size: "sm"},
    });

    const slots = card();

    expect(slots.label()).toBe("text-xs");
    expect(slots.label({size: "lg"})).toBe("text-lg");
    expect(slots.label({class: "font-bold"})).toBe("text-xs font-bold");
    expect(slots.label()).toBe("text-xs");
  });

  test("in-place slot and default edits refresh the static slot cores", () => {
    const card = tv({
      slots: {root: "root-a"},
      variants: {size: {sm: {root: "r-sm"}, lg: {root: "r-lg"}}},
      defaultVariants: {size: "sm"},
    });

    expect(card().root()).toBe("root-a r-sm");
    expect(card().root()).toBe("root-a r-sm");

    card.slots.root = "root-b";

    expect(card().root()).toBe("root-b r-sm");

    card.defaultVariants.size = "lg";

    expect(card().root()).toBe("root-b r-lg");
  });

  test("in-place edits of a non-variant condition default refresh the static slot cores", () => {
    const menu = tv({
      slots: {title: "title"},
      variants: {size: {sm: {title: "s"}}},
      compoundSlots: [{slots: ["title"], tone: "x", class: "cx"} as any],
      defaultVariants: {tone: "y"} as any,
    });

    expect(menu().title()).toBe("title");
    expect(menu().title()).toBe("title");

    (menu.defaultVariants as AnyRecord).tone = "x";

    expect(menu().title()).toBe("title cx");
    expect(menu({id: "a"} as any).title()).toBe("title cx");
  });

  test("compound slot edits refresh the static slot cores", () => {
    const menu = tv({
      slots: {title: "title-base"},
      variants: {color: {primary: {}, secondary: {}}},
      compoundSlots: [{slots: ["title"], color: "secondary", class: "truncate"}],
      defaultVariants: {color: "secondary"},
    });

    expect(menu().title()).toBe("title-base truncate");
    expect(menu().title()).toBe("title-base truncate");

    menu.compoundSlots[0].class = "line-clamp-2";

    expect(menu().title()).toBe("title-base line-clamp-2");
  });
});

const entryFactories: [string, (options: AnyRecord) => any][] = [
  ["tv", tv as any],
  ["lite tv", liteTV as any],
  ["createTV", createTV({}) as any],
];

describe.each(entryFactories)("cold and warm compound matching agree (%s)", (_, factory) => {
  test("a boolean prop meets a string compound condition", () => {
    const c = factory({
      base: "b",
      variants: {s: {false: "f", sm: "x"}},
      defaultVariants: {s: "false"},
      compoundVariants: [{s: "false", class: "cv"}],
    });

    expect(c({s: false})).toBe("b f cv");
    expect(c({s: false})).toBe("b f cv");
    expect(c()).toBe("b f cv");
  });

  test("a string prop meets a boolean compound condition", () => {
    const c = factory({
      base: "b",
      variants: {s: {true: "t", false: "f"}},
      defaultVariants: {s: false},
      compoundVariants: [{s: false, class: "cv"}],
    });

    expect(c({s: "false"})).toBe("b f cv");
    expect(c({s: "false"})).toBe("b f cv");
  });

  test("true, numeric and empty-string props meet their option-key conditions", () => {
    const yes = factory({
      variants: {s: {true: "t", false: "f"}},
      defaultVariants: {s: "true"},
      compoundVariants: [{s: "true", class: "cv"}],
    });
    const level = factory({
      variants: {level: {"1": "l1", "2": "l2"}},
      defaultVariants: {level: "1"},
      compoundVariants: [{level: "1", class: "cv"}],
    });
    const empty = factory({
      variants: {s: {true: "t", false: "f"}},
      compoundVariants: [{s: false, class: "cv"}],
    });

    expect(yes({s: true})).toBe("t cv");
    expect(yes({s: true})).toBe("t cv");
    expect(level({level: 1})).toBe("l1 cv");
    expect(level({level: 1})).toBe("l1 cv");
    expect(empty({s: ""})).toBe("f cv");
    expect(empty({s: ""})).toBe("f cv");
  });

  test("empty and 'false' strings meet each other's conditions, other strings do not", () => {
    const c = factory({
      base: "b",
      variants: {s: {false: "f", sm: "x"}, z: {a: "za", b: "zb"}},
      compoundVariants: [
        {s: "", class: "empty"},
        {s: "false", class: "false"},
        {z: ["a", ""], class: "a-or-empty"},
      ],
    });

    for (let i = 0; i < 2; i++) {
      expect(c({s: "", z: "b"})).toBe("b f zb empty false");
      expect(c({s: "false", z: "b"})).toBe("b f zb empty false");
      expect(c({s: "sm", z: "b"})).toBe("b x zb");
      expect(c({s: "sm", z: "a"})).toBe("b x za a-or-empty");
      expect(c({s: "sm", z: ""})).toBe("b x a-or-empty");
      expect(c({s: "sm", z: "false"})).toBe("b x a-or-empty");
    }
  });

  test("dynamic calls agree whichever spelling fills the cache", () => {
    const c = factory({
      base: "b",
      variants: {s: {false: "f", sm: "x"}, z: {a: "za", b: "zb"}},
      defaultVariants: {s: "false", z: "a"},
      compoundVariants: [{s: "false", class: "cv"}],
    });

    expect(c({s: false, z: "b"})).toBe("b f zb cv");
    expect(c({s: "false", z: "b"})).toBe("b f zb cv");
    expect(c({s: false, z: "b"})).toBe("b f zb cv");
  });

  test("compound slots and slot compound variants agree", () => {
    const c = factory({
      slots: {base: "b", label: "l"},
      variants: {s: {false: {base: "f"}, sm: {base: "x"}}},
      defaultVariants: {s: "false"},
      compoundVariants: [{s: false, class: {label: "cv"}}],
      compoundSlots: [{slots: ["base"], s: "false", class: "cs"}],
    });

    for (let i = 0; i < 2; i++) {
      const slots = c({s: false});

      expect(slots.base()).toBe("b f cs");
      expect(slots.label()).toBe("l cv");
    }
    expect(c().base()).toBe("b f cs");
    expect(c({s: "sm"}).base({s: false})).toBe("b f cs");
  });
});

describe.each(entryFactories)("props cache keys keep different values apart (%s)", (_, factory) => {
  // Warms a recipe with `fill`, then expects `probe` to match a fresh recipe.
  const expectWarmToMatchCold = (options: AnyRecord, fill: AnyRecord, probe: AnyRecord) => {
    const warm = factory(options);

    warm({s: "y"});
    warm(fill);
    warm(fill);

    const cold = factory(options)(probe);
    const result = warm(probe);

    return {
      cold: typeof cold === "string" ? cold : cold.base(),
      warm: typeof result === "string" ? result : result.base(),
    };
  };

  const axes = {s: {x: "s-x", y: "s-y"}};

  test("null and the string 'null'", () => {
    const options = {
      base: "b",
      variants: {tone: {null: "tone-null", a: "tone-a"}, ...axes},
      defaultVariants: {tone: "a"},
    };
    const nullFirst = expectWarmToMatchCold(options, {tone: null, s: "x"}, {tone: "null", s: "x"});
    const stringFirst = expectWarmToMatchCold(
      options,
      {tone: "null", s: "x"},
      {tone: null, s: "x"},
    );

    expect(nullFirst).toEqual({cold: "b tone-null s-x", warm: "b tone-null s-x"});
    expect(stringFirst).toEqual({cold: "b s-x", warm: "b s-x"});
  });

  test("null and the string 'null' in slot recipes", () => {
    const options = {
      slots: {base: "b"},
      variants: {tone: {null: {base: "tone-null"}, a: {base: "tone-a"}}, ...axes},
      defaultVariants: {tone: "a"},
    };

    expect(expectWarmToMatchCold(options, {tone: "null", s: "x"}, {tone: null, s: "x"})).toEqual({
      cold: "b s-x",
      warm: "b s-x",
    });
  });

  test("undefined and the string 'undefined'", () => {
    const options = {
      base: "b",
      variants: {tone: {undefined: "tone-undefined", a: "tone-a"}, ...axes},
      defaultVariants: {tone: "a"},
    };

    expect(
      expectWarmToMatchCold(options, {tone: "undefined", s: "x"}, {tone: undefined, s: "x"}),
    ).toEqual({cold: "b tone-a s-x", warm: "b tone-a s-x"});
  });

  test("an explicit null and a null default", () => {
    const options = {
      base: "b",
      variants: {tone: {false: "tone-false"}, ...axes},
      defaultVariants: {tone: null},
    };

    expect(expectWarmToMatchCold(options, {s: "x"}, {tone: null, s: "x"})).toEqual({
      cold: "b s-x",
      warm: "b s-x",
    });
    expect(expectWarmToMatchCold(options, {tone: null, s: "x"}, {s: "x"})).toEqual({
      cold: "b tone-false s-x",
      warm: "b tone-false s-x",
    });
  });

  test("NaN and the string 'NaN'", () => {
    const options = {
      base: "b",
      variants: axes,
      compoundVariants: [{n: false, class: "n-false"}],
    };

    expect(expectWarmToMatchCold(options, {n: "NaN", s: "x"}, {n: NaN, s: "x"})).toEqual({
      cold: "b s-x n-false",
      warm: "b s-x n-false",
    });
  });

  test("an array and its JSON text", () => {
    const options = {base: "b", variants: {tone: {'["a"]': "tone-json"}, ...axes}};

    expect(expectWarmToMatchCold(options, {tone: '["a"]', s: "x"}, {tone: ["a"], s: "x"})).toEqual({
      cold: "b s-x",
      warm: "b s-x",
    });
  });

  test("a compound condition object and an equal copy", () => {
    const condition = {k: 1};
    const options = {
      base: "b",
      variants: axes,
      compoundVariants: [{o: condition, class: "o-match"}],
    };

    expect(expectWarmToMatchCold(options, {o: condition, s: "x"}, {o: {k: 1}, s: "x"})).toEqual({
      cold: "b s-x",
      warm: "b s-x",
    });
    expect(expectWarmToMatchCold(options, {o: {k: 1}, s: "x"}, {o: condition, s: "x"})).toEqual({
      cold: "b s-x o-match",
      warm: "b s-x o-match",
    });
  });

  test("a BigInt and its decimal string", () => {
    const options = {base: "b", variants: {tone: {0: "tone-0", false: "tone-false"}, ...axes}};

    expect(expectWarmToMatchCold(options, {tone: "0", s: "x"}, {tone: 0n, s: "x"})).toEqual({
      cold: "b tone-false s-x",
      warm: "b tone-false s-x",
    });
  });

  test("values that resolve alike still share an entry", () => {
    const {tv: countingTV, calls} = createCounting();
    const box = countingTV({
      variants: {on: {true: "on", false: "off"}, level: {1: "l1", 2: "l2"}, ...axes},
      compoundVariants: [{on: false, level: 1, class: "cv"}],
    });

    box({s: "y"});
    expect(box({on: false, level: 1, s: "x"})).toBe("off l1 s-x cv");

    const filled = calls();

    expect(box({on: "false", level: "1", s: "x"} as any)).toBe("off l1 s-x cv");
    expect(box({on: NaN, level: 1, s: "x"} as any)).toBe("off l1 s-x cv");
    expect(calls()).toBe(filled);
  });
});

describe("props cache keys (variant axes and compound condition keys only)", () => {
  const onClick = () => {};

  test("pass-through props hit the variants cache", () => {
    const {tv: countingTV, calls} = createCounting();
    const button = countingTV({
      base: "btn",
      variants: {size: {sm: "text-sm", lg: "text-lg"}},
      defaultVariants: {size: "sm"},
    });

    button({size: "lg"});
    expect(button({size: "lg", id: "a"} as any)).toBe("btn text-lg");

    const filled = calls();

    expect(button({size: "lg", id: "b"} as any)).toBe("btn text-lg");
    expect(button({size: "lg", "aria-label": "close"} as any)).toBe("btn text-lg");
    expect(button({size: "lg", onClick: () => {}} as any)).toBe("btn text-lg");
    expect(button({size: "lg", onClick, children: {a: [1, {b: 2}]}} as any)).toBe("btn text-lg");
    expect(button({size: "lg", children: Symbol("c")} as any)).toBe("btn text-lg");
    expect(calls()).toBe(filled);
    expect(button({size: "sm", id: "c"} as any)).toBe("btn text-sm");
  });

  test("pass-through props hit the slots cache", () => {
    const card = tv({
      slots: {root: "root", label: "label"},
      variants: {size: {sm: {root: "root-sm"}, lg: {root: "root-lg"}}},
      defaultVariants: {size: "sm"},
    });

    card({size: "lg"});

    const first = card({size: "lg", id: "a"} as any);

    expect(card({size: "lg", id: "b"} as any)).toBe(first);
    expect(card({size: "lg", onClick: () => {}} as any)).toBe(first);
    expect(card({size: "lg", children: {a: [1]}} as any)).toBe(first);
    expect(first.root()).toBe("root root-lg");
    expect(first.root({size: "sm"})).toBe("root root-sm");
  });

  test("a compound condition key outside the variants keeps entries apart", () => {
    const {tv: countingTV, calls} = createCounting();
    const menu = countingTV({
      base: "menu",
      variants: {color: {red: "red", blue: "blue"}},
      compoundVariants: [{color: "red", isOpen: true, class: "open"} as any],
    });

    menu({color: "blue"});
    expect(menu({color: "red", isOpen: false, id: "a"} as any)).toBe("menu red");
    expect(menu({color: "red", isOpen: true, id: "b"} as any)).toBe("menu red open");
    expect(menu({color: "red", id: "c"} as any)).toBe("menu red");

    const filled = calls();

    expect(menu({color: "red", isOpen: true, id: "d", onClick} as any)).toBe("menu red open");
    expect(menu({color: "red", isOpen: false, id: "e"} as any)).toBe("menu red");
    expect(calls()).toBe(filled);
  });

  test("a compound condition key outside the variants keeps slot entries apart", () => {
    const menu = tv({
      slots: {root: "root", item: "item"},
      variants: {color: {red: {root: "red"}, blue: {root: "blue"}}},
      compoundSlots: [{slots: ["item"], isOpen: true, class: "open"} as any],
    });

    menu({color: "blue"});

    const closed = menu({color: "red", isOpen: false, id: "a"} as any);
    const open = menu({color: "red", isOpen: true, id: "b"} as any);

    expect(open).not.toBe(closed);
    expect(closed.item()).toBe("item");
    expect(open.item()).toBe("item open");
    expect(menu({color: "red", isOpen: true, id: "c"} as any)).toBe(open);
  });

  test("a compound condition key held only in defaultVariants still keys the cache", () => {
    const menu = tv({
      base: "menu",
      variants: {color: {red: "red", blue: "blue"}},
      compoundVariants: [{color: "red", isOpen: true, class: "open"} as any],
      defaultVariants: {isOpen: true} as any,
    });

    menu({color: "blue"});
    expect(menu({color: "red", id: "a"} as any)).toBe("menu red open");

    (menu.defaultVariants as AnyRecord).isOpen = false;

    expect(menu({color: "red", id: "b"} as any)).toBe("menu red");
  });

  test("an in-place edit of a non-variant compound condition resets the cache", () => {
    const options = () => ({
      base: "menu",
      variants: {color: {red: "red", blue: "blue"}},
      compoundVariants: [{color: "red", isOpen: true, class: "open"} as any],
    });
    const warm = tv(options());

    warm({color: "blue"});
    expect(warm({color: "red", isOpen: false, id: "a"} as any)).toBe("menu red");
    expect(warm({color: "red", isOpen: true, id: "a"} as any)).toBe("menu red open");

    (warm.compoundVariants[0] as AnyRecord).isOpen = false;

    const cold = options();

    cold.compoundVariants[0].isOpen = false;

    for (const props of [{isOpen: false, id: "b"}, {isOpen: true, id: "c"}, {id: "d"}]) {
      const call = {color: "red", ...props} as any;

      expect(warm(call)).toBe(tv(cold)(call));
    }
    expect(warm({color: "red", isOpen: false} as any)).toBe("menu red open");
  });

  test("a condition key added in place before the first call keys the cache", () => {
    const menu = tv({
      base: "menu",
      variants: {color: {red: "red", blue: "blue"}},
      compoundVariants: [{color: "red", class: "cv"}],
    });

    (menu.compoundVariants[0] as AnyRecord).isOpen = true;

    menu({color: "blue"});
    expect(menu({color: "red", isOpen: false, id: "a"} as any)).toBe("menu red");
    expect(menu({color: "red", isOpen: true, id: "b"} as any)).toBe("menu red cv");
    expect(menu({color: "red", isOpen: false, id: "c"} as any)).toBe("menu red");
  });

  test("a condition key added in place after the first call is ignored, cached or not", () => {
    const options = () => ({
      base: "menu",
      variants: {color: {red: "red", blue: "blue"}},
      compoundVariants: [{color: "red", class: "cv"} as any],
    });
    const mutate = (recipe: any) => {
      recipe.compoundVariants[0].isOpen = true;
      recipe.compoundVariants.push({isOpen: false, class: "pushed"});
    };
    const probe = {color: "red", isOpen: false, id: "a"} as any;
    const warm = tv(options());

    warm({color: "blue"});
    warm(probe);
    mutate(warm);

    // compiled once: the twin's probe is a cache miss on the same compiled metadata
    const twin = tv(options());

    twin({color: "blue"});
    mutate(twin);

    expect(twin(probe)).toBe("menu red cv");
    expect(warm(probe)).toBe(twin(probe));
  });
});

describe("slot overrides on cached slot results", () => {
  const card = () =>
    tv(
      {
        slots: {base: "flex"},
        variants: {
          size: {sm: {base: "h-8"}, md: {base: "h-10"}},
          tone: {a: {base: "text-red-500"}, b: {base: "text-blue-500"}},
        },
        defaultVariants: {size: "md"},
      },
      {twMerge: false},
    );

  test("an in-place default edit does not leak into a cached result's slot override", () => {
    const warm = card();

    warm({tone: "a"});
    // cached with `size` taken from the default ("md")
    warm({tone: "a"});
    warm.defaultVariants.size = "sm";

    const cold = card();

    cold.defaultVariants.size = "sm";

    const expected = cold({tone: "a", size: "md"}).base({tone: "b"});

    expect(expected).toBe("flex h-10 text-blue-500");
    expect(warm({tone: "a", size: "md"}).base({tone: "b"})).toBe(expected);
  });

  test("mutating the props object after the call does not change a cached slot override", () => {
    const warm = card();

    warm({size: "md"});

    const props = {size: "sm", tone: "a"} as const;
    const reused: {size: string; tone: string} = {...props};

    warm(reused as any);
    reused.size = "md";

    const expected = card()(props).base({tone: "b"});

    expect(expected).toBe("flex h-8 text-blue-500");
    expect(warm(props).base({tone: "b"})).toBe(expected);
  });

  test("an uncached result keeps the props it was called with", () => {
    const reused: {size: string; tone: string} = {size: "sm", tone: "a"};
    const held = card()(reused as any);

    reused.size = "md";

    expect(held.base({tone: "b"})).toBe("flex h-8 text-blue-500");
  });

  test("held cached and cold results read in-place default edits alike", () => {
    const warm = card();

    warm({tone: "a"});

    const cached = warm({tone: "a"});
    const cold = card();
    const uncached = cold({tone: "a"});

    warm.defaultVariants.size = "sm";
    cold.defaultVariants.size = "sm";

    expect(uncached.base({tone: "b"})).toBe("flex h-8 text-blue-500");
    expect(cached.base({tone: "b"})).toBe(uncached.base({tone: "b"}));
    expect(cached.base()).toBe(uncached.base());
  });
});

describe.each(entryFactories)("Object.prototype-named variant axes (%s)", (_, factory) => {
  test("slot recipes ignore inherited members of a plain props object", () => {
    const c = factory({
      slots: {base: "b"},
      variants: {constructor: {false: "f", true: "t"}},
      defaultVariants: {constructor: "false"},
      compoundSlots: [{slots: ["base"], constructor: "false", class: "cs"}],
    });

    expect(c({}).base()).toBe("b f cs");
    expect(c({}).base()).toBe("b f cs");
    expect(c().base()).toBe("b f cs");
    expect(c().base({})).toBe("b f cs");
    expect(c({constructor: true}).base()).toBe("b t");
  });

  test("variant recipes ignore inherited members of props and defaults", () => {
    const c = factory({
      base: "b",
      variants: {toString: {false: "f", true: "t"}, valueOf: {false: "vf", x: "vx"}},
      defaultVariants: {valueOf: "x"},
      compoundVariants: [
        {toString: false, class: "cv"},
        {valueOf: "x", class: "cx"},
      ],
    });

    expect(c({})).toBe("b f vx cv cx");
    expect(c({})).toBe("b f vx cv cx");
    expect(c()).toBe("b f vx cv cx");
    expect(c({toString: true, valueOf: "x"})).toBe("b t vx cx");
  });

  test("dynamic calls ignore inherited members too", () => {
    const c = factory({
      slots: {base: "b"},
      variants: {hasOwnProperty: {false: "f", true: "t"}, size: {sm: "s", lg: "l"}},
      defaultVariants: {size: "sm"},
      compoundSlots: [{slots: ["base"], hasOwnProperty: false, size: "lg", class: "cs"}],
    });

    for (let i = 0; i < 3; i++) {
      expect(c({size: "lg"}).base()).toBe("b f l cs");
    }
  });
});
