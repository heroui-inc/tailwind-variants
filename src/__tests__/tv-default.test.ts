import {describe, expect, test} from "vitest";

import {tv} from "../index";

describe("tv", () => {
  test("flattens nested class arrays", () => {
    const menu = tv({
      base: ["base--styles-1", ["base--styles-2", ["base--styles-3"]]],
      slots: {
        item: ["slots--item-1", ["slots--item-2", ["slots--item-3"]]],
      },
      variants: {
        color: {
          primary: {
            item: [
              "item--color--primary-1",
              ["item--color--primary-2", ["item--color--primary-3"]],
            ],
          },
        },
      },
    });

    const popover = tv({
      variants: {
        isOpen: {
          true: ["isOpen--true-1", ["isOpen--true-2", ["isOpen--true-3"]]],
          false: ["isOpen--false-1", ["isOpen--false-2", ["isOpen--false-3"]]],
        },
      },
    });

    const {base, item} = menu({color: "primary"});

    expect(base()).toHaveClass(["base--styles-1", "base--styles-2", "base--styles-3"]);
    expect(item()).toHaveClass([
      "slots--item-1",
      "slots--item-2",
      "slots--item-3",
      "item--color--primary-1",
      "item--color--primary-2",
      "item--color--primary-3",
    ]);
    expect(popover({isOpen: true})).toHaveClass([
      "isOpen--true-1",
      "isOpen--true-2",
      "isOpen--true-3",
    ]);
    expect(popover({isOpen: false})).toHaveClass([
      "isOpen--false-1",
      "isOpen--false-2",
      "isOpen--false-3",
    ]);
  });

  test("returns base classes without variants", () => {
    const h1 = tv({
      base: "text-3xl font-bold",
    });

    const expectedResult = "text-3xl font-bold";
    const result = h1();

    expect(result).toBe(expectedResult);
  });

  test("supports variants", () => {
    const h1 = tv({
      base: "text-3xl font-bold",
      variants: {
        isBig: {
          true: "text-5xl",
          false: "text-2xl",
        },
        color: {
          red: "text-red-500",
          blue: "text-blue-500",
        },
      },
    });

    const result = h1({
      isBig: true,
      color: "blue",
    });

    const expectedResult = ["text-5xl", "font-bold", "text-blue-500"];

    expect(result).toHaveClass(expectedResult);
  });

  test("supports variantKeys", () => {
    const h1 = tv({
      base: "text-3xl font-bold",
      variants: {
        isBig: {
          true: "text-5xl",
          false: "text-2xl",
        },
        color: {
          red: "text-red-500",
          blue: "text-blue-500",
        },
      },
    });

    const expectedResult = ["isBig", "color"];

    expect(h1.variantKeys).toHaveClass(expectedResult);
  });

  test("supports compoundVariants", () => {
    const h1 = tv({
      base: "text-3xl font-bold",
      variants: {
        isBig: {
          true: "text-5xl",
          false: "text-2xl",
        },
        color: {
          red: "text-red-500",
          blue: "text-blue-500",
        },
      },
      compoundVariants: [
        {
          isBig: true,
          color: "red",
          class: "bg-red-500",
        },
        {
          isBig: false,
          color: "red",
          class: "underline",
        },
      ],
    });

    expect(
      h1({
        isBig: true,
        color: "red",
      }),
    ).toHaveClass(["text-5xl", "font-bold", "text-red-500", "bg-red-500"]);

    expect(
      h1({
        isBig: false,
        color: "red",
      }),
    ).toHaveClass(["text-2xl", "font-bold", "text-red-500", "underline"]);

    expect(
      h1({
        color: "red",
      }),
    ).toHaveClass(["text-2xl", "font-bold", "text-red-500", "underline"]);
  });

  test("treats missing boolean variants as false in compoundVariants", () => {
    const element = tv({
      variants: {
        color: {
          blue: "color-blue",
        },
        monochrome: {
          true: "monochrome",
        },
      },
      compoundVariants: [
        {
          color: "blue",
          monochrome: false,
          class: "scalar-false",
        },
        {
          color: "blue",
          monochrome: [false],
          class: "array-false",
        },
        {
          color: "blue",
          monochrome: [false, undefined],
          class: "array-explicit-undefined",
        },
      ],
    });

    expect(element({color: "blue"})).toHaveClass([
      "color-blue",
      "scalar-false",
      "array-false",
      "array-explicit-undefined",
    ]);
    expect(element({color: "blue", monochrome: false})).toHaveClass([
      "color-blue",
      "scalar-false",
      "array-false",
      "array-explicit-undefined",
    ]);
    expect(element({color: "blue", monochrome: true})).toHaveClass(["color-blue", "monochrome"]);
  });

  test("throws when compoundVariants is not an array", () => {
    expect(
      tv({
        base: "text-3xl font-bold",
        variants: {
          isBig: {
            true: "text-5xl",
            false: "text-2xl",
          },
          color: {
            red: "text-red-500",
            blue: "text-blue-500",
          },
        },
        // @ts-expect-error
        compoundVariants: {},
      }),
    ).toThrow();
  });

  test("supports custom class and className", () => {
    const h1 = tv({
      base: "text-3xl font-bold",
    });

    const expectedResult = ["text-xl", "font-bold"];

    const result1 = h1({
      className: "text-xl",
    });

    const result2 = h1({
      class: "text-xl",
    });

    expect(result1).toHaveClass(expectedResult);
    expect(result2).toHaveClass(expectedResult);
  });

  test("returns an empty result without configuration", () => {
    const styles = tv({});
    const expectedResult = undefined;

    expect(styles()).toBe(expectedResult);
  });

  test("merges conflicting classes when twMerge is enabled", () => {
    const h1 = tv({
      base: "text-3xl font-bold text-blue-400 text-xl text-blue-200",
    });

    const expectedResult = ["font-bold", "text-xl", "text-blue-200"];

    expect(h1()).toHaveClass(expectedResult);
  });

  test("preserves conflicting classes when twMerge is disabled", () => {
    const h1 = tv(
      {
        base: "text-3xl font-bold text-blue-400 text-xl text-blue-200",
      },
      {
        twMerge: false,
      },
    );

    const expectedResult = ["text-3xl", "font-bold", "text-blue-400", "text-xl", "text-blue-200"];

    expect(h1()).toHaveClass(expectedResult);
  });

  test("supports variants without defaultVariants", () => {
    const button = tv({
      base: "button",
      variants: {
        variant: {
          primary: "button--primary",
          secondary: "button--secondary",
          warning: "button--warning",
          error: "button--danger",
        },
        isDisabled: {
          true: "button--disabled",
          false: "button--enabled",
        },
        size: {
          small: "button--small",
          medium: "button--medium",
          large: "button--large",
        },
      },
      compoundVariants: [
        {
          variant: "secondary",
          size: "small",
          class: "button--secondary-small",
        },
        {
          variant: "warning",
          isDisabled: false,
          class: "button--warning-enabled",
        },
        {
          variant: "warning",
          isDisabled: true,
          class: "button--warning-disabled",
        },
        {
          variant: ["warning", "error"],
          class: "button--warning-danger",
        },
        {
          variant: ["warning", "error"],
          size: "medium",
          class: "button--warning-danger-medium",
        },
      ],
    });

    const expectedResult = [
      "button",
      "button--secondary",
      "button--small",
      "button--enabled",
      "button--secondary-small",
    ];

    expect(button({variant: "secondary", size: "small", isDisabled: false})).toHaveClass(
      expectedResult,
    );
  });

  test("supports simple variants", () => {
    const h1 = tv({
      base: "text-3xl font-bold underline",
      variants: {
        color: {
          red: "text-red-500",
          blue: "text-blue-500",
          green: "text-green-500",
        },
        isUnderline: {
          true: "underline",
          false: "no-underline",
        },
      },
    });

    const expectedResult = "text-3xl font-bold text-green-500 no-underline";

    expect(h1({color: "green", isUnderline: false})).toBe(expectedResult);
  });

  test("supports boolean variants", () => {
    const h1 = tv({
      base: "text-3xl",
      variants: {
        bool: {
          true: "underline",
          false: "truncate",
        },
      },
    });

    expect(h1()).toHaveClass(["text-3xl", "truncate"]);
    expect(h1({bool: true})).toHaveClass(["text-3xl", "underline"]);
    expect(h1({bool: false})).toHaveClass(["text-3xl", "truncate"]);
    expect(h1({bool: undefined})).toHaveClass(["text-3xl", "truncate"]);
  });

  test("supports a false-only variant", () => {
    const h1 = tv({
      base: "text-3xl",
      variants: {
        bool: {
          false: "truncate",
        },
      },
    });

    expect(h1()).toHaveClass(["text-3xl", "truncate"]);
    expect(h1({bool: true})).toHaveClass(["text-3xl"]);
    expect(h1({bool: false})).toHaveClass(["text-3xl", "truncate"]);
    expect(h1({bool: undefined})).toHaveClass(["text-3xl", "truncate"]);
  });

  test("supports a false-only default variant", () => {
    const h1 = tv({
      base: "text-3xl",
      variants: {
        bool: {
          false: "truncate",
        },
      },
      defaultVariants: {
        bool: true,
      },
    });

    expect(h1()).toHaveClass(["text-3xl"]);
    expect(h1({bool: true})).toHaveClass(["text-3xl"]);
    expect(h1({bool: false})).toHaveClass(["text-3xl", "truncate"]);
    expect(h1({bool: undefined})).toHaveClass(["text-3xl"]);
  });

  test("supports boolean default variants", () => {
    const h1 = tv({
      base: "text-3xl",
      variants: {
        bool: {
          true: "underline",
          false: "truncate",
        },
      },
      defaultVariants: {
        bool: true,
      },
    });

    expect(h1()).toHaveClass(["text-3xl", "underline"]);
    expect(h1({bool: true})).toHaveClass(["text-3xl", "underline"]);
    expect(h1({bool: false})).toHaveClass(["text-3xl", "truncate"]);
    expect(h1({bool: undefined})).toHaveClass(["text-3xl", "underline"]);
  });

  test("supports boolean variants without a false branch", () => {
    const h1 = tv({
      base: "text-3xl",
      variants: {
        bool: {
          true: "underline",
        },
      },
    });

    expect(h1()).toHaveClass(["text-3xl"]);
    expect(h1({bool: true})).toHaveClass(["text-3xl", "underline"]);
    expect(h1({bool: false})).toHaveClass(["text-3xl"]);
    expect(h1({bool: undefined})).toHaveClass(["text-3xl"]);
  });

  test("supports boolean defaults without a false branch", () => {
    const h1 = tv({
      base: "text-3xl",
      variants: {
        bool: {
          true: "underline",
        },
      },
      defaultVariants: {
        bool: true,
      },
    });

    expect(h1()).toHaveClass(["text-3xl", "underline"]);
    expect(h1({bool: true})).toHaveClass(["text-3xl", "underline"]);
    expect(h1({bool: false})).toHaveClass(["text-3xl"]);
    expect(h1({bool: undefined})).toHaveClass(["text-3xl", "underline"]);
  });

  test("supports compound className and null variant overrides", () => {
    const button = tv({
      base: "base",
      variants: {
        color: {
          red: "text-red-500",
          blue: "text-blue-500",
        },
      },
      defaultVariants: {color: "red"},
      compoundVariants: [{color: "red", className: "font-bold"}],
    });

    expect(button()).toBe("base text-red-500 font-bold");
    // @ts-expect-error runtime compatibility coverage for JavaScript consumers
    expect(button({color: null})).toBe("base");
  });

  test("preserves mutations to existing compound metadata", () => {
    const button = tv({
      variants: {
        color: {
          red: "text-red-500",
          blue: "text-blue-500",
        },
      },
      compoundVariants: [{color: "red", class: "font-normal"}],
    });

    expect(button({color: "red"})).toBe("text-red-500 font-normal");

    button.compoundVariants[0].color = "blue";
    button.compoundVariants[0].class = "font-bold";

    expect(button({color: "red"})).toBe("text-red-500");
    expect(button({color: "blue"})).toBe("text-blue-500 font-bold");
  });
});
