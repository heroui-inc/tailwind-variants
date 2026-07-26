import {extendTailwindMerge, twMerge} from "tailwind-merge";
import {afterEach, describe, expect, test} from "vitest";

import {cn, cnMerge, createTV, tv} from "../index";
import {createMerger} from "../internal/merge/index.js";
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

describe("parity with tailwind-merge (default config)", () => {
  test.each(defaultCases)("mergeString %#: %s", (input) => {
    expect(createMerger().mergeString(input)).toBe(twMerge(input));
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
    const merge = createMerger(extendConfig);
    const input = "text-foreground text-24-regular";

    expect(merge.mergeString(input)).toBe(twm(input));
    expect(cnMerge(input)({twMergeConfig: extendConfig})).toBe(twm(input));
    expect(merge.mergeString("text-24-regular text-24-medium")).toBe(
      twm("text-24-regular text-24-medium"),
    );
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
    const merge = createMerger(overrideConfig);

    expect(merge.mergeString("text-24-regular text-sm")).toBe(twm("text-24-regular text-sm"));
    expect(merge.mergeString("text-sm text-lg")).toBe(twm("text-sm text-lg"));
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
    const merge = createMerger(config);

    expect(merge.mergeString("foo-a bar-a")).toBe(twm("foo-a bar-a"));
    expect(merge.mergeString("bar-a foo-b")).toBe(twm("bar-a foo-b"));
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
