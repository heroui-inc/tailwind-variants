import {beforeAll, describe, expect, test, vi} from "vitest";

/*
 * The engine detection in tw-merge keys off Error object shape at module load:
 * V8 errors have neither `line` (JSC) nor `lineNumber` (SpiderMonkey). Stubbing
 * Error before a fresh import flips IS_V8 off, so these tests execute the
 * fallback paths that never run on Node otherwise. Expectations mirror the
 * V8-path suites for parity.
 */

type IndexModule = typeof import("../index");

let runtime: IndexModule;
let stubActiveDuringImport = false;

beforeAll(async () => {
  class SpiderMonkeyLikeError extends Error {
    lineNumber = 0;
  }

  vi.stubGlobal("Error", SpiderMonkeyLikeError);
  vi.resetModules();
  stubActiveDuringImport = "lineNumber" in new Error("probe");
  runtime = await import("../index");
  vi.unstubAllGlobals();
});

describe("non-V8 fallback parity", () => {
  test("the engine stub was active while the module initialized", () => {
    expect(stubActiveDuringImport).toBe(true);
  });

  test("cn handles falsy and empty inputs", () => {
    const {cn} = runtime;

    expect(cn()).toBe("");
    expect(cn("", null, undefined, false)).toBe("");
  });

  test("cn merges single and multi-argument strings", () => {
    const {cn} = runtime;

    expect(cn("px-2")).toBe("px-2");
    expect(cn("px-2 px-4")).toBe("px-4");
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("px-2", null, "px-4", undefined, "font-bold")).toBe("px-4 font-bold");
  });

  test("cn handles non-string arguments", () => {
    const {cn} = runtime;

    expect(cn("px-2", ["px-4", {hidden: true, block: false}])).toBe("px-4 hidden");
    expect(cn(["flex", ["items-center"]], "gap-2")).toBe("flex items-center gap-2");
  });

  test("cn merges whitespace-separated classes", () => {
    const {cn} = runtime;

    expect(cn("px-2\npx-4")).toBe("px-4");
  });

  test("cnMerge merges with default and explicit configs", () => {
    const {cnMerge} = runtime;

    expect(cnMerge("px-2", "px-4")()).toBe("px-4");
    expect(cnMerge("px-2", null, "px-4")()).toBe("px-4");
    expect(cnMerge("px-2", "px-4")({twMerge: false})).toBe("px-2 px-4");
    expect(cnMerge("px-2", "px-4")({twMerge: true})).toBe("px-4");
  });

  test("repeated calls stay stable without the argument cache", () => {
    const {cn, cnMerge} = runtime;

    for (let i = 0; i < 70; i++) {
      expect(cn("px-2", `m-${i}`)).toBe(`px-2 m-${i}`);
      expect(cnMerge("px-2", `m-${i}`)()).toBe(`px-2 m-${i}`);
    }

    expect(cn("px-2", "m-0")).toBe("px-2 m-0");
  });

  test("tv works end-to-end on the fallback paths", () => {
    const {tv} = runtime;
    const button = tv({
      base: "font-medium px-2 px-4",
      variants: {
        color: {red: "text-red-500", blue: "text-blue-500"},
      },
    });

    expect(button({color: "red"})).toBe("font-medium px-4 text-red-500");
    expect(button({color: "blue", class: "px-6"})).toBe("font-medium text-blue-500 px-6");
  });
});
