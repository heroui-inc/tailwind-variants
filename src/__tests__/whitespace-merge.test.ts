import {describe, expect, test} from "vitest";

import {cn, cnMerge, tv} from "../index";

describe("whitespace-separated class merging", () => {
  test("merges conflicts across newlines and tabs", () => {
    expect(cn("px-2\npx-4")).toBe("px-4");
    expect(cn("px-2\tpx-4")).toBe("px-4");
    expect(cn("px-2\r\npx-4")).toBe("px-4");
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
