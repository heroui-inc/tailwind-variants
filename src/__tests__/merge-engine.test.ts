import {afterEach, describe, expect, test} from "vitest";

import {cn, cnMerge, createTV, tv} from "../index";
import {createMerger} from "../internal/merge/index.js";
import {state} from "../internal/state.js";
import {cn as cnLite} from "../lite";

afterEach(() => {
  state.reset();
});

describe("createMerger", () => {
  test("matches default conflict resolution", () => {
    const merge = createMerger();

    expect(merge.mergeString("px-2 px-4")).toBe("px-4");
    expect(merge.mergeString("text-sm text-lg")).toBe("text-lg");
    expect(merge("px-2", "px-4", "py-1")).toBe("px-4 py-1");
  });

  test("keeps custom font-size tokens alongside text-color", () => {
    const merge = createMerger({
      extend: {
        classGroups: {
          "font-size": ["text-24-regular", "text-24-medium"],
        },
      },
    });

    expect(merge.mergeString("text-foreground text-24-regular")).toBe(
      "text-foreground text-24-regular",
    );
    expect(merge.mergeString("text-24-regular text-24-medium")).toBe("text-24-medium");
  });

  test("override replaces class groups instead of appending", () => {
    const extended = createMerger({
      extend: {
        classGroups: {
          "font-size": ["text-24-regular"],
        },
      },
    });
    const overridden = createMerger({
      override: {
        classGroups: {
          "font-size": ["text-24-regular"],
        },
      },
    });

    // extend: custom size conflicts with default text-* sizes in the same group
    expect(extended.mergeString("text-24-regular text-sm")).toBe("text-sm");
    // override: group replaced, so custom size coexists with default text-sm
    expect(overridden.mergeString("text-24-regular text-sm")).toBe("text-24-regular text-sm");
  });

  test("accepts a function config factory", () => {
    const merge = createMerger((defaultConfig) => ({
      ...defaultConfig,
      classGroups: {
        ...defaultConfig.classGroups,
        custom: ["foo-a", "foo-b"],
      },
    }));

    expect(merge.mergeString("foo-a foo-b")).toBe("foo-b");
    expect(merge.mergeString("px-2 px-4")).toBe("px-4");
  });

  test("isolates caches between configured instances", () => {
    const a = createMerger({
      extend: {classGroups: {custom: ["foo-a", "foo-b"]}},
    });
    const b = createMerger({
      extend: {classGroups: {other: ["bar-a", "bar-b"]}},
    });

    expect(a.mergeString("foo-a foo-b")).toBe("foo-b");
    expect(b.mergeString("foo-a foo-b")).toBe("foo-a foo-b");
    expect(b.mergeString("bar-a bar-b")).toBe("bar-b");
  });

  test("handles modifiers, important, postfix, and arbitrary values", () => {
    const merge = createMerger();

    expect(merge.mergeString("hover:px-2 hover:px-4 px-1")).toBe("hover:px-4 px-1");
    expect(merge.mergeString("dark:hover:bg-red-500 dark:hover:bg-blue-500")).toBe(
      "dark:hover:bg-blue-500",
    );
    expect(merge.mergeString("!px-2 px-4")).toBe("!px-2 px-4");
    expect(merge.mergeString("px-2 !px-4")).toBe("px-2 !px-4");
    expect(merge.mergeString("text-lg/2 text-sm")).toBe("text-sm");
    expect(merge.mergeString("w-1/2 w-full")).toBe("w-full");
    expect(merge.mergeString("text-[21px] text-lg")).toBe("text-lg");
    expect(merge.mergeString("bg-[#000] bg-red-500")).toBe("bg-red-500");
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
    const run = cnMerge("text-foreground text-24-regular");

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
      cnMerge("text-foreground text-24-regular")({
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
      cnMerge("text-foreground text-24-regular")({
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
    expect(cnMerge("px-2 px-4")({twMerge: false})).toBe("px-2 px-4");
  });

  test("tv twMergeConfig matches cnMerge extend shape", () => {
    const button = tv(
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
      cnMerge("text-24-regular text-sm")({
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
      cnMerge("text-foreground text-24-regular")({
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
    const tvFactory = createTV({
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
    const merge = createMerger(config);

    // Rightmost group wins when both declare each other as conflicts.
    expect(merge.mergeString("foo-a bar-a")).toBe("bar-a");
    expect(merge.mergeString("bar-a foo-b")).toBe("foo-b");
  });

  test("state.reset clears configured merger so a later config takes effect", () => {
    expect(
      cnMerge("text-foreground text-24-regular")({
        twMergeConfig: {
          extend: {classGroups: {"font-size": ["text-24-regular"]}},
        },
      }),
    ).toBe("text-foreground text-24-regular");

    state.reset();

    expect(cn("text-foreground text-24-regular")).toBe("text-24-regular");
    expect(
      cnMerge("text-foreground text-24-medium")({
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
    expect(cn()).toBeUndefined();
    expect(cn(false, null, undefined, "")).toBeUndefined();
    expect(cn("px-2", false, "px-4")).toBe("px-4");
  });
});
