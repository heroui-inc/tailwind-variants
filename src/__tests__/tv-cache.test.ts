import type {MergeAdapter} from "../internal/types.js";

import {describe, expect, test} from "vitest";

import {cnMerge, createTV, tv} from "../index";
import {
  buildCompoundsSignature,
  buildPropsFingerprint,
  CACHE_MISS,
  createBoundedCache,
  createLazyOverrideMerge,
} from "../internal/cache.js";
import {cx} from "../utils.js";

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

describe("non-finite number serialization", () => {
  const variantKeys = ["size"];

  test("bails out for NaN inside object props instead of colliding with null", () => {
    const nan = buildPropsFingerprint(variantKeys, {}, {size: {level: NaN}});
    const nullValue = buildPropsFingerprint(variantKeys, {}, {size: {level: null}});

    expect(nan).toBeNull();
    expect(nullValue).not.toBeNull();
  });

  test("bails out for Infinity inside nested array props", () => {
    expect(buildPropsFingerprint(variantKeys, {}, {size: [Infinity]})).toBeNull();
    expect(buildPropsFingerprint(variantKeys, {}, {size: [null]})).not.toBeNull();
  });

  test("keeps serializing finite nested values", () => {
    expect(buildPropsFingerprint(variantKeys, {}, {size: {level: 1}})).not.toBeNull();
  });

  test("distinguishes array props carrying different objects", () => {
    const a = buildPropsFingerprint(variantKeys, {}, {size: [{x: 1}]});
    const b = buildPropsFingerprint(variantKeys, {}, {size: [{y: 2}]});

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
  });

  test("compounds signature bails out for non-finite condition values", () => {
    const nan = [{conditionKeys: ["size"], source: {size: {level: NaN}}}];
    const finite = [{conditionKeys: ["size"], source: {size: {level: 2}}}];

    expect(buildCompoundsSignature(nan, [])).toBeNull();
    expect(buildCompoundsSignature(finite, [])).not.toBeNull();
  });

  test("compounds signature bails out for non-finite class values", () => {
    const nanClass = [{conditionKeys: [], source: {class: {width: NaN}}}];
    const nullClass = [{conditionKeys: [], source: {class: {width: null}}}];

    expect(buildCompoundsSignature(nanClass, [])).toBeNull();
    expect(buildCompoundsSignature(nullClass, [])).not.toBeNull();
  });

  test("compounds signature bails out for circular objects", () => {
    const circular: Record<string, unknown> = {};

    circular.self = circular;

    const source = [{conditionKeys: [], source: {class: circular}}];

    expect(buildCompoundsSignature(source, [])).toBeNull();
  });
});

describe("appendSignatureValue fast paths", () => {
  test("serializes primitive-array conditions deterministically", () => {
    const compounds = [{conditionKeys: ["s"], source: {s: ["a", "b"], class: "x"}}];
    const first = buildCompoundsSignature(compounds, []);
    const second = buildCompoundsSignature(compounds, []);

    expect(first).not.toBeNull();
    expect(first).toBe(second);
  });

  test("tolerates empty and falsy-filled arrays", () => {
    const empty = [{conditionKeys: ["s"], source: {s: [], class: "x"}}];
    const falsy = [{conditionKeys: ["s"], source: {s: ["a", null, undefined, false], class: "x"}}];

    expect(buildCompoundsSignature(empty, [])).not.toBeNull();
    expect(buildCompoundsSignature(falsy, [])).not.toBeNull();
  });

  test("keeps the full shape of arrays containing objects", () => {
    const withObjectA = [{conditionKeys: ["s"], source: {s: ["a", {x: 1}], class: "x"}}];
    const withObjectB = [{conditionKeys: ["s"], source: {s: ["a", {y: 2}], class: "x"}}];

    const sigA = buildCompoundsSignature(withObjectA, []);
    const sigB = buildCompoundsSignature(withObjectB, []);

    expect(sigA).not.toBeNull();
    expect(sigB).not.toBeNull();
    expect(sigA).not.toBe(sigB);
  });

  test("bails out for non-finite numbers inside arrays", () => {
    const nan = [{conditionKeys: ["s"], source: {s: [NaN, "a"], class: "x"}}];
    const infinity = [{conditionKeys: ["s"], source: {s: [Infinity, "a"], class: "x"}}];

    expect(buildCompoundsSignature(nan, [])).toBeNull();
    expect(buildCompoundsSignature(infinity, [])).toBeNull();
  });

  test("serializes flat objects of primitives without collapsing them", () => {
    const classValue = [{conditionKeys: [], source: {class: {base: "r", label: "m"}}}];
    const otherClassValue = [{conditionKeys: [], source: {class: {base: "r", label: "n"}}}];

    const sigA = buildCompoundsSignature(classValue, []);
    const sigB = buildCompoundsSignature(otherClassValue, []);

    expect(sigA).not.toBeNull();
    expect(sigB).not.toBeNull();
    expect(sigA).not.toBe(sigB);
  });

  test("bails out for non-finite numbers inside objects", () => {
    const nan = [{conditionKeys: [], source: {class: {base: "r", n: NaN}}}];
    const infinity = [{conditionKeys: [], source: {class: {base: Infinity}}}];
    const nested = [{conditionKeys: [], source: {class: {base: {inner: NaN}}}}];

    expect(buildCompoundsSignature(nan, [])).toBeNull();
    expect(buildCompoundsSignature(infinity, [])).toBeNull();
    expect(buildCompoundsSignature(nested, [])).toBeNull();
  });

  test("bails out for BigInt and circular values without throwing", () => {
    const bigint = [{conditionKeys: [], source: {class: {base: 123n}}}];
    const circular: Record<string, unknown> = {};

    circular.self = circular;

    const circularSource = [{conditionKeys: [], source: {class: circular}}];

    expect(() => buildCompoundsSignature(bigint, [])).not.toThrow();
    expect(buildCompoundsSignature(bigint, [])).toBeNull();
    expect(() => buildCompoundsSignature(circularSource, [])).not.toThrow();
    expect(buildCompoundsSignature(circularSource, [])).toBeNull();
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
