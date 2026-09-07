import type {DebugTrace} from "../internal/debug/trace";

import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";

import {createTV, tv} from "../index";
import {countTreeOverrides} from "../internal/debug/format";
import {diffOverriddenClasses} from "../internal/debug/trace";
import {tv as liteTV} from "../lite";

type ConsoleSpies = {
  log: ReturnType<typeof vi.spyOn>;
  group: ReturnType<typeof vi.spyOn>;
  groupCollapsed: ReturnType<typeof vi.spyOn>;
  groupEnd: ReturnType<typeof vi.spyOn>;
};

const spyOnConsole = (): ConsoleSpies => ({
  log: vi.spyOn(console, "log").mockImplementation(() => {}),
  group: vi.spyOn(console, "group").mockImplementation(() => {}),
  groupCollapsed: vi.spyOn(console, "groupCollapsed").mockImplementation(() => {}),
  groupEnd: vi.spyOn(console, "groupEnd").mockImplementation(() => {}),
});

// Everything printed by one invocation, headers included, as plain text.
const printed = (spies: ConsoleSpies): string =>
  [...spies.groupCollapsed.mock.calls, ...spies.log.mock.calls]
    .map((call) => call.map(String).join(" "))
    .join("\n");

// Group headers in print order, as plain text (format markers stripped).
const headers = (spies: ConsoleSpies): string[] =>
  spies.groupCollapsed.mock.calls.map((call: any[]) => String(call[0]).replace(/%c/g, "").trim());

// Rows printed as `label` followed by the live value passed to the console.
const rowsOf = (spies: ConsoleSpies): Map<string, unknown> => {
  const rows = new Map<string, unknown>();

  for (const call of spies.log.mock.calls) {
    const label = String(call[0])
      .replace(/^\u001B\[\d+m/, "")
      .replace(/%c/g, "")
      .trim();
    const value = call.at(-1);

    if (label) rows.set(label, value);
  }

  return rows;
};

let spies: ConsoleSpies;

beforeEach(() => {
  spies = spyOnConsole();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("debug config", () => {
  test("leaves the recipe untouched when debug is off", () => {
    const button = tv({base: "px-2"});

    expect(button()).toBe("px-2");
    expect(spies.groupCollapsed).not.toHaveBeenCalled();
  });

  test("accepts debug: false explicitly", () => {
    const button = tv({base: "px-2"}, {debug: false});

    expect(button()).toBe("px-2");
    expect(spies.groupCollapsed).not.toHaveBeenCalled();
  });

  test("keeps ordinary call syntax and result unchanged when debug is on", () => {
    const button = tv(
      {
        base: "inline-flex px-2",
        variants: {color: {primary: "bg-blue-500", danger: "bg-red-500"}},
      },
      {debug: true},
    );

    // Node is not a browser, so logging stays silent; the result is untouched.
    expect(button({color: "primary"})).toBe("inline-flex px-2 bg-blue-500");
    expect(spies.groupCollapsed).not.toHaveBeenCalled();
  });

  test("createTV keeps debug across per-call configs", () => {
    const configured = createTV({debug: true});

    expect(configured({base: "px-2"})({})).toBe("px-2");
    expect(configured({base: "px-2"}, {twMerge: false})({})).toBe("px-2");
  });

  test("rejects non-boolean debug values", () => {
    // @ts-expect-error debug must be a boolean
    tv({base: "px-2"}, {debug: {console: false}});
    // @ts-expect-error debug must be a boolean
    tv({base: "px-2"}, {debug: "yes"});
  });
});

describe("debug data (internal, via printed rows)", () => {
  /*
   * The browser probe is read once at module scope, so a browser has to be
   * simulated before a fresh import rather than stubbed mid-flight.
   */
  const loadBrowser = async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});
    vi.resetModules();

    return import("../index");
  };

  test("reports each resolution stage for a variants recipe", async () => {
    const {tv: browserTV} = await loadBrowser();
    const button = browserTV(
      {
        base: "inline-flex px-2",
        variants: {
          color: {primary: "bg-blue-500 text-white", danger: "bg-red-500"},
          size: {sm: "text-sm", lg: "text-lg"},
        },
        compoundVariants: [{color: "primary", size: "lg", class: "font-bold"}],
        defaultVariants: {size: "sm"},
      },
      {debug: true},
    );

    const output = button({color: "primary", size: "lg"});

    const rows = rowsOf(spies);

    expect(rows.get("props")).toEqual({color: "primary", size: "lg"});
    expect(rows.get("base")).toBe("inline-flex px-2");
    expect(rows.get("variants")).toEqual({color: "bg-blue-500 text-white", size: "text-lg"});
    expect(rows.get("compounds")).toEqual(["font-bold"]);
    expect(rows.get("result")).toBe(output);
  });

  test("props carry defaultVariants that the caller did not pass", async () => {
    const {tv: browserTV} = await loadBrowser();
    const button = browserTV(
      {
        base: "px-2",
        variants: {size: {sm: "text-sm", lg: "text-lg"}},
        defaultVariants: {size: "sm"},
      },
      {debug: true},
    );

    button();

    expect(rowsOf(spies).get("props")).toEqual({size: "sm"});

    spies.log.mockClear();

    button({size: "lg"});

    expect(rowsOf(spies).get("props")).toEqual({size: "lg"});
  });

  test("omits variant axes that contributed nothing", async () => {
    const {tv: browserTV} = await loadBrowser();
    const button = browserTV(
      {base: "px-2", variants: {color: {primary: "bg-blue-500"}, size: {sm: ""}}},
      {debug: true},
    );

    button({color: "primary", size: "sm"});

    expect(rowsOf(spies).get("variants")).toEqual({color: "bg-blue-500"});
  });

  test("collects the class override passed at the call site", async () => {
    const {tv: browserTV} = await loadBrowser();
    const button = browserTV({base: "px-2"}, {debug: true});

    button({class: "px-8"});

    const rows = rowsOf(spies);

    expect(rows.get("overridden")).toEqual(["px-2"]);
    expect(rows.get("result")).toBe("px-8");
  });

  test("reports classes tailwind-merge discarded", async () => {
    const {tv: browserTV} = await loadBrowser();
    const button = browserTV(
      {base: "bg-red-500 px-2", variants: {color: {primary: "bg-blue-500"}}},
      {debug: true},
    );

    button({color: "primary"});

    expect(rowsOf(spies).get("overridden")).toEqual(["bg-red-500"]);
  });

  test("shows no overrides when merging is disabled", async () => {
    const {tv: browserTV} = await loadBrowser();
    const button = browserTV({base: "bg-red-500 bg-blue-500"}, {twMerge: false, debug: true});

    button();

    expect(rowsOf(spies).has("overridden")).toBe(false);
    expect(rowsOf(spies).get("result")).toBe("bg-red-500 bg-blue-500");
  });

  test("treats a repeated class as kept, not overridden", async () => {
    const {tv: browserTV} = await loadBrowser();
    const button = browserTV({base: "p-4 p-4"}, {debug: true});

    button();

    expect(rowsOf(spies).has("overridden")).toBe(false);
    expect(rowsOf(spies).get("result")).toBe("p-4");
  });

  test("ignores falsy and whitespace-only class values", async () => {
    const {tv: browserTV} = await loadBrowser();
    const button = browserTV(
      {base: ["", "  ", "bg-red-500   p-4", undefined, false, null]},
      {debug: true},
    );

    button();

    const rows = rowsOf(spies);

    expect(rows.get("base")).toBe("bg-red-500 p-4");
    expect(rows.has("overridden")).toBe(false);
  });

  test("diffs raw against result directly", () => {
    expect(diffOverriddenClasses("", "")).toEqual([]);
    expect(diffOverriddenClasses("bg-red-500   p-4", "p-4")).toEqual(["bg-red-500"]);
    expect(diffOverriddenClasses("  p-2  p-4  ", "p-4")).toEqual(["p-2"]);
    expect(diffOverriddenClasses("p-2 p-2 p-4", "p-4")).toEqual(["p-2"]);
    expect(diffOverriddenClasses("p-4", "")).toEqual(["p-4"]);
    expect(diffOverriddenClasses("", "p-4")).toEqual([]);
  });
});

describe("slots", () => {
  const loadBrowser = async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});
    vi.resetModules();

    return import("../index");
  };

  const createCard = (browserTV: typeof tv) =>
    browserTV(
      {
        slots: {base: "flex p-2", title: "font-medium", icon: "size-4"},
        variants: {
          size: {sm: {title: "text-sm", icon: "size-3"}, lg: {title: "text-lg"}},
          bordered: {true: {base: "border"}},
        },
        compoundSlots: [{slots: ["title", "icon"], size: "sm", class: "opacity-80"}],
        defaultVariants: {size: "sm"},
      },
      {debug: true},
    );

  test("mirrors the base slot and lists every slot under the root header", async () => {
    const {tv: browserTV} = await loadBrowser();
    const card = createCard(browserTV);

    card({size: "lg"});

    expect(headers(spies)).toEqual([
      "tv  ✓ no overrides",
      "slot · base  ✓ no overrides",
      "slot · title  ✓ no overrides",
      "slot · icon  ✓ no overrides",
    ]);

    const text = printed(spies);

    expect(text).toContain("flex p-2"); // base slot classes
    expect(text).toContain("font-medium"); // title base
    expect(text).toContain("text-lg"); // title variant
    expect(text).toContain("size-4"); // icon base
  });

  test("tracks compoundSlots per slot", async () => {
    const {tv: browserTV} = await loadBrowser();
    const card = createCard(browserTV);

    card({size: "sm"});

    const text = printed(spies);

    expect(text).toContain("opacity-80");
    expect(text).toContain("size-3");
  });

  test("slot results are unchanged by the debug wrapper", async () => {
    const {tv: browserTV} = await loadBrowser();
    const debugged = createCard(browserTV);
    const plain = browserTV({
      slots: {base: "flex p-2", title: "font-medium", icon: "size-4"},
      variants: {
        size: {sm: {title: "text-sm", icon: "size-3"}, lg: {title: "text-lg"}},
        bordered: {true: {base: "border"}},
      },
      compoundSlots: [{slots: ["title", "icon"], size: "sm", class: "opacity-80"}],
      defaultVariants: {size: "sm"},
    });
    const props = {size: "lg"} as const;

    expect(Object.keys(debugged(props))).toEqual(Object.keys(plain(props)));
    for (const key of Object.keys(plain(props)) as Array<"base" | "title" | "icon">) {
      expect(debugged(props)[key]()).toBe(plain(props)[key]());
    }
  });

  test("logs a slot call that carries its own props", async () => {
    const {tv: browserTV} = await loadBrowser();
    const card = createCard(browserTV);

    const slots = card({size: "sm"});

    spies.groupCollapsed.mockClear();
    spies.log.mockClear();

    expect(slots.icon()).toBe("size-3 opacity-80");
    expect(spies.groupCollapsed).not.toHaveBeenCalled();

    spies.groupCollapsed.mockClear();

    expect(slots.icon({class: "size-8"})).toBe("opacity-80 size-8");
    expect(spies.groupCollapsed).toHaveBeenCalledTimes(1);
    expect(headers(spies)[0]).toBe("slot · icon  ⚠ 2 overrides");
    expect(rowsOf(spies).get("overridden")).toEqual(["size-4", "size-3"]);
  });
});

describe("console output", () => {
  const loadBrowser = async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});
    vi.resetModules();

    return import("../index");
  };

  test("prints nothing in Node by default", () => {
    tv({base: "px-2"}, {debug: true})();

    expect(spies.groupCollapsed).not.toHaveBeenCalled();
    expect(spies.log).not.toHaveBeenCalled();
  });

  test("logs a flat invocation in the browser", async () => {
    const {tv: browserTV} = await loadBrowser();

    browserTV({base: "bg-red-500 px-2"}, {debug: true})();

    expect(spies.groupCollapsed).toHaveBeenCalledTimes(1);
    expect(headers(spies)[0]).toBe("tv  ✓ no overrides");
  });

  test("flags overrides in the header", async () => {
    const {tv: browserTV} = await loadBrowser();
    const button = browserTV(
      {base: "bg-red-500", variants: {color: {primary: "bg-blue-500"}}},
      {debug: true},
    );

    button({color: "primary"});

    expect(headers(spies)[0]).toContain("⚠ 1 override");
    expect(printed(spies)).toContain("bg-red-500");
  });

  test("keeps every group collapsed by default", async () => {
    const {tv: browserTV} = await loadBrowser();
    const card = browserTV({slots: {base: "p-2", icon: "size-4"}}, {debug: true});

    card({});

    expect(spies.groupCollapsed).toHaveBeenCalledTimes(3);
    expect(spies.group).not.toHaveBeenCalled();
    expect(spies.groupEnd).toHaveBeenCalledTimes(3);
  });

  test("root header aggregates overrides across every slot", async () => {
    const {tv: browserTV} = await loadBrowser();
    const card = browserTV(
      {slots: {base: "p-2 p-4", icon: "size-4 size-8 text-sm text-lg", label: "font-medium"}},
      {debug: true},
    );

    card({});

    const headerFor = (title: string) => headers(spies).find((line) => line.includes(title)) ?? "";

    expect(headers(spies)[0]).toBe("tv  ⚠ 3 overrides");
    expect(headerFor("slot · base")).toContain("⚠ 1 override");
    expect(headerFor("slot · icon")).toContain("⚠ 2 overrides");
    expect(headerFor("slot · label")).toContain("✓ no overrides");
  });

  test("counts the trace tree directly", () => {
    const makeTrace = (overridden: string[], slots?: Record<string, DebugTrace>): DebugTrace => ({
      props: {},
      base: "",
      variants: {},
      compounds: [],
      overridden,
      result: "",
      ...(slots ? {slots} : {}),
    });

    expect(countTreeOverrides(makeTrace([]))).toBe(0);
    expect(countTreeOverrides(makeTrace(["a", "b"]))).toBe(2);

    // The root of a slot recipe mirrors its base slot; slots are the source of
    // truth, so the mirrored root count must not be added on top.
    const tree = makeTrace(["a"], {
      base: makeTrace(["a"]),
      icon: makeTrace(["b", "c"]),
      label: makeTrace([]),
    });

    expect(countTreeOverrides(tree)).toBe(3);
  });
});

describe("production isolation", () => {
  /*
   * The implementation is picked once at module scope, which is what lets a
   * bundler fold the branch away, so production has to be loaded rather than
   * stubbed mid-flight.
   */
  const loadProduction = async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");

    return import("../index");
  };

  test("debug is a no-op in production", async () => {
    const {tv} = await loadProduction();
    const button = tv({base: "bg-red-500 bg-blue-500"}, {debug: true});

    expect(button()).toBe("bg-blue-500");
    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.groupCollapsed).not.toHaveBeenCalled();
  });

  test("loads safely in an environment without a global process", async () => {
    vi.resetModules();
    vi.stubGlobal("process", undefined);

    await expect(import("../index")).resolves.toBeDefined();

    const {tv: processlessTV} = await import("../index");

    expect(processlessTV({base: "px-2"})({})).toBe("px-2");
  });
});

describe("lite entrypoint", () => {
  test("takes no debug config and never logs", () => {
    const button = liteTV({
      base: "px-2 px-4",
      variants: {color: {primary: "bg-blue-500"}},
    });

    expect(button({color: "primary"})).toBe("px-2 px-4 bg-blue-500");
    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.groupCollapsed).not.toHaveBeenCalled();
  });
});
