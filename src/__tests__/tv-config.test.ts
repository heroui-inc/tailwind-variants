import {afterEach, describe, expect, test} from "vitest";

import {cnMerge, createTV, defaultConfig, tv} from "../config-entry";
import {createTV as createTVFull, tv as tvFull} from "../index";
import {getCompileCount} from "../internal/compile-config/compile.js";
import {structuralKey} from "../internal/engine-cache.js";
import {state} from "../internal/state.js";
import {createTV as createTVLite, tv as tvLite} from "../lite";

afterEach(() => {
  state.reset();
});
afterEach(() => {
  defaultConfig.twMerge = originalTwMerge;
  defaultConfig.twMergeConfig = originalTwMergeConfig;
  state.reset();
});

describe("createTV", () => {
  const variants = [
    {name: "full - tailwind-merge", createTV: createTVFull, mode: "full"},
    {name: "lite - without tailwind-merge", createTV: createTVLite, mode: "lite"},
  ];

  describe.each(variants)("createTV ($name)", ({createTV, mode}) => {
    test("respects twMerge config when creating tv instance", () => {
      const tv = createTV({twMerge: false});
      const h1 = tv({
        base: "text-3xl font-bold text-blue-400 text-xl text-blue-200",
      });

      expect(h1()).toHaveClass("text-3xl font-bold text-blue-400 text-xl text-blue-200");
    });

    test("overrides twMerge config on tv call", () => {
      const tv = createTV({twMerge: false});
      const h1 = tv(
        {base: "text-3xl font-bold text-blue-400 text-xl text-blue-200"},
        {twMerge: true},
      );

      // lite mode has no merger, so the twMerge override keeps the original classes
      const expected =
        mode === "lite"
          ? "text-3xl font-bold text-blue-400 text-xl text-blue-200"
          : "font-bold text-xl text-blue-200";

      expect(h1()).toHaveClass(expected);
    });

    test("per-call twMerge false disables merging from a merging instance", () => {
      const tv = createTV({twMerge: true});
      const h1 = tv({base: "px-2 px-4"}, {twMerge: false});

      expect(h1()).toHaveClass("px-2 px-4");
    });

    test("keeps instance config keys not overridden per call", () => {
      const tv = createTV({twMerge: false});
      const h1 = tv({base: "px-2 px-4"}, {});

      expect(h1()).toHaveClass("px-2 px-4");
    });
  });
});

describe("twMerge disabled", () => {
  const variants = [
    {name: "full - tailwind-merge", tv: tvFull, mode: "full"},
    {name: "lite - without tailwind-merge", tv: tvLite, mode: "lite"},
  ];

  describe.each(variants)("tv with twMerge disabled ($name)", ({tv}) => {
    test("keeps conflicting base classes", () => {
      const button = tv(
        {
          base: "px-4 px-2 py-2 py-4 bg-blue-500 bg-red-500",
        },
        {
          twMerge: false,
        },
      );

      expect(button()).toBe("px-4 px-2 py-2 py-4 bg-blue-500 bg-red-500");
    });

    test("keeps conflicting variant classes", () => {
      const button = tv(
        {
          base: "font-medium",
          variants: {
            size: {
              sm: "text-sm text-xs px-2 px-3",
              md: "text-base text-md px-4 px-5",
            },
            color: {
              primary: "bg-blue-500 bg-blue-600 text-white text-gray-100",
              secondary: "bg-gray-500 bg-gray-600",
            },
          },
        },
        {
          twMerge: false,
        },
      );

      expect(button({size: "sm"})).toBe("font-medium text-sm text-xs px-2 px-3");
      expect(button({size: "md", color: "primary"})).toBe(
        "font-medium text-base text-md px-4 px-5 bg-blue-500 bg-blue-600 text-white text-gray-100",
      );
    });

    test("keeps conflicting compound variant classes", () => {
      const button = tv(
        {
          base: "font-semibold",
          variants: {
            size: {
              sm: "px-2",
              md: "px-4",
            },
            variant: {
              primary: "bg-blue-500",
              secondary: "bg-gray-500",
            },
          },
          compoundVariants: [
            {
              size: "sm",
              variant: "primary",
              class: "bg-blue-600 bg-blue-700 px-3 px-4",
            },
          ],
        },
        {
          twMerge: false,
        },
      );

      expect(button({size: "sm", variant: "primary"})).toBe(
        "font-semibold px-2 bg-blue-500 bg-blue-600 bg-blue-700 px-3 px-4",
      );
    });

    test("keeps conflicting slot classes", () => {
      const card = tv(
        {
          slots: {
            base: "rounded-lg rounded-xl p-4 p-6",
            header: "text-lg text-xl font-bold font-semibold",
            body: "text-gray-600 text-gray-700 mt-2 mt-4",
          },
        },
        {
          twMerge: false,
        },
      );

      const slots = card();

      expect(slots.base()).toBe("rounded-lg rounded-xl p-4 p-6");
      expect(slots.header()).toBe("text-lg text-xl font-bold font-semibold");
      expect(slots.body()).toBe("text-gray-600 text-gray-700 mt-2 mt-4");
    });

    test("keeps conflicts from class and className props", () => {
      const button = tv(
        {
          base: "px-4 py-2 rounded",
        },
        {
          twMerge: false,
        },
      );

      expect(button({class: "px-2 py-4 rounded-lg"})).toBe(
        "px-4 py-2 rounded px-2 py-4 rounded-lg",
      );
      expect(button({className: "px-6 py-1 rounded-xl"})).toBe(
        "px-4 py-2 rounded px-6 py-1 rounded-xl",
      );
    });

    test("supports non-Tailwind classes", () => {
      const button = tv(
        {
          base: "button",
          variants: {
            size: {
              sm: "button--sm",
              md: "button--md",
              lg: "button--lg",
            },
            variant: {
              primary: "button--primary",
              secondary: "button--secondary",
            },
          },
        },
        {
          twMerge: false,
        },
      );

      expect(button()).toBe("button");
      expect(button({size: "sm"})).toBe("button button--sm");
      expect(button({size: "lg", variant: "secondary"})).toBe(
        "button button--lg button--secondary",
      );
    });

    test("handles empty and falsy values", () => {
      const button = tv(
        {
          base: "base",
          variants: {
            size: {
              sm: "small",
              md: "",
              lg: null,
            },
          },
        },
        {
          twMerge: false,
        },
      );

      expect(button({size: "sm"})).toBe("base small");
      expect(button({size: "md"})).toBe("base");
      expect(button({size: "lg"})).toBe("base");
    });

    test("handles arrays of classes", () => {
      const button = tv(
        {
          base: ["px-4", "py-2", ["rounded", ["bg-blue-500"]]],
          variants: {
            size: {
              sm: ["text-sm", ["px-2", "py-1"]],
            },
          },
        },
        {
          twMerge: false,
        },
      );

      expect(button()).toBe("px-4 py-2 rounded bg-blue-500");
      expect(button({size: "sm"})).toBe("px-4 py-2 rounded bg-blue-500 text-sm px-2 py-1");
    });
  });
});

const COMMON_UNITS = ["small", "medium", "large"];

const twMergeConfig = {
  extend: {
    theme: {
      opacity: ["disabled"],
      spacing: ["divider", "unit", "unit-2", "unit-4", "unit-6"],
      borderWidth: COMMON_UNITS,
      borderRadius: COMMON_UNITS,
    },
    classGroups: {
      shadow: [{shadow: COMMON_UNITS}],
      "font-size": [{text: ["tiny", ...COMMON_UNITS]}],
      "bg-image": ["bg-stripe-gradient"],
      "min-w": [{"min-w": ["unit", "unit-2", "unit-4", "unit-6"]}],
    },
  },
};

describe("tv (Tailwind Merge)", () => {
  test("merges conflicting Tailwind classes", () => {
    const styles = tv({
      base: "text-base text-yellow-400",
      variants: {
        color: {
          red: "text-red-500",
          blue: "text-blue-500",
        },
      },
    });

    const result = styles({
      color: "red",
    });

    expect(result).toHaveClass(["text-base", "text-red-500"]);
  });

  test("supports custom config", () => {
    const styles = tv(
      {
        base: "text-small text-yellow-400 w-unit",
        variants: {
          size: {
            small: "text-small w-unit-2",
            medium: "text-medium w-unit-4",
            large: "text-large w-unit-6",
          },
          color: {
            red: "text-red-500",
            blue: "text-blue-500",
          },
        },
      },
      {
        twMergeConfig,
      },
    );

    const result = styles({
      size: "medium",
      color: "blue",
    });

    expect(result).toHaveClass(["text-medium", "text-blue-500", "w-unit-4"]);
  });

  test("supports legacy custom config", () => {
    const styles = tv(
      {
        base: "text-small text-yellow-400 w-unit",
        variants: {
          size: {
            small: "text-small w-unit-2",
            medium: "text-medium w-unit-4",
            large: "text-large w-unit-6",
          },
          color: {
            red: "text-red-500",
            blue: "text-blue-500",
          },
        },
      },
      {
        twMergeConfig: {
          theme: {
            opacity: ["disabled"],
            spacing: ["divider", "unit", "unit-2", "unit-4", "unit-6"],
            borderWidth: COMMON_UNITS,
            borderRadius: COMMON_UNITS,
          },
          classGroups: {
            shadow: [{shadow: COMMON_UNITS}],
            "font-size": [{text: ["tiny", ...COMMON_UNITS]}],
            "bg-image": ["bg-stripe-gradient"],
            "min-w": [
              {
                "min-w": ["unit", "unit-2", "unit-4", "unit-6"],
              },
            ],
          },
        },
      },
    );

    const result = styles({
      size: "medium",
      color: "blue",
    });

    expect(result).toHaveClass(["text-medium", "text-blue-500", "w-unit-4"]);
  });

  test("invalidates the cached merger when custom config changes", () => {
    const first = tv(
      {base: "foo-a foo-b"},
      {
        twMergeConfig: {
          classGroups: {custom: ["foo-a", "foo-b"]},
        },
      },
    );

    expect(first()).toBe("foo-b");

    const second = tv(
      {base: "foo-a foo-b"},
      {
        twMergeConfig: {
          classGroups: {other: ["bar-a", "bar-b"]},
        },
      },
    );

    expect(second()).toBe("foo-a foo-b");
  });
});

const originalTwMerge = defaultConfig.twMerge ?? true;

const originalTwMergeConfig = defaultConfig.twMergeConfig ?? {};

describe("defaultConfig", () => {
  test("exports merging enabled with an empty merge config", () => {
    expect(defaultConfig.twMerge).toBe(true);
    expect(defaultConfig.twMergeConfig).toEqual({});
  });

  test("disabling twMerge affects components created afterwards", () => {
    defaultConfig.twMerge = false;

    const unmerged = tv({base: "px-2 px-4"});

    expect(unmerged()).toBe("px-2 px-4");

    defaultConfig.twMerge = true;

    const merged = tv({base: "px-2 px-4"});

    expect(merged()).toBe("px-4");
  });

  test("twMergeConfig edits change how conflicts resolve", () => {
    defaultConfig.twMergeConfig = {classGroups: {custom: ["foo-a", "foo-b"]}};

    const withGroup = tv({base: "foo-a foo-b"});

    expect(withGroup()).toBe("foo-b");
  });

  test("without a custom group the same classes do not conflict", () => {
    const plain = tv({base: "foo-a foo-b"});

    expect(plain()).toBe("foo-a foo-b");
  });

  test("twMergeConfig edits apply across multiple components", () => {
    defaultConfig.twMergeConfig = {
      classGroups: {
        custom: ["foo-a", "foo-b"],
        other: ["bar-a", "bar-b"],
      },
    };

    expect(tv({base: "foo-a foo-b"})()).toBe("foo-b");
    expect(tv({base: "bar-a bar-b"})()).toBe("bar-b");
  });

  test("createTV spreads its config over mutated defaults", () => {
    defaultConfig.twMerge = false;

    const inheriting = createTV({});
    const overriding = createTV({twMerge: true});

    expect(inheriting({base: "px-2 px-4"})()).toBe("px-2 px-4");
    expect(overriding({base: "px-2 px-4"})()).toBe("px-4");
  });
});

const customGroups = () => ({
  extend: {
    theme: {spacing: ["unit", "unit-2"]},
    classGroups: {custom: ["foo-a", "foo-b"]},
  },
});

describe("engine registry", () => {
  test("equal twMergeConfig objects built twice share one compiled engine", () => {
    const before = getCompileCount();
    const first = createTV({twMergeConfig: customGroups()});
    const second = createTV({twMergeConfig: customGroups()});

    expect(first({base: "foo-a foo-b"})()).toBe("foo-b");
    expect(second({base: "foo-a foo-b"})()).toBe("foo-b");
    expect(tv({base: "px-unit px-unit-2"}, {twMergeConfig: customGroups()})()).toBe("px-unit-2");
    expect(cnMerge("foo-a", "foo-b")({twMergeConfig: customGroups()})).toBe("foo-b");
    expect(getCompileCount()).toBe(before + 1);
  });

  test("a config literal rebuilt on every call compiles once", () => {
    const before = getCompileCount();
    const make = () => createTV({twMergeConfig: {extend: {classGroups: {x: ["x-a", "x-b"]}}}});

    for (let i = 0; i < 50; i++) {
      expect(make()({base: "x-a x-b"})()).toBe("x-b");
    }
    expect(getCompileCount()).toBe(before + 1);
  });

  test("different configs compile separately and keep separate results", () => {
    const before = getCompileCount();
    const a = createTV({twMergeConfig: {extend: {classGroups: {custom: ["foo-a", "foo-b"]}}}});
    const b = createTV({twMergeConfig: {extend: {classGroups: {other: ["bar-a", "bar-b"]}}}});

    expect(a({base: "foo-a foo-b"})()).toBe("foo-b");
    expect(b({base: "foo-a foo-b"})()).toBe("foo-a foo-b");
    expect(b({base: "bar-a bar-b"})()).toBe("bar-b");
    expect(getCompileCount()).toBe(before + 2);
  });

  test("the same object is a fast path and the key ignores property order", () => {
    const config = customGroups();
    const reordered = {
      extend: {
        classGroups: {custom: ["foo-a", "foo-b"]},
        theme: {spacing: ["unit", "unit-2"]},
      },
    };

    expect(structuralKey(config)).toBe(structuralKey(customGroups()));
    expect(structuralKey(config)).toBe(structuralKey(reordered));
    expect(structuralKey(config)).not.toBe(
      structuralKey({extend: {classGroups: {custom: ["foo-a"]}}}),
    );

    const before = getCompileCount();

    // compilation happens when the first recipe of a factory is created
    expect(createTV({twMergeConfig: config})({base: "foo-a foo-b"})()).toBe("foo-b");
    expect(createTV({twMergeConfig: config})({base: "foo-a foo-b"})()).toBe("foo-b");
    expect(createTV({twMergeConfig: reordered})({base: "foo-a foo-b"})()).toBe("foo-b");
    expect(tv({base: "foo-a foo-b"}, {twMergeConfig: reordered})()).toBe("foo-b");
    expect(getCompileCount()).toBe(before + 1);
  });

  test("functions key by identity and unkeyable configs fall back to identity", () => {
    const isEven = (value: string) => Number(value) % 2 === 0;
    const withFn = () => ({extend: {classGroups: {even: [{even: [isEven]}]}}});

    expect(structuralKey(withFn())).toBe(structuralKey(withFn()));
    expect(structuralKey(withFn())).not.toBe(
      structuralKey({extend: {classGroups: {even: [{even: [(value: string) => value === "2"]}]}}}),
    );

    const cyclic: Record<string, unknown> = {extend: {}};

    cyclic.self = cyclic;
    expect(structuralKey(cyclic)).toBeNull();

    const before = getCompileCount();
    const a = createTV({twMergeConfig: withFn()});
    const b = createTV({twMergeConfig: withFn()});

    expect(a({base: "even-2 even-4"})()).toBe("even-4");
    expect(b({base: "even-2 even-3"})()).toBe("even-2 even-3");
    expect(getCompileCount()).toBe(before + 1);
  });
});

describe("config entry defaults", () => {
  const originalTwMerge = defaultConfig.twMerge ?? true;
  const originalTwMergeConfig = defaultConfig.twMergeConfig ?? {};

  afterEach(() => {
    defaultConfig.twMerge = originalTwMerge;
    defaultConfig.twMergeConfig = originalTwMergeConfig;
  });

  test("twMergeConfig edits on defaultConfig reach recipes created afterwards", () => {
    defaultConfig.twMergeConfig = {classGroups: {custom: ["foo-a", "foo-b"]}};

    expect(tv({base: "foo-a foo-b"})()).toBe("foo-b");

    defaultConfig.twMergeConfig = {};

    expect(tv({base: "foo-a foo-b"})()).toBe("foo-a foo-b");
  });
});
