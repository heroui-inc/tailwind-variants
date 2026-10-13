import type {CreateMergerConfig} from "../internal/compile-config/compile.js";

import {extendTailwindMerge, fromTheme, twMerge, validators} from "tailwind-merge";
import {afterEach, describe, expect, test} from "vitest";

import {cn, cnMerge, createTV, createTwMerge, tv} from "../config-entry";
import {getDefaultConfig} from "../internal/compile-config/default-config.js";
import {getApiFor} from "../internal/engine-cache.js";
import {engine as defaultEngine, twMerge as defaultTwMerge} from "../internal/engine-instance.js";
import {compileToTables} from "../internal/merge-engine/compiler.js";
import defaultTables from "../internal/merge-engine/tables.generated.js";
import {state} from "../internal/state.js";

afterEach(() => {
  state.reset();
});

const defaultCases = [
  "px-2 px-4",
  "text-sm text-lg font-bold",
  "hover:px-2 hover:px-4 px-1",
  "dark:hover:bg-red-500 dark:hover:bg-blue-500",
  "!px-2 px-4",
  "px-2 !px-4",
  "text-lg/2 text-sm",
  "w-1/2 w-full",
  "text-[21px] text-lg",
  "bg-[#000] bg-red-500",
  "flex inline-flex",
  "p-2 px-4 py-1",
  "m-2 mx-4 my-1",
  "border border-2 border-red-500",
  "rounded rounded-lg",
] as const;

describe("parity with tailwind-merge 3.6.0 (default config; the unlabeled font rule is the recorded exception)", () => {
  test.each(defaultCases)("mergeString %#: %s", (input) => {
    expect(createTwMerge({})(input)).toBe(twMerge(input));
  });

  test("cn matches twMerge for multi-arg joins", () => {
    expect(cn("px-2", "px-4", "py-2")).toBe(twMerge("px-2", "px-4", "py-2"));
    expect(cn("hover:bg-red-500", "hover:bg-blue-500")).toBe(
      twMerge("hover:bg-red-500", "hover:bg-blue-500"),
    );
  });
});

describe("parity with extendTailwindMerge config shapes", () => {
  const extendConfig = {
    extend: {
      classGroups: {
        "font-size": ["text-24-regular", "text-24-medium"],
      },
    },
  } as const;

  test("extend.classGroups matches extendTailwindMerge", () => {
    const twm = extendTailwindMerge(extendConfig);
    const merge = createTwMerge(extendConfig);
    const input = "text-foreground text-24-regular";

    expect(merge(input)).toBe(twm(input));
    expect(cnMerge(input)({twMergeConfig: extendConfig})).toBe(twm(input));
    expect(merge("text-24-regular text-24-medium")).toBe(twm("text-24-regular text-24-medium"));
  });

  test("legacy flat classGroups matches extendTailwindMerge({ extend })", () => {
    const twm = extendTailwindMerge({
      extend: {
        classGroups: {
          "font-size": ["text-24-regular"],
        },
      },
    });

    expect(
      cnMerge("text-foreground text-24-regular")({
        twMergeConfig: {
          classGroups: {
            "font-size": ["text-24-regular"],
          },
        },
      }),
    ).toBe(twm("text-foreground text-24-regular"));
  });

  test("override.classGroups matches extendTailwindMerge override", () => {
    const overrideConfig = {
      override: {
        classGroups: {
          "font-size": ["text-24-regular"],
        },
      },
    } as const;

    const twm = extendTailwindMerge(overrideConfig);
    const merge = createTwMerge(overrideConfig);

    expect(merge("text-24-regular text-sm")).toBe(twm("text-24-regular text-sm"));
    expect(merge("text-sm text-lg")).toBe(twm("text-sm text-lg"));
    expect(cnMerge("text-24-regular text-sm")({twMergeConfig: overrideConfig})).toBe(
      twm("text-24-regular text-sm"),
    );
  });

  test("extend.conflictingClassGroups matches extendTailwindMerge", () => {
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
    };
    const twm = extendTailwindMerge(config as Parameters<typeof extendTailwindMerge>[0]);
    const merge = createTwMerge(config);

    expect(merge("foo-a bar-a")).toBe(twm("foo-a bar-a"));
    expect(merge("bar-a foo-b")).toBe(twm("bar-a foo-b"));
  });

  test("createTV twMergeConfig matches extendTailwindMerge", () => {
    const config = {
      extend: {
        classGroups: {
          "font-size": ["text-24-regular"],
        },
      },
    } as const;
    const twm = extendTailwindMerge(config);
    const tvFactory = createTV({twMergeConfig: config});
    const button = tvFactory({base: "text-foreground text-24-regular"});

    expect(button()).toBe(twm("text-foreground text-24-regular"));
  });

  test("extend.theme + classGroups matches tv and extendTailwindMerge", () => {
    const config = {
      extend: {
        theme: {
          spacing: ["unit", "unit-2", "unit-4"],
        },
        classGroups: {
          "font-size": [{text: ["tiny", "small", "medium"]}],
        },
      },
    } as const;

    const twm = extendTailwindMerge(config);
    const component = tv(
      {
        base: "px-unit text-tiny",
        variants: {
          size: {
            md: "px-unit-2 text-small",
            lg: "px-unit-4 text-medium",
          },
        },
      },
      {twMergeConfig: config},
    );

    expect(component({size: "lg"})).toBe(twm("px-unit text-tiny px-unit-4 text-medium"));
    expect(cnMerge("px-unit", "px-unit-2")({twMergeConfig: config})).toBe(
      twm("px-unit", "px-unit-2"),
    );
  });
});

/*
 * Tailwind v4 reads an unlabeled `font-[…]` as a weight only when it is a
 * number and as a family name otherwise. tailwind-merge 3.6.0 (and cn 0.2.5)
 * classify every unlabeled `font-[…]` as a weight, so these are intentional
 * deltas (shadcn-ui/cn#23). Labeled and variable forms follow tailwind-merge.
 */
describe("font-family and font-weight arbitrary values (Tailwind v4 rule)", () => {
  test.each([
    ["font-sans font-[Inter]", "font-[Inter]"],
    ["font-[Inter] font-sans", "font-sans"],
    ["font-medium font-[Inter]", "font-medium font-[Inter]"],
    ["font-[Inter,sans-serif] font-bold", "font-[Inter,sans-serif] font-bold"],
    ["font-[Inter_Tight] font-mono", "font-mono"],
    ["font-[var(--f)] font-sans", "font-sans"],
    ["font-[700] font-bold", "font-bold"],
    ["font-bold font-[700]", "font-[700]"],
    ["font-[Inter] font-[700]", "font-[Inter] font-[700]"],
    ["font-sans font-[Inter] font-bold font-[600]", "font-[Inter] font-[600]"],
  ])("%s → %s", (input, expected) => {
    expect(cn(input)).toBe(expected);
  });

  test.each([
    "font-[weight:700] font-bold",
    "font-[number:700] font-bold",
    "font-[family-name:Inter] font-sans",
    "font-[family-name:Inter] font-bold",
    "font-(family-name:--f) font-sans",
    "font-(--f) font-sans",
    "font-(--f) font-bold",
    "font-(weight:--w) font-bold",
    "font-[length:1rem] font-sans",
  ])("labeled and variable forms match tailwind-merge: %s", (input) => {
    expect(cn(input)).toBe(twMerge(input));
  });

  test.each([
    "@container @container/main",
    "@container-normal @container",
    "@container/main @container-size/main",
    "@container/a @container/b",
    "@container @container-[size]",
    "@container-[inline-size] @container-normal",
    "@container/x @container-normal/x",
    "@container-size @container-size/y",
  ])("container queries match tailwind-merge: %s", (input) => {
    expect(cn(input)).toBe(twMerge(input));
  });

  test.each([
    "text-[Inter] text-sm",
    "bg-[Inter] bg-red-500",
    "shadow-[Inter] shadow-lg",
    "from-[x] from-10%",
    "ring-[x] ring-2",
    "w-[x] w-4",
    "text-[length:1rem] text-red-500",
    "text-(color:--c) text-lg",
    "bg-[image:var(--i)] bg-red-500",
    "shadow-(color:--c) shadow-lg",
    "ring-[length:3px] ring-red-500",
    "border-[length:3px] border-red-500",
  ])("other arbitrary values match tailwind-merge: %s", (input) => {
    expect(cn(input)).toBe(twMerge(input));
  });
});

// Engine for a config (the default engine when no config is given).
const createMerger = (config?: CreateMergerConfig) =>
  config === undefined ? defaultEngine : getApiFor(config).engine;

// Inputs that exercise variants, important, postfix, arbitrary values, and whitespace.
const corpus = [
  "",
  "px-2",
  "px-2 px-4",
  "  px-2   px-4 ",
  "px-2\npx-4\tpy-1",
  "p-4 px-2 pl-1",
  "pl-1 px-2 p-4",
  "m-2 mx-4 ml-1 -m-1",
  "text-sm text-lg font-bold",
  "text-red-500 text-lg text-[#123456] text-[length:1rem]",
  "hover:px-2 hover:px-4 px-1",
  "dark:hover:bg-red-500 hover:dark:bg-blue-500",
  "md:px-2 lg:px-4 md:px-6",
  "!px-2 px-4",
  "px-2 !px-4",
  "px-2! px-4!",
  "text-lg/2 text-sm",
  "text-lg/7 leading-6",
  "leading-6 text-lg/7",
  "w-1/2 w-full",
  "w-[100px] w-[200px] w-[calc(100%-1rem)]",
  "bg-[#000] bg-red-500 bg-[url(/a.png)] bg-(--my-color)",
  "bg-[image:var(--x)] bg-red-500",
  "grid-cols-2 grid-cols-[1fr_2fr]",
  "flex inline-flex block hidden",
  "rounded rounded-lg rounded-t-md rounded-tl-none",
  "border border-2 border-red-500 border-t-4 border-x",
  "overflow-x-auto overflow-hidden line-clamp-3",
  "touch-pan-y touch-auto touch-pan-x",
  "inset-0 inset-x-2 left-1 start-2",
  "scroll-mx-2 scroll-ms-4 scroll-m-1",
  "shadow shadow-lg shadow-red-500 shadow-md",
  "ring ring-2 ring-offset-2 ring-red-500",
  "[mask-type:luminance] [mask-type:alpha] [color:red]",
  "@container @container/main @container-size/main",
  "group-hover:px-2 group-hover/name:px-4 group-hover:px-6",
  "*:px-2 *:px-4 **:px-1",
  "first-letter:px-2 hover:first-letter:px-4",
  "data-[state=open]:px-2 data-[state=open]:px-4 data-[state=closed]:px-1",
  "translate-x-2 translate-none translate-4",
  "size-4 w-2 h-2 size-6",
  "gap-2 gap-x-4 gap-y-1 gap-3",
  "aspect-video aspect-[4/3] aspect-square",
  "font-sans font-[family-name:var(--x)] font-bold font-[600]",
  "transition transition-colors duration-100 duration-[300ms] ease-in ease-[cubic-bezier(0.1,0.7,1,0.1)]",
  "foo-a foo-b unknown-class px-2 unknown-class",
  "px-2 px-2 px-2",
  "0 px-2",
  "\u0020px-2 px-4",
];

// Unicode whitespace splits tokens exactly like tailwind-merge's `\s` split.
const twMergeOnly = ["px-2\u00a0px-4", "px-2\u2003px-4 py-1"];

// The vendored config patches `shadow-inner` (from tailwind-merge main), so
// these deliberately differ from tailwind-merge 3.6.0 and are pinned as text.
const patchedCases: [string, string][] = [
  ["shadow shadow-lg shadow-red-500 shadow-inner", "shadow-red-500 shadow-inner"],
  ["shadow-lg shadow-inner", "shadow-inner"],
  ["shadow-initial shadow-inner", "shadow-initial shadow-inner"],
];

describe("compiled engine parity", () => {
  test.each([...corpus, ...twMergeOnly])("matches tailwind-merge for %j", (input) => {
    expect(createMerger().mergeString(input)).toBe(twMerge(input));
  });

  test.each(patchedCases)("applies the vendored config patch for %j", (input, expected) => {
    expect(createMerger().mergeString(input)).toBe(expected);
  });

  test("cached and uncached merges agree and are idempotent", () => {
    const merger = createMerger();

    for (const input of corpus) {
      const cached = merger.mergeString(input);

      expect(merger.mergeUncached(input)).toBe(cached);
      expect(merger.mergeString(input)).toBe(cached);
      expect(merger.mergeUncached(cached)).toBe(cached);
    }
  });

  test("returns an empty string for empty input and the token for a single token", () => {
    const merger = createMerger();

    expect(merger.mergeString("")).toBe("");
    expect(merger.mergeString("   ")).toBe("");
    expect(merger.mergeString("px-2")).toBe("px-2");
    expect(merger.mergeString("[mask-type:luminance]")).toBe("[mask-type:luminance]");
    expect(merger.mergeString("  px-2  ")).toBe("px-2");
  });

  test("returns the input unchanged when nothing is dropped", () => {
    const merger = createMerger();
    const input = "flex items-center gap-2 px-4 text-sm";

    expect(merger.mergeString(input)).toBe(input);
    expect(merger.mergeUncached(input)).toBe(input);
  });

  test("variadic form joins strings and nested arrays like twMerge", () => {
    const merger = createMerger();

    expect(merger.merge("px-2", ["px-4", false, ["py-1"]], null)).toBe(
      twMerge("px-2", ["px-4", false, ["py-1"]], null),
    );
    expect(merger.merge()).toBe("");
    expect(defaultTwMerge("px-2", "px-4")).toBe("px-4");
  });
});

describe("compiled engine custom configs", () => {
  test("extend, override, and prefix match extendTailwindMerge", () => {
    const cases: [Parameters<typeof extendTailwindMerge>[0], string[]][] = [
      [
        {extend: {classGroups: {"font-size": ["text-24-regular", "text-24-medium"]}}},
        [
          "text-foreground text-24-regular",
          "text-24-regular text-24-medium",
          "text-sm text-24-medium",
        ],
      ],
      [
        {override: {classGroups: {"font-size": ["text-24-regular"]}}},
        ["text-24-regular text-sm", "text-sm text-lg", "text-24-regular text-24-regular"],
      ],
      [{prefix: "tw"}, ["tw:px-2 tw:px-4", "px-2 px-4", "tw:hover:px-2 tw:hover:px-4 hover:px-1"]],
      [
        {
          extend: {
            theme: {spacing: ["unit", "unit-2"]},
            classGroups: {custom: ["foo-a", "foo-b"], "min-w": [{"min-w": ["unit", "unit-2"]}]},
            conflictingClassGroups: {custom: ["px"]},
          },
        },
        ["px-unit px-unit-2", "foo-a foo-b", "px-4 foo-a", "foo-a px-4", "min-w-unit min-w-unit-2"],
      ],
    ];

    for (const [config, inputs] of cases) {
      const expected = extendTailwindMerge(config);
      const merger = createMerger(config as CreateMergerConfig);

      for (const input of inputs) {
        expect(merger.mergeString(input)).toBe(expected(input));
      }
    }
  });

  test("tailwind-merge theme getters and validators compile as custom definitions", () => {
    const config = {
      extend: {
        theme: {spacing: ["gutter"]},
        classGroups: {
          "custom-gap": [{cgap: [fromTheme("spacing"), validators.isArbitraryValue]}],
        },
      },
    };
    const expected = extendTailwindMerge(config as Parameters<typeof extendTailwindMerge>[0]);
    const merger = createMerger(config as CreateMergerConfig);

    for (const input of ["cgap-2 cgap-gutter", "cgap-[3px] cgap-1", "cgap-x cgap-1"]) {
      expect(merger.mergeString(input)).toBe(expected(input));
    }
  });

  test("user validator functions run as custom validators", () => {
    const isEven = (value: string) => Number(value) % 2 === 0;
    const merger = createMerger({
      extend: {classGroups: {even: [{even: [isEven]}]}},
    });

    expect(merger.mergeString("even-2 even-4")).toBe("even-4");
    expect(merger.mergeString("even-2 even-3")).toBe("even-2 even-3");
    expect(merger.mergeString("even-3 even-4 even-6")).toBe("even-3 even-6");
  });

  test("recipes with different configs keep separate engines", () => {
    const custom = tv(
      {base: "foo-a foo-b"},
      {twMergeConfig: {extend: {classGroups: {custom: ["foo-a", "foo-b"]}}}},
    );
    const plain = tv({base: "foo-a foo-b"});
    const other = tv({base: "foo-a foo-b"}, {twMergeConfig: {extend: {classGroups: {x: ["x-a"]}}}});

    expect(custom()).toBe("foo-b");
    expect(plain()).toBe("foo-a foo-b");
    expect(other()).toBe("foo-a foo-b");
  });

  test("equal config objects built twice share one compiled engine", () => {
    const make = () => ({extend: {classGroups: {custom: ["foo-a", "foo-b"]}}});
    const factory = createTV({twMergeConfig: make()});

    expect(factory({base: "foo-a foo-b"})()).toBe("foo-b");
    expect(tv({base: "foo-a foo-b"}, {twMergeConfig: make()})()).toBe("foo-b");
  });
});

describe("checked-in default tables", () => {
  test("match a fresh compile of the vendored default config", () => {
    const {tables} = compileToTables(getDefaultConfig());

    for (const key of Object.keys(tables) as (keyof typeof tables)[]) {
      const fresh = tables[key];
      const checkedIn = defaultTables[key as keyof typeof defaultTables];

      if (fresh instanceof Int32Array) {
        expect(Array.from(checkedIn as Int32Array), String(key)).toEqual(Array.from(fresh));
      } else {
        expect(checkedIn, String(key)).toEqual(fresh);
      }
    }
  });
});

describe("custom config outputs", () => {
  describe("createTwMerge", () => {
    test("matches default conflict resolution", () => {
      const merge = createTwMerge({});

      expect(merge("px-2 px-4")).toBe("px-4");
      expect(merge("text-sm text-lg")).toBe("text-lg");
      expect(merge("px-2", "px-4", "py-1")).toBe("px-4 py-1");
    });

    test("keeps custom font-size tokens alongside text-color", () => {
      const merge = createTwMerge({
        extend: {
          classGroups: {
            "font-size": ["text-24-regular", "text-24-medium"],
          },
        },
      });

      expect(merge("text-foreground text-24-regular")).toBe("text-foreground text-24-regular");
      expect(merge("text-24-regular text-24-medium")).toBe("text-24-medium");
    });

    test("override replaces class groups instead of appending", () => {
      const extended = createTwMerge({
        extend: {
          classGroups: {
            "font-size": ["text-24-regular"],
          },
        },
      });
      const overridden = createTwMerge({
        override: {
          classGroups: {
            "font-size": ["text-24-regular"],
          },
        },
      });

      // extend: custom size conflicts with default text-* sizes in the same group
      expect(extended("text-24-regular text-sm")).toBe("text-sm");
      // override: group replaced, so custom size coexists with default text-sm
      expect(overridden("text-24-regular text-sm")).toBe("text-24-regular text-sm");
    });

    test("accepts a function config factory", () => {
      const merge = createTwMerge((defaultConfig) => ({
        ...defaultConfig,
        classGroups: {
          ...defaultConfig.classGroups,
          custom: ["foo-a", "foo-b"],
        },
      }));

      expect(merge("foo-a foo-b")).toBe("foo-b");
      expect(merge("px-2 px-4")).toBe("px-4");
    });

    test("isolates caches between configured instances", () => {
      const a = createTwMerge({
        extend: {classGroups: {custom: ["foo-a", "foo-b"]}},
      });
      const b = createTwMerge({
        extend: {classGroups: {other: ["bar-a", "bar-b"]}},
      });

      expect(a("foo-a foo-b")).toBe("foo-b");
      expect(b("foo-a foo-b")).toBe("foo-a foo-b");
      expect(b("bar-a bar-b")).toBe("bar-b");
    });

    test("handles modifiers, important, postfix, and arbitrary values", () => {
      const merge = createTwMerge({});

      expect(merge("hover:px-2 hover:px-4 px-1")).toBe("hover:px-4 px-1");
      expect(merge("dark:hover:bg-red-500 dark:hover:bg-blue-500")).toBe("dark:hover:bg-blue-500");
      expect(merge("!px-2 px-4")).toBe("!px-2 px-4");
      expect(merge("px-2 !px-4")).toBe("px-2 !px-4");
      expect(merge("text-lg/2 text-sm")).toBe("text-sm");
      expect(merge("w-1/2 w-full")).toBe("w-full");
      expect(merge("text-[21px] text-lg")).toBe("text-lg");
      expect(merge("bg-[#000] bg-red-500")).toBe("bg-red-500");
    });

    test("prefix merges prefixed classes and treats unprefixed as external", () => {
      const merge = createTwMerge({prefix: "tw"});

      expect(merge("tw:px-2 tw:px-4")).toBe("tw:px-4");
      expect(merge("px-2 px-4")).toBe("px-2 px-4");
    });
  });

  describe("default-config patches from tailwind-merge main", () => {
    test("axis shorthands override logical sides", () => {
      const merge = createTwMerge({});

      expect(merge("ps-2 px-4")).toBe("px-4");
      expect(merge("pe-2 px-4")).toBe("px-4");
      expect(merge("px-4 ps-2")).toBe("px-4 ps-2");
      expect(merge("pbs-2 py-4")).toBe("py-4");
      expect(merge("ms-2 mx-4")).toBe("mx-4");
      expect(merge("mbe-2 my-4")).toBe("my-4");
      expect(merge("start-2 inset-x-4")).toBe("inset-x-4");
      expect(merge("end-2 inset-x-4")).toBe("inset-x-4");
      expect(merge("inset-bs-2 inset-y-4")).toBe("inset-y-4");
      expect(merge("border-s-2 border-x-4")).toBe("border-x-4");
      expect(merge("border-be-2 border-y-4")).toBe("border-y-4");
      expect(merge("border-s-red-500 border-x-blue-500")).toBe("border-x-blue-500");
      expect(merge("border-bs-red-500 border-y-blue-500")).toBe("border-y-blue-500");
      expect(merge("scroll-ms-2 scroll-mx-4")).toBe("scroll-mx-4");
      expect(merge("scroll-mbs-2 scroll-my-4")).toBe("scroll-my-4");
      expect(merge("scroll-ps-2 scroll-px-4")).toBe("scroll-px-4");
      expect(merge("scroll-pbe-2 scroll-py-4")).toBe("scroll-py-4");
    });

    test("shadow-inner conflicts with shadow utilities, not shadow color", () => {
      const merge = createTwMerge({});

      expect(merge("shadow-inner shadow-lg")).toBe("shadow-lg");
      expect(merge("shadow-lg shadow-inner")).toBe("shadow-inner");
      expect(merge("shadow-initial shadow-inner")).toBe("shadow-initial shadow-inner");
    });

    test("leading-none still merges when the leading theme scale is overridden", () => {
      const merge = createTwMerge({
        override: {
          theme: {
            leading: ["tight"],
          },
        },
      });

      expect(merge("leading-tight leading-none")).toBe("leading-none");
      expect(merge("leading-none leading-tight")).toBe("leading-tight");
      expect(merge("leading-4 leading-none")).toBe("leading-none");
    });
  });
});

/*
 * Grammar gaps filled from shadcn-ui/cn#74 (cn@0.2.6): open-ended animation
 * names, containment flags that compose, Tailwind v3 gradient directions,
 * and v4 utilities tailwind-merge 3.6.0 does not know. These are recorded
 * additions over 3.6.0, so they are pinned as text.
 */
describe("grammar additions from shadcn-ui/cn#74", () => {
  test.each([
    ["animate-spin animate-wiggle", "animate-wiggle"],
    ["animate-accordion-down animate-spin", "animate-spin"],
    [
      "animate-wiggle animate-[wiggle_1s_ease-in-out_infinite]",
      "animate-[wiggle_1s_ease-in-out_infinite]",
    ],
    ["animate-(--animation) animate-none", "animate-none"],
    ["motion-safe:animate-spin motion-safe:animate-in", "motion-safe:animate-in"],
    ["animate-spin hover:animate-in", "animate-spin hover:animate-in"],
  ])("custom animation names share the animate group: %s", (input, expected) => {
    expect(cn(input)).toBe(expected);
  });

  test.each([
    ["contain-none contain-strict", "contain-strict"],
    ["contain-content contain-[layout_paint]", "contain-[layout_paint]"],
    ["contain-size contain-inline-size", "contain-inline-size"],
    ["contain-layout contain-paint", "contain-layout contain-paint"],
    ["contain-inline-size contain-style", "contain-inline-size contain-style"],
    ["contain-size contain-layout contain-paint contain-style contain-none", "contain-none"],
    [
      "contain-none contain-size contain-layout contain-paint contain-style",
      "contain-size contain-layout contain-paint contain-style",
    ],
    ["contain-size contain-none contain-layout", "contain-size contain-layout"],
    ["hover:contain-paint hover:contain-content", "hover:contain-content"],
    ["contain-layout container", "contain-layout container"],
  ])("containment flags compose and resets clear them: %s", (input, expected) => {
    expect(cn(input)).toBe(expected);
  });

  test.each([
    ["bg-gradient-to-t bg-gradient-to-r", "bg-gradient-to-r"],
    ["bg-gradient-to-r bg-linear-to-r", "bg-linear-to-r"],
    ["bg-linear-to-r bg-gradient-to-l", "bg-gradient-to-l"],
    ["bg-gradient-to-r bg-none", "bg-none"],
    ["bg-radial bg-gradient-to-r", "bg-gradient-to-r"],
    ["bg-gradient-to-r bg-red-500", "bg-gradient-to-r bg-red-500"],
    ["bg-gradient-to-r from-red-500", "bg-gradient-to-r from-red-500"],
    ["bg-linear-to-r bg-conic", "bg-conic"],
  ])("legacy gradient directions share the background-image group: %s", (input, expected) => {
    expect(cn(input)).toBe(expected);
  });

  test.each([
    ["columns-3 columns-auto", "columns-auto"],
    ["max-h-8 max-h-none", "max-h-none"],
    ["inline-8 inline-xs", "inline-xs"],
    ["min-inline-8 min-inline-xs", "min-inline-xs"],
    ["max-inline-8 max-inline-xs", "max-inline-xs"],
    ["auto-cols-fr auto-cols-16", "auto-cols-16"],
    ["auto-rows-fr auto-rows-12", "auto-rows-12"],
  ])("newer v4 literals join their groups: %s", (input, expected) => {
    expect(cn(input)).toBe(expected);
  });
});
