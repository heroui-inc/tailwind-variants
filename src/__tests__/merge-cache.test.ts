import type {CreateMergerConfig} from "../internal/compile-config/compile.js";
import type {Engine} from "../internal/merge-engine/types.js";

import {afterEach, describe, expect, test} from "vitest";

import {cnMerge as cnMergeCustom, tv as customTV} from "../config-entry";
import {cn, cnMerge, tv} from "../index";
import {getApiFor} from "../internal/engine-cache.js";
import {DEFAULT_CACHE_SIZE, engine} from "../internal/engine-instance.js";
import {createMergeApi} from "../internal/merge-adapter.js";
import {state} from "../internal/state.js";

afterEach(() => {
  state.reset();
});

describe("cn argument-identity cache", () => {
  test("same string instances twice give the same result", () => {
    const base = "px-2 py-1 text-sm";
    const extra = "px-4";
    const className = "text-lg font-bold";

    const first = cn(base, extra, className);
    const second = cn(base, extra, className);

    expect(first).toBe("py-1 px-4 text-lg font-bold");
    expect(second).toBe(first);
  });

  test("falsy gaps do not change the cached tuple", () => {
    const base = "px-2";
    const extra = "px-4";

    expect(cn(base, false, extra)).toBe("px-4");
    expect(cn(base, extra)).toBe("px-4");
    expect(cn(base, null, undefined, extra, "")).toBe("px-4");
    expect(cn(base, extra, false)).toBe("px-4");
  });

  test("a different tuple with the same first arg is a distinct entry", () => {
    const base = "px-2 text-sm";

    expect(cn(base, "px-4")).toBe("text-sm px-4");
    expect(cn(base, "text-lg")).toBe("px-2 text-lg");
    expect(cn(base, "px-4")).toBe("text-sm px-4");
    expect(cn(base, "px-4", "text-lg")).toBe("px-4 text-lg");
    expect(cn(base)).toBe("px-2 text-sm");
  });

  test("mutating an object arg between calls never serves a stale result", () => {
    const toggles = {"text-white": true, "bg-blue-500": true};

    expect(cn("px-2", toggles)).toBe("px-2 text-white bg-blue-500");

    toggles["text-white"] = false;

    expect(cn("px-2", toggles)).toBe("px-2 bg-blue-500");

    toggles["bg-blue-500"] = false;

    expect(cn("px-2", toggles)).toBe("px-2");

    toggles["text-white"] = true;

    expect(cn("px-2", toggles)).toBe("px-2 text-white");
  });

  test("mutating an array arg between calls never serves a stale result", () => {
    const list = ["px-4", "py-2"];

    expect(cn("px-2", list)).toBe("px-4 py-2");

    list.push("px-6");

    expect(cn("px-2", list)).toBe("py-2 px-6");

    list.length = 0;

    expect(cn("px-2", list)).toBe("px-2");
  });

  test("a resolved one-key object hits the same entry as its key string", () => {
    const on = {"text-white": true};

    expect(cn("bg-blue-500", on)).toBe("bg-blue-500 text-white");
    expect(cn("bg-blue-500", "text-white")).toBe("bg-blue-500 text-white");
    expect(cn("bg-blue-500", {"text-white": true})).toBe("bg-blue-500 text-white");
  });

  test("a lone array flattens like clsx", () => {
    const a = "px-2 text-sm";
    const b = "px-4";

    expect(cn([a, b])).toBe(cn(a, b));
    expect(cn([a, [b, {"font-bold": true}]])).toBe("text-sm px-4 font-bold");
    expect(cn([a, false, null, b])).toBe("text-sm px-4");
  });

  test("four or more args hit the cache and stay correct with falsy gaps", () => {
    const a = "px-2";
    const b = "py-2";
    const c = "px-4";
    const d = "text-sm";

    for (let i = 0; i < 3; i++) {
      expect(cn(a, b, c, d)).toBe("py-2 px-4 text-sm");
      expect(cn(a, false, b, c, null, d)).toBe("py-2 px-4 text-sm");
      expect(cn(a, b, c, d, "text-lg")).toBe("py-2 px-4 text-lg");
      expect(cn(a, b, c, {"font-bold": true})).toBe("py-2 px-4 font-bold");
    }
  });

  test("sequence prediction is only a hint: any call order stays correct", () => {
    const base = "inline-flex px-2";
    const primary = "bg-blue-500 text-white";
    const secondary = "bg-white text-gray-800";
    const wide = "px-6";
    const expected = {
      primary: "inline-flex px-2 bg-blue-500 text-white",
      secondary: "inline-flex px-2 bg-white text-gray-800",
      primaryWide: "inline-flex bg-blue-500 text-white px-6",
      secondaryWide: "inline-flex bg-white text-gray-800 px-6",
    };
    const calls = [
      () => expect(cn(base, primary)).toBe(expected.primary),
      () => expect(cn(base, secondary)).toBe(expected.secondary),
      () => expect(cn(base, primary, wide)).toBe(expected.primaryWide),
      () => expect(cn(base, secondary, wide)).toBe(expected.secondaryWide),
      () => expect(cn(base, false, primary)).toBe(expected.primary),
    ];

    // Warm every chain link in one order, then replay in different orders,
    // with repeats, so a wrong prediction would surface as a wrong string.
    for (const call of calls) call();
    for (const call of calls) call();
    for (const call of [...calls].reverse()) call();
    for (const call of [calls[0], calls[0], calls[2], calls[2], calls[1], calls[4], calls[3]])
      call();
    for (let i = 0; i < 20; i++) calls[i % calls.length]();
  });

  test("cnMerge default path shares the cache and never mutates its arguments", () => {
    const toggles = {"text-white": true};
    const run = cnMerge("px-2", toggles, "px-4");

    expect(run()).toBe("text-white px-4");
    expect(run()).toBe("text-white px-4");
    expect(toggles).toEqual({"text-white": true});

    toggles["text-white"] = false;

    expect(run()).toBe("px-4");
    expect(run({twMerge: false})).toBe("px-2 px-4");
  });

  test("stays correct past the bucket cap and generation rotation", () => {
    const base = "px-2";

    for (let i = 0; i < 300; i++) {
      expect(cn(base, `m-${i}`)).toBe(`px-2 m-${i}`);
      expect(cn(base, `m-${i}`)).toBe(`px-2 m-${i}`);
    }

    for (let i = 0; i < 1200; i++) {
      expect(cn(`b-${i}`, `e-${i}`)).toBe(`b-${i} e-${i}`);
    }

    expect(cn(base, "m-0")).toBe("px-2 m-0");
    expect(cn(base, "m-299")).toBe("px-2 m-299");
    expect(cn("b-0", "e-0")).toBe("b-0 e-0");
  });
});

describe("recipe merges through the argument cache", () => {
  test("variant and override merges are correct across repeated and new props", () => {
    const button = tv({
      base: "inline-flex px-2 text-sm",
      variants: {
        color: {primary: "bg-blue-500 text-white", secondary: "bg-white text-gray-800"},
        size: {sm: "px-3", lg: "px-6 text-lg"},
      },
      defaultVariants: {color: "primary", size: "sm"},
    });
    const className = "rounded-md px-8";

    for (let i = 0; i < 3; i++) {
      expect(button()).toBe("inline-flex text-sm bg-blue-500 text-white px-3");
      expect(button({size: "lg"})).toBe("inline-flex bg-blue-500 text-white px-6 text-lg");
      expect(button({size: "lg", className})).toBe(
        "inline-flex bg-blue-500 text-white text-lg rounded-md px-8",
      );
      expect(button({color: "secondary", className})).toBe(
        "inline-flex text-sm bg-white text-gray-800 rounded-md px-8",
      );
      expect(button({color: "secondary", className: `w-[${i}px]`})).toBe(
        `inline-flex text-sm bg-white text-gray-800 px-3 w-[${i}px]`,
      );
    }
  });

  test("slot calls with slot props re-resolve through the cache correctly", () => {
    const card = tv({
      slots: {root: "p-2 rounded", label: "text-sm"},
      variants: {
        size: {sm: {root: "p-3", label: "text-xs"}, lg: {root: "p-6", label: "text-lg"}},
      },
      defaultVariants: {size: "sm"},
    });

    for (let i = 0; i < 3; i++) {
      const slots = card();

      expect(slots.root()).toBe("rounded p-3");
      expect(slots.label()).toBe("text-xs");
      expect(slots.root({size: "lg"})).toBe("rounded p-6");
      expect(slots.label({size: "lg", class: "font-bold"})).toBe("text-lg font-bold");
      expect(slots.root({class: "p-8"})).toBe("rounded p-8");
    }
  });
});

describe("cacheSize 0", () => {
  test("bypasses the whole-string cache, doorkeeper, and argument cache", () => {
    const api = getApiFor({cacheSize: 0});
    const {engine, cn: cnUncached, adapter} = api;

    expect(engine.seenBefore("px-2 px-4")).toBe(false);
    expect(engine.seenBefore("px-2 px-4")).toBe(false);

    const base = "px-2";

    expect(cnUncached(base, "px-4")).toBe("px-4");
    expect(cnUncached(base, "px-4")).toBe("px-4");
    expect(cnUncached(base, "px-4", "py-1")).toBe("px-4 py-1");
    expect(adapter.parts([base, "px-4", "py-1"], 3)).toBe("px-4 py-1");
    expect(adapter.override(base, {"px-6": true}, undefined)).toBe("px-6");
    expect(engine.mergeString("px-2 px-4")).toBe("px-4");
  });

  test("applies through twMergeConfig on recipes and cnMerge", () => {
    const twMergeConfig = {cacheSize: 0};
    const button = customTV({base: "px-2", variants: {size: {lg: "px-6"}}}, {twMergeConfig});

    expect(button()).toBe("px-2");
    expect(button({size: "lg"})).toBe("px-6");
    expect(button({size: "lg"})).toBe("px-6");
    expect(button({size: "lg", class: "px-8"})).toBe("px-8");
    expect(cnMergeCustom("px-2", "px-4")({twMergeConfig})).toBe("px-4");
  });
});

// A fresh string instance with the same text (React-style className).
const fresh = (text: string): string => `x${text}`.slice(1);

// Wrap the default engine so engine calls are countable.
const createCountingMerger = () => {
  const counts = {cached: 0, uncached: 0};
  const counting: Engine = {
    merge: engine.merge,
    mergeString: (input: string) => {
      counts.cached++;

      return engine.mergeString(input);
    },
    mergeUncached: (input: string) => {
      counts.uncached++;

      return engine.mergeUncached(input);
    },
    seenBefore: engine.seenBefore,
  };

  return {merger: counting, counts};
};

const createCache = (merger: Engine, cacheSize = DEFAULT_CACHE_SIZE) =>
  createMergeApi(merger, cn, cacheSize).adapter;

describe("override cache", () => {
  test("keys by text: a new string instance with the same text hits after warmup", () => {
    const {merger, counts} = createCountingMerger();
    const cache = createCache(merger);
    const core = "inline-flex px-2 text-sm";

    // first sighting: merged uncached, nothing stored
    expect(cache.override(core, undefined, fresh("px-4 mt-2"))).toBe(
      "inline-flex text-sm px-4 mt-2",
    );
    expect(counts).toEqual({cached: 0, uncached: 1});

    // second sighting: admitted
    expect(cache.override(core, undefined, fresh("px-4 mt-2"))).toBe(
      "inline-flex text-sm px-4 mt-2",
    );
    expect(counts).toEqual({cached: 1, uncached: 1});

    // every later sighting, each a new instance, is a cache hit
    for (let i = 0; i < 10; i++) {
      expect(cache.override(core, undefined, fresh("px-4 mt-2"))).toBe(
        "inline-flex text-sm px-4 mt-2",
      );
    }
    expect(counts).toEqual({cached: 1, uncached: 1});
  });

  test("hits through the map when call sites interleave", () => {
    const {merger, counts} = createCountingMerger();
    const cache = createCache(merger);
    const coreA = "px-2 text-sm";
    const coreB = "py-2 text-lg";

    for (let i = 0; i < 2; i++) {
      cache.override(coreA, fresh("px-4"), undefined);
      cache.override(coreB, undefined, fresh("py-4"));
      cache.override(coreA, fresh("px-4"), fresh("mt-1"));
    }

    const warm = {...counts};

    for (let i = 0; i < 5; i++) {
      expect(cache.override(coreA, fresh("px-4"), undefined)).toBe("text-sm px-4");
      expect(cache.override(coreB, undefined, fresh("py-4"))).toBe("text-lg py-4");
      expect(cache.override(coreA, fresh("px-4"), fresh("mt-1"))).toBe("text-sm px-4 mt-1");
    }
    expect(counts).toEqual(warm);
  });

  test("empty or missing overrides return the core untouched", () => {
    const {merger, counts} = createCountingMerger();
    const cache = createCache(merger);

    expect(cache.override("px-2", "", undefined)).toBe("px-2");
    expect(cache.override("px-2", null, "")).toBe("px-2");
    expect(cache.override("px-2", {}, [])).toBe("px-2");
    expect(counts).toEqual({cached: 0, uncached: 0});
    expect(cache.override("", "px-2 px-4", undefined)).toBe("px-4");
    expect(cache.override("", undefined, fresh("px-2 px-4"))).toBe("px-4");
  });

  test("non-string overrides resolve like clsx values", () => {
    const {merger} = createCountingMerger();
    const cache = createCache(merger);

    expect(cache.override("px-2", ["px-4", {hidden: true}], undefined)).toBe("px-4 hidden");
    expect(cache.override("px-2", {"px-4": true, "py-1": false}, "py-2")).toBe("px-4 py-2");
    expect(cache.override("px-2", 0, undefined)).toBe("px-2 0");
  });

  test("unique override texts never enter the cache and hot texts survive them", () => {
    const {merger, counts} = createCountingMerger();
    const cache = createCache(merger);
    const core = "inline-flex px-2";

    cache.override(core, undefined, fresh("px-4"));
    cache.override(core, undefined, fresh("px-4"));

    const warm = {...counts};

    for (let i = 0; i < 3000; i++) {
      expect(cache.override(core, undefined, `w-[${i}px]`)).toBe(`inline-flex px-2 w-[${i}px]`);
    }
    expect(counts.uncached).toBe(warm.uncached + 3000);
    expect(counts.cached).toBe(warm.cached);
    expect(cache.override(core, undefined, fresh("px-4"))).toBe("inline-flex px-4");
    expect(counts.cached).toBe(warm.cached);
  });

  test("cacheSize 0 merges every override uncached", () => {
    const {merger, counts} = createCountingMerger();
    const cache = createCache(merger, 0);

    for (let i = 0; i < 3; i++) {
      expect(cache.override("px-2", undefined, fresh("px-4"))).toBe("px-4");
    }
    expect(counts).toEqual({cached: 0, uncached: 3});
  });
});

describe("recipes with fresh className instances", () => {
  test("stay correct across repeated calls with same-text new strings", () => {
    const button = tv({
      base: "inline-flex px-2 text-sm",
      variants: {
        intent: {primary: "bg-blue-500 text-white", secondary: "bg-white text-gray-800"},
        size: {sm: "px-3", lg: "px-6 text-lg"},
      },
      defaultVariants: {intent: "primary", size: "sm"},
    });

    for (let i = 0; i < 6; i++) {
      expect(button({className: fresh("px-8 shadow-sm")})).toBe(
        "inline-flex text-sm bg-blue-500 text-white px-8 shadow-sm",
      );
      expect(button({intent: "secondary", size: "lg", className: fresh("px-8 shadow-sm")})).toBe(
        "inline-flex bg-white text-gray-800 text-lg px-8 shadow-sm",
      );
      expect(button({size: "lg", class: fresh("mt-1"), className: fresh("px-8")} as any)).toBe(
        "inline-flex bg-blue-500 text-white text-lg mt-1 px-8",
      );
    }
  });
});

// Engine for a config (the default engine when no config is given).
const createMerger = (config?: CreateMergerConfig) =>
  config === undefined ? engine : getApiFor(config).engine;

describe("doorkeeper", () => {
  test("admits a string on its second sighting", () => {
    // the default engine is a process-wide singleton, so use a string no
    // other test has shown it
    const merger = createMerger();
    const input = `doorkeeper-${Date.now()} px-2 px-4`;

    expect(merger.seenBefore(input)).toBe(false);
    expect(merger.seenBefore(input)).toBe(true);
    expect(merger.seenBefore(input)).toBe(true);
  });

  test("does not confuse arbitrary values of the same shape", () => {
    const merger = createMerger();

    expect(merger.seenBefore("w-[123px] bg-[#a1b2c3]")).toBe(false);
    expect(merger.seenBefore("w-[124px] bg-[#a1b2c3]")).toBe(false);
    expect(merger.seenBefore("w-[123px] bg-[#a1b2c4]")).toBe(false);
    expect(merger.seenBefore("w-[123px] bg-[#a1b2c3]")).toBe(true);
  });

  test("a stream of unique strings is never admitted and leaves hot strings correct", () => {
    const merger = createMerger();
    const hot = "inline-flex items-center px-2 px-4";

    // admitted: second sighting
    expect(merger.mergeString(hot)).toBe("inline-flex items-center px-4");
    expect(merger.mergeString(hot)).toBe("inline-flex items-center px-4");

    // SSR-style traffic: every string is new, none may be admitted
    for (let i = 0; i < 20000; i++) {
      const unique = `w-[${i}px] h-[${i * 3}px] px-${i} px-2`;

      expect(merger.seenBefore(unique)).toBe(false);
      expect(merger.mergeString(unique)).toBe(`w-[${i}px] h-[${i * 3}px] px-2`);
    }

    expect(merger.mergeString(hot)).toBe("inline-flex items-center px-4");
    expect(merger.seenBefore(hot)).toBe(true);
  });

  test("first sighting of a fresh join is merged uncached and correct", () => {
    const button = tv({base: "px-2", variants: {size: {lg: "px-6"}}});

    for (let i = 0; i < 5; i++) {
      expect(button({size: "lg", className: `w-[${i}px]`})).toBe(`px-6 w-[${i}px]`);
    }
    expect(button({size: "lg", className: "w-[0px]"})).toBe("px-6 w-[0px]");
    expect(button({size: "lg", className: "w-[0px]"})).toBe("px-6 w-[0px]");
  });
});

describe("merge engine cache limits", () => {
  test("whole-string cache stays correct past its limit", () => {
    const merger = engine;

    for (let i = 0; i < 600; i++) {
      expect(merger.mergeString(`px-${i} px-${i + 1}`)).toBe(`px-${i + 1}`);
    }

    expect(merger.mergeString("px-0 px-1")).toBe("px-1");
  });

  test("descriptor cache and conflict-key registry stay correct across resets", () => {
    const merger = engine;

    for (let i = 0; i < 8000; i++) {
      expect(merger.mergeString(`[&_.a${i}]:px-2 [&_.a${i}]:px-4`)).toBe(`[&_.a${i}]:px-4`);
    }

    expect(merger.mergeString("[&_.a0]:px-2 [&_.a0]:px-4")).toBe("[&_.a0]:px-4");
    expect(merger.mergeString("px-2 px-4")).toBe("px-4");
  });
});
