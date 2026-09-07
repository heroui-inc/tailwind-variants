import {afterEach, describe, expect, test} from "vitest";

import * as configEntry from "../config-entry";
import {
  cnMerge as cnMergeCustom,
  createTV as createCustomTV,
  createTwMerge,
  tv as customTV,
} from "../config-entry";
import defaultClsx, * as defaultEntry from "../index";
import {cn, cnMerge, cx as cxFull, tv} from "../index";
import {state} from "../internal/state.js";
import liteClsx, * as liteEntry from "../lite";
import {cn as cnLite, cx as cxLite} from "../lite";
import mergeClsx, * as mergeEntry from "../merge-entry";
import {cx as cxUtils} from "../utils";

afterEach(() => {
  state.reset();
});

const cxVariants = [
  {name: "main index", cx: cxFull},
  {name: "lite", cx: cxLite},
  {name: "utils", cx: cxUtils},
];

describe("cnLite", () => {
  test("joins strings and ignores falsy values", () => {
    expect(cnLite("text-xl", false && "font-bold", "text-center")()).toBe("text-xl text-center");
    expect(cnLite("text-xl", undefined, null, 0, "")()).toBe("text-xl 0");
  });

  test("joins arrays of class names", () => {
    expect(cnLite(["px-4", "py-2"], "bg-blue-500")()).toBe("px-4 py-2 bg-blue-500");
    expect(cnLite(["px-4", false, ["hover:bg-red-500", null, "rounded-lg"]])()).toBe(
      "px-4 hover:bg-red-500 rounded-lg",
    );
  });

  test("handles nested arrays", () => {
    expect(
      cnLite(["px-4", ["py-2", ["bg-blue-500", ["rounded-lg", false, ["shadow-md"]]]]])(),
    ).toBe("px-4 py-2 bg-blue-500 rounded-lg shadow-md");
  });

  test("joins objects with truthy values as keys", () => {
    expect(cnLite({"text-sm": true, "font-bold": false, "bg-green-200": 1, "m-0": 0})()).toBe(
      "text-sm bg-green-200",
    );
  });

  test("handles mixed class value arguments", () => {
    expect(
      cnLite(
        "text-lg",
        ["px-3", {"hover:bg-yellow-300": true, "focus:outline-none": false}],
        {"rounded-md": true, "shadow-md": null},
        "leading-tight",
      )(),
    ).toBe("text-lg px-3 hover:bg-yellow-300 rounded-md leading-tight");
  });

  test("handles numbers and bigint", () => {
    expect(cnLite(123, "text-base", 0n, {border: true})()).toBe("123 text-base 0 border");
  });

  test("returns an empty string for no input", () => {
    expect(cnLite()()).toBe("");
  });

  test("returns '0' for zero and ignores other falsy values", () => {
    expect(cnLite(false, null, undefined, "", 0)()).toBe("0");
  });

  test("normalizes template strings with irregular whitespace", () => {
    const input = `
      px-4
      py-2

      bg-blue-500
        rounded-lg
    `;

    expect(cnLite(input)()).toBe("px-4 py-2 bg-blue-500 rounded-lg");

    expect(
      cnLite(
        ` text-center
          font-semibold  `,
        ["text-sm", `   uppercase   `],
        {"shadow-lg": true, "opacity-50": false},
      )(),
    ).toBe("text-center font-semibold text-sm uppercase shadow-lg");
  });

  test("handles empty and falsy values", () => {
    expect(cnLite("", null, undefined, false, NaN, 0, "0")()).toBe("0 0");
  });
});

describe("cn", () => {
  test("merges conflicting Tailwind classes by default", () => {
    const result = cn("px-2", "px-4", "py-2");

    expect(result).toBe("px-4 py-2");
  });

  test("merges text color classes by default", () => {
    const result = cn("text-red-500", "text-blue-500");

    expect(result).toBe("text-blue-500");
  });

  test("merges background color classes by default", () => {
    const result = cn("bg-red-500", "bg-blue-500");

    expect(result).toBe("bg-blue-500");
  });

  test("merges multiple conflicting classes", () => {
    const result = cn("px-2 py-1 text-sm", "px-4 py-2 text-lg");

    expect(result).toBe("px-4 py-2 text-lg");
  });

  test("handles non-conflicting classes", () => {
    const result = cn("px-2", "py-2", "text-sm");

    expect(result).toBe("px-2 py-2 text-sm");
  });

  test("returns an empty string when no classes provided", () => {
    const result = cn();

    expect(result).toBe("");
  });

  test("handles arrays with tailwind-merge", () => {
    const result = cn(["px-2", "px-4"], "py-2");

    expect(result).toBe("px-4 py-2");
  });

  test("handles objects with tailwind-merge", () => {
    const result = cn({"px-2": true, "px-4": true, "py-2": true});

    expect(result).toBe("px-4 py-2");
  });

  test("handles complex className with conditional object classes", () => {
    const selectedZoom: string = "a";
    const key: string = "b";

    const result = cn(
      "text-foreground ease-in-out-quad absolute left-1/2 top-1/2 origin-center -translate-x-1/2 -translate-y-1/2 scale-75 text-[21px] font-medium opacity-0 transition-[scale,opacity] duration-[300ms] ease-[cubic-bezier(0.33,1,0.68,1)] data-[selected=true]:scale-100 data-[selected=true]:opacity-100 data-[selected=true]:delay-200",
      {
        "sr-only": selectedZoom !== key,
      },
    );

    expect(result).toContain("text-foreground");
    expect(result).toContain("sr-only");
    expect(typeof result).toBe("string");
  });

  test("handles conditional object classes when condition is false", () => {
    const selectedZoom: string = "a";
    const key: string = "a";

    const result = cn("text-xl font-bold", {
      "sr-only": selectedZoom !== key,
    });

    expect(result).toBe("text-xl font-bold");
    expect(result).not.toContain("sr-only");
  });
});

describe("cnMerge", () => {
  test("merges conflicting Tailwind classes when twMerge is true", () => {
    const result = cnMerge("px-2", "px-4", "py-2")({twMerge: true});

    expect(result).toBe("px-4 py-2");
  });

  test("does not merge classes when twMerge is false", () => {
    const result = cnMerge("px-2", "px-4", "py-2")({twMerge: false});

    expect(result).toBe("px-2 px-4 py-2");
  });

  test("merges text color classes", () => {
    const result = cnMerge("text-red-500", "text-blue-500")({twMerge: true});

    expect(result).toBe("text-blue-500");
  });

  test("merges background color classes", () => {
    const result = cnMerge("bg-red-500", "bg-blue-500")({twMerge: true});

    expect(result).toBe("bg-blue-500");
  });

  test("merges multiple conflicting classes", () => {
    const result = cnMerge("px-2 py-1 text-sm", "px-4 py-2 text-lg")({twMerge: true});

    expect(result).toBe("px-4 py-2 text-lg");
  });

  test("handles non-conflicting classes", () => {
    const result = cnMerge("px-2", "py-2", "text-sm")({twMerge: true});

    expect(result).toBe("px-2 py-2 text-sm");
  });

  test("returns an empty string when no classes provided", () => {
    const result = cnMerge()({twMerge: true});

    expect(result).toBe("");
  });

  test("handles arrays with tailwind-merge", () => {
    const result = cnMerge(["px-2", "px-4"], "py-2")({twMerge: true});

    expect(result).toBe("px-4 py-2");
  });

  test("handles objects with tailwind-merge", () => {
    const result = cnMerge({"px-2": true, "px-4": true, "py-2": true})({twMerge: true});

    expect(result).toBe("px-4 py-2");
  });

  test("merges classes by default when no config is provided", () => {
    const result = cnMerge("px-2", "px-4", "py-2")();

    expect(result).toBe("px-4 py-2");
  });

  test("merges classes when config is undefined", () => {
    const result = cnMerge("px-2", "px-4", "py-2")(undefined);

    expect(result).toBe("px-4 py-2");
  });

  test("merges classes when config is empty object (defaults to true)", () => {
    const result = cnMerge("px-2", "px-4", "py-2")({});

    expect(result).toBe("px-4 py-2");
  });

  test("does not merge classes when twMerge is explicitly false", () => {
    const result = cnMerge("px-2", "px-4", "py-2")({twMerge: false});

    expect(result).toBe("px-2 px-4 py-2");
  });

  test("merges classes when twMerge is explicitly true", () => {
    const result = cnMerge("px-2", "px-4", "py-2")({twMerge: true});

    expect(result).toBe("px-4 py-2");
  });

  test("handles complex className with conditional object classes", () => {
    const selectedZoom: string = "a";
    const key: string = "b";

    const result = cnMerge(
      "text-foreground ease-in-out-quad absolute left-1/2 top-1/2 origin-center -translate-x-1/2 -translate-y-1/2 scale-75 text-[21px] font-medium opacity-0 transition-[scale,opacity] duration-[300ms] ease-[cubic-bezier(0.33,1,0.68,1)] data-[selected=true]:scale-100 data-[selected=true]:opacity-100 data-[selected=true]:delay-200",
      {
        "sr-only": selectedZoom !== key,
      },
    )();

    expect(result).toContain("text-foreground");
    expect(result).toContain("sr-only");
    expect(typeof result).toBe("string");
  });
});

describe.each(cxVariants)("cx ($name export)", ({cx}) => {
  test("joins strings and ignores falsy values", () => {
    expect(cx("text-xl", false && "font-bold", "text-center")).toBe("text-xl text-center");
    expect(cx("text-xl", undefined, null, 0, "")).toBe("text-xl 0");
  });

  test("joins arrays of class names", () => {
    expect(cx(["px-4", "py-2"], "bg-blue-500")).toBe("px-4 py-2 bg-blue-500");
    expect(cx(["px-4", false, ["hover:bg-red-500", null, "rounded-lg"]])).toBe(
      "px-4 hover:bg-red-500 rounded-lg",
    );
  });

  test("handles nested arrays", () => {
    expect(cx(["px-4", ["py-2", ["bg-blue-500", ["rounded-lg", false, ["shadow-md"]]]]])).toBe(
      "px-4 py-2 bg-blue-500 rounded-lg shadow-md",
    );
  });

  test("joins objects with truthy values as keys", () => {
    expect(cx({"text-sm": true, "font-bold": false, "bg-green-200": 1, "m-0": 0})).toBe(
      "text-sm bg-green-200",
    );
  });

  test("handles mixed class value arguments", () => {
    expect(
      cx(
        "text-lg",
        ["px-3", {"hover:bg-yellow-300": true, "focus:outline-none": false}],
        {"rounded-md": true, "shadow-md": null},
        "leading-tight",
      ),
    ).toBe("text-lg px-3 hover:bg-yellow-300 rounded-md leading-tight");
  });

  test("handles numbers and bigint", () => {
    expect(cx(123, "text-base", 0n, {border: true})).toBe("123 text-base 0 border");
  });

  test("returns an empty string for no input", () => {
    expect(cx()).toBe("");
  });

  test("returns '0' for zero and ignores other falsy values", () => {
    expect(cx(false, null, undefined, "", 0)).toBe("0");
  });

  test("normalizes template strings with irregular whitespace", () => {
    const input = `
      px-4
      py-2

      bg-blue-500
        rounded-lg
    `;

    expect(cx(input)).toBe("px-4 py-2 bg-blue-500 rounded-lg");

    expect(
      cx(
        ` text-center
          font-semibold  `,
        ["text-sm", `   uppercase   `],
        {"shadow-lg": true, "opacity-50": false},
      ),
    ).toBe("text-center font-semibold text-sm uppercase shadow-lg");
  });

  test("handles empty and falsy values", () => {
    expect(cx("", null, undefined, false, NaN, 0, "0")).toBe("0 0");
  });

  test("does not merge conflicting classes (simple concatenation)", () => {
    expect(cx("px-2", "px-4", "py-2")).toBe("px-2 px-4 py-2");
  });

  test("handles conflicting classes without merging", () => {
    expect(cx("text-red-500", "text-blue-500")).toBe("text-red-500 text-blue-500");
  });
});

describe("cn / cnMerge with built-in merger", () => {
  test("cn merges conflicting classes with default config", () => {
    expect(cn("px-2 px-4", "text-sm text-lg")).toBe("px-4 text-lg");
  });

  test("cn arg-sequence cache returns stable results for repeated multi-arg calls", () => {
    const a = "px-2";
    const b = "px-4";
    const c = "py-2";

    expect(cn(a, b, c)).toBe("px-4 py-2");
    expect(cn(a, b, c)).toBe("px-4 py-2");
    expect(cn(a, false, b, null, c)).toBe("px-4 py-2");
  });

  test("cn with object args does not poison string arg-sequence cache", () => {
    expect(cn("px-2", {"px-4": true, "py-2": true})).toBe("px-4 py-2");
    expect(cn("px-2", "px-4", "py-2")).toBe("px-4 py-2");
  });

  test("cnMerge applies twMergeConfig on the call", () => {
    const run = cnMergeCustom("text-foreground text-24-regular");

    expect(run()).toBe("text-24-regular");

    expect(
      run({
        twMergeConfig: {
          extend: {
            classGroups: {
              "font-size": ["text-24-regular", "text-24-medium"],
            },
          },
        },
      }),
    ).toBe("text-foreground text-24-regular");
  });

  test("cnMerge accepts legacy flat classGroups without extend wrapper", () => {
    expect(
      cnMergeCustom("text-foreground text-24-regular")({
        twMergeConfig: {
          classGroups: {
            "font-size": ["text-24-regular", "text-24-medium"],
          },
        },
      }),
    ).toBe("text-foreground text-24-regular");
  });

  test("cn stays on default merger after cnMerge with custom config", () => {
    expect(
      cnMergeCustom("text-foreground text-24-regular")({
        twMergeConfig: {
          extend: {
            classGroups: {
              "font-size": ["text-24-regular"],
            },
          },
        },
      }),
    ).toBe("text-foreground text-24-regular");

    // Default path still treats custom font-size as conflicting with text-color.
    expect(cn("text-foreground text-24-regular")).toBe("text-24-regular");
    expect(cn("px-2 px-4")).toBe("px-4");
  });

  test("cnMerge respects twMerge: false", () => {
    expect(cnMergeCustom("px-2 px-4")({twMerge: false})).toBe("px-2 px-4");
  });

  test("tv twMergeConfig matches cnMerge extend shape", () => {
    const button = customTV(
      {
        base: "text-foreground text-24-regular",
      },
      {
        twMergeConfig: {
          extend: {
            classGroups: {
              "font-size": ["text-24-regular"],
            },
          },
        },
      },
    );

    expect(button()).toBe("text-foreground text-24-regular");
  });

  test("cnMerge applies override via twMergeConfig", () => {
    expect(
      cnMergeCustom("text-24-regular text-sm")({
        twMergeConfig: {
          override: {
            classGroups: {
              "font-size": ["text-24-regular"],
            },
          },
        },
      }),
    ).toBe("text-24-regular text-sm");
  });

  test("cnMerge applies twMergeConfig when twMerge is explicitly true", () => {
    expect(
      cnMergeCustom("text-foreground text-24-regular")({
        twMerge: true,
        twMergeConfig: {
          extend: {
            classGroups: {
              "font-size": ["text-24-regular"],
            },
          },
        },
      }),
    ).toBe("text-foreground text-24-regular");
  });

  test("createTV factory twMergeConfig is applied to components", () => {
    const tvFactory = createCustomTV({
      twMergeConfig: {
        extend: {
          classGroups: {
            "font-size": ["text-24-regular"],
          },
        },
      },
    });
    const button = tvFactory({base: "text-foreground text-24-regular"});

    expect(button()).toBe("text-foreground text-24-regular");
  });

  test("createTV twMergeConfig prefix merges prefixed classes", () => {
    const tvFactory = createCustomTV({twMergeConfig: {prefix: "tw"}});
    const button = tvFactory({base: "tw:px-2 tw:px-4"});

    expect(button()).toBe("tw:px-4");
  });

  test("extend.conflictingClassGroups forces unrelated tokens to conflict", () => {
    const config = {
      extend: {
        classGroups: {
          foo: ["foo-a", "foo-b"],
          bar: ["bar-a", "bar-b"],
        },
        conflictingClassGroups: {
          foo: ["bar"],
          bar: ["foo"],
        },
      },
    } as const;
    const merge = createTwMerge(config);

    // Rightmost group wins when both declare each other as conflicts.
    expect(merge("foo-a bar-a")).toBe("bar-a");
    expect(merge("bar-a foo-b")).toBe("foo-b");
  });

  test("state.reset clears configured merger so a later config takes effect", () => {
    expect(
      cnMergeCustom("text-foreground text-24-regular")({
        twMergeConfig: {
          extend: {classGroups: {"font-size": ["text-24-regular"]}},
        },
      }),
    ).toBe("text-foreground text-24-regular");

    state.reset();

    expect(cn("text-foreground text-24-regular")).toBe("text-24-regular");
    expect(
      cnMergeCustom("text-foreground text-24-medium")({
        twMergeConfig: {
          extend: {classGroups: {"font-size": ["text-24-medium"]}},
        },
      }),
    ).toBe("text-foreground text-24-medium");
  });

  test("lite cn never merges conflicting classes", () => {
    expect(cnLite("px-2", "px-4")()).toBe("px-2 px-4");
    expect(cnLite("text-red-500", "text-blue-500")()).toBe("text-red-500 text-blue-500");
  });

  test("cn handles single-token and empty-ish inputs", () => {
    expect(cn("px-2")).toBe("px-2");
    expect(cn()).toBe("");
    expect(cn(false, null, undefined, "")).toBe("");
    expect(cn("px-2", false, "px-4")).toBe("px-4");
  });
});

describe("whitespace-separated class merging", () => {
  test("merges conflicts across newlines and tabs", () => {
    expect(cn("px-2\npx-4")).toBe("px-4");
    expect(cn("px-2\tpx-4")).toBe("px-4");
    expect(cn("px-2\r\npx-4")).toBe("px-4");
  });

  test("treats tab-separated tokens as multi-token (fast path only checks spaces)", () => {
    expect(cn("px-2\tpx-4")).toBe("px-4");
    expect(cn("px-2\vpx-4")).toBe("px-4");
  });

  test("returns single tokens untouched even with no space present", () => {
    expect(cn("px-2")).toBe("px-2");
    expect(cn("[mask-type:luminance]")).toBe("[mask-type:luminance]");
  });

  test("merges multi-space-separated tokens", () => {
    expect(cn("px-2  px-4")).toBe("px-4");
    expect(cn("text-sm   text-lg")).toBe("text-lg");
  });

  test("normalizes multi-line template strings without conflicts", () => {
    expect(
      cn(`flex
        items-center
        gap-2`),
    ).toBe("flex items-center gap-2");
  });

  test("keeps single tokens untouched and trims stray whitespace", () => {
    expect(cn("px-2")).toBe("px-2");
    expect(cn("px-2\n")).toBe("px-2");
    expect(cn("  px-2  ")).toBe("px-2");
  });

  test("merges newline-separated classes through cnMerge", () => {
    expect(cnMerge("px-2\npx-4")()).toBe("px-4");
    expect(cnMerge("px-2\npx-4")({twMerge: true})).toBe("px-4");
    expect(cnMerge("text-sm\ntext-lg", "font-bold")()).toBe("text-lg font-bold");
  });

  test("merges template-literal base classes in tv", () => {
    const button = tv({
      base: `px-2
        px-4
        text-sm`,
    });

    expect(button()).toBe("px-4 text-sm");
  });

  test("merges newline-separated classes in slots and variants", () => {
    const card = tv({
      slots: {root: "p-2\np-4"},
      variants: {
        size: {sm: {root: "text-sm\ntext-xs"}},
      },
    });

    expect(card({size: "sm"}).root()).toBe("p-4 text-xs");
  });

  test("merges newline-separated class prop overrides against the core", () => {
    const button = tv({base: "px-2"});

    expect(button({class: "px-4\npx-6"})).toBe("px-6");
  });
});

/*
 * Apps alias `tailwind-merge` and `clsx` to this package and run one engine.
 * These tests pin the export names those aliases rely on, and that every
 * entry hands out the same engine instance.
 */
describe("tailwind-merge and clsx alias targets", () => {
  test("the default entry exports twMerge, twJoin, clsx, cn, and clsx as default", () => {
    expect(defaultEntry.twMerge("px-2", "px-4")).toBe("px-4");
    expect(defaultEntry.twMerge("px-2", ["px-4", false, ["py-1"]], null)).toBe("px-4 py-1");
    expect(defaultEntry.twJoin("px-2", ["px-4", false], null)).toBe("px-2 px-4");
    expect(defaultEntry.clsx("a", {b: true, c: false}, ["d", 0, 1])).toBe("a b d 1");
    expect(defaultEntry.cn("px-2", {"px-4": true})).toBe("px-4");
    expect(defaultClsx).toBe(defaultEntry.clsx);
  });

  test("the merge entry exports the same functions and the same engine instance", () => {
    expect(mergeEntry.twMerge).toBe(defaultEntry.twMerge);
    expect(mergeEntry.twJoin).toBe(defaultEntry.twJoin);
    expect(mergeEntry.clsx).toBe(defaultEntry.clsx);
    expect(mergeEntry.cn).toBe(defaultEntry.cn);
    expect(mergeEntry.cx).toBe(defaultEntry.cx);
    expect(mergeClsx).toBe(defaultEntry.clsx);
    expect("tv" in mergeEntry).toBe(false);
  });

  test("the config entry exports the tailwind-merge config API", () => {
    expect(typeof configEntry.extendTailwindMerge).toBe("function");
    expect(typeof configEntry.createTailwindMerge).toBe("function");
    expect(typeof configEntry.mergeConfigs).toBe("function");
    expect(typeof configEntry.fromTheme).toBe("function");
    expect(typeof configEntry.getDefaultConfig).toBe("function");
    expect(typeof configEntry.validators.isArbitraryValue).toBe("function");
    expect(configEntry.twMerge).toBe(defaultEntry.twMerge);
    expect(configEntry.clsx).toBe(defaultEntry.clsx);

    const merge = configEntry.extendTailwindMerge({
      extend: {classGroups: {custom: ["foo-a", "foo-b"]}},
    });

    expect(merge("foo-a foo-b px-2 px-4")).toBe("foo-b px-4");

    const created = configEntry.createTailwindMerge(
      () => configEntry.getDefaultConfig(),
      (config) => ({...config, classGroups: {...config.classGroups, other: ["bar-a", "bar-b"]}}),
    );

    expect(created("bar-a bar-b")).toBe("bar-b");
    expect(created("foo-a foo-b")).toBe("foo-a foo-b");
  });

  test("validators from the config entry compile to span opcodes in custom groups", () => {
    const merge = configEntry.createTwMerge({
      extend: {
        theme: {spacing: [configEntry.validators.isFraction]},
        classGroups: {custom: [{foo: [configEntry.validators.isInteger]}]},
      },
    });

    expect(merge("foo-1 foo-2")).toBe("foo-2");
    expect(merge("foo-1 foo-x")).toBe("foo-1 foo-x");
    expect(merge("px-1/2 px-2")).toBe("px-2");
  });

  test("the lite entry ships a strings-only clsx as named and default export", () => {
    expect(liteEntry.clsx("a", false, "b", ["c"], {d: true}, 0)).toBe("a b");
    expect(liteClsx).toBe(liteEntry.clsx);
  });
});

describe("cn and numeric zero (clsx parity)", () => {
  test("a lone zero is kept, a zero among other args is dropped", () => {
    expect(cn(0)).toBe("0");
    expect(cn("a", 0)).toBe("a");
    expect(cn(0, "a")).toBe("a");
    expect(cn(false, "a")).toBe("a");
    expect(cn("a", 0n)).toBe("a");
    expect(cn("a", 0, "b")).toBe("a b");
    expect(cn(["a", 0])).toBe("a");
    expect(cn("a", 1)).toBe("a 1");
    expect(cnMergeCustom("a", 0)()).toBe("a");
    expect(cnMergeCustom("a", 0)({twMerge: false})).toBe("a 0");
  });
});
