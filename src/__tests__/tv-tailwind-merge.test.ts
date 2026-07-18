import {describe, expect, test} from "vitest";

import {tv} from "../index";

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
