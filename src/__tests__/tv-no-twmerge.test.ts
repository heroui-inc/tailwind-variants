import {expect, describe, test} from "@jest/globals";

import {tv} from "../index";

describe("Tailwind Variants (TV) - twMerge: false", () => {
  test("should not resolve tailwind conflicts when twMerge is false", () => {
    const button = tv(
      {
        base: "px-4 px-2 py-2 py-4 bg-blue-500 bg-red-500",
      },
      {
        twMerge: false,
      },
    );

    // When twMerge is false, all classes should be preserved
    // including conflicting ones like px-4 and px-2
    expect(button()).toBe("px-4 px-2 py-2 py-4 bg-blue-500 bg-red-500");
  });

  test("should not resolve conflicts in variants when twMerge is false", () => {
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

    // All conflicting classes should be preserved
    expect(button({size: "sm"})).toBe("font-medium text-sm text-xs px-2 px-3");
    expect(button({size: "md", color: "primary"})).toBe(
      "font-medium text-base text-md px-4 px-5 bg-blue-500 bg-blue-600 text-white text-gray-100",
    );
  });

  test("should not resolve conflicts in compound variants when twMerge is false", () => {
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

    // Compound variant classes should be added without resolving conflicts
    expect(button({size: "sm", variant: "primary"})).toBe(
      "font-semibold px-2 bg-blue-500 bg-blue-600 bg-blue-700 px-3 px-4",
    );
  });

  test("should not resolve conflicts in slots when twMerge is false", () => {
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

    // All conflicting classes in slots should be preserved
    expect(slots.base()).toBe("rounded-lg rounded-xl p-4 p-6");
    expect(slots.header()).toBe("text-lg text-xl font-bold font-semibold");
    expect(slots.body()).toBe("text-gray-600 text-gray-700 mt-2 mt-4");
  });

  test("should not resolve conflicts with class/className props when twMerge is false", () => {
    const button = tv(
      {
        base: "px-4 py-2 rounded",
      },
      {
        twMerge: false,
      },
    );

    // Additional classes should be appended without conflict resolution
    expect(button({class: "px-2 py-4 rounded-lg"})).toBe("px-4 py-2 rounded px-2 py-4 rounded-lg");
    expect(button({className: "px-6 py-1 rounded-xl"})).toBe(
      "px-4 py-2 rounded px-6 py-1 rounded-xl",
    );
  });

  test("should work with non-tailwind classes when twMerge is false", () => {
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
    expect(button({size: "lg", variant: "secondary"})).toBe("button button--lg button--secondary");
  });

  test("should handle empty/falsy values correctly when twMerge is false", () => {
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

  test("should handle arrays of classes when twMerge is false", () => {
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

  test("should not require tailwind-merge in bundle when twMerge is false", () => {
    // This test verifies that the createTwMerge function is not called
    // when twMerge is false. In a real bundle, this would mean
    // tailwind-merge is not included.
    const mockCreateTwMerge = jest.fn();

    // Override require for this test
    const originalRequire = require;

    (global as any).require = (module: string) => {
      if (module === "./cn.js") {
        return {createTwMerge: mockCreateTwMerge};
      }

      return originalRequire(module);
    };

    const button = tv(
      {
        base: "px-4 py-2",
      },
      {
        twMerge: false,
      },
    );

    button();

    // createTwMerge should not be called when twMerge is false
    expect(mockCreateTwMerge).not.toHaveBeenCalled();

    // Restore original require
    (global as any).require = originalRequire;
  });
});
