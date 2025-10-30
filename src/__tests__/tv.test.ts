import {expect, describe, test} from "@jest/globals";

import {tv, cnMerge} from "../index";

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
      "min-w": [
        {
          "min-w": ["unit", "unit-2", "unit-4", "unit-6"],
        },
      ],
    },
  },
};

describe("Tailwind Variants (TV) - Default", () => {
  test("should work with nested arrays", () => {
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

  test("should work without variants", () => {
    const h1 = tv({
      base: "text-3xl font-bold",
    });

    const expectedResult = "text-3xl font-bold";
    const result = h1();

    expect(result).toBe(expectedResult);
  });

  test("should work with variants", () => {
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

  test("should work with variantKeys", () => {
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

  test("should work with compoundVariants", () => {
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

  test("should throw error if the compoundVariants is not an array", () => {
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

  test("should work with custom class & className", () => {
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

  test("should work without anything", () => {
    const styles = tv({});
    const expectedResult = undefined;

    expect(styles()).toBe(expectedResult);
  });

  test("should work correctly with twMerge", () => {
    const h1 = tv({
      base: "text-3xl font-bold text-blue-400 text-xl text-blue-200",
    });

    const expectedResult = ["font-bold", "text-xl", "text-blue-200"];

    expect(h1()).toHaveClass(expectedResult);
  });

  test("should work correctly without twMerge", () => {
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

  test("should work without defaultsVariants", () => {
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

  test("should work with simple variants", () => {
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

  test("should support boolean variants", () => {
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

  test("should support false only variant", () => {
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

  test("should support false only variant -- default variant", () => {
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

  test("should support boolean variants -- default variants", () => {
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

  test("should support boolean variants -- missing false variant", () => {
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

  test("should support boolean variants -- missing false variant -- default variants", () => {
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
});

describe("Tailwind Variants (TV) - Slots", () => {
  test("should work with slots -- default variants", () => {
    const menu = tv({
      base: "text-3xl font-bold underline",
      slots: {
        title: "text-2xl",
        item: "text-xl",
        list: "list-none",
        wrapper: "flex flex-col",
      },
      variants: {
        color: {
          primary: "color--primary",
          secondary: {
            title: "color--primary-title",
            item: "color--primary-item",
            list: "color--primary-list",
            wrapper: "color--primary-wrapper",
          },
        },
        size: {
          xs: "size--xs",
          sm: "size--sm",
          md: {
            title: "size--md-title",
          },
        },
        isDisabled: {
          true: {
            title: "disabled--title",
          },
          false: {
            item: "enabled--item",
          },
        },
      },
      defaultVariants: {
        color: "primary",
        size: "sm",
        isDisabled: false,
      },
    });

    // with default values
    const {base, title, item, list, wrapper} = menu();

    expect(base()).toHaveClass([
      "text-3xl",
      "font-bold",
      "underline",
      "color--primary",
      "size--sm",
    ]);
    expect(title()).toHaveClass(["text-2xl"]);
    expect(item()).toHaveClass(["text-xl", "enabled--item"]);
    expect(list()).toHaveClass(["list-none"]);
    expect(wrapper()).toHaveClass(["flex", "flex-col"]);
  });

  test("should work with empty slots", () => {
    const menu = tv({
      slots: {
        base: "",
        title: "",
        item: "",
        list: "",
      },
    });

    const {base, title, item, list} = menu();

    const expectedResult = undefined;

    expect(base()).toBe(expectedResult);
    expect(title()).toBe(expectedResult);
    expect(item()).toBe(expectedResult);
    expect(list()).toBe(expectedResult);
  });

  test("should work with slots -- default variants -- custom class & className", () => {
    const menu = tv({
      slots: {
        base: "text-3xl font-bold underline",
        title: "text-2xl",
        item: "text-xl",
        list: "list-none",
        wrapper: "flex flex-col",
      },
      variants: {
        color: {
          primary: {
            base: "bg-blue-500",
          },
          secondary: {
            title: "text-white",
            item: "bg-purple-100",
            list: "bg-purple-200",
            wrapper: "bg-transparent",
          },
        },
        size: {
          xs: {
            base: "text-xs",
          },
          sm: {
            base: "text-sm",
          },
          md: {
            title: "text-md",
          },
        },
        isDisabled: {
          true: {
            title: "opacity-50",
          },
          false: {
            item: "opacity-100",
          },
        },
      },
      defaultVariants: {
        color: "primary",
        size: "sm",
        isDisabled: false,
      },
    });

    // with default values
    const {base, title, item, list, wrapper} = menu();

    // base
    expect(base({class: "text-lg"})).toHaveClass([
      "font-bold",
      "underline",
      "bg-blue-500",
      "text-lg",
    ]);
    expect(base({className: "text-lg"})).toHaveClass([
      "font-bold",
      "underline",
      "bg-blue-500",
      "text-lg",
    ]);
    // title
    expect(title({class: "text-2xl"})).toHaveClass(["text-2xl"]);
    expect(title({className: "text-2xl"})).toHaveClass(["text-2xl"]);
    // item
    expect(item({class: "text-sm"})).toHaveClass(["text-sm", "opacity-100"]);
    expect(list({className: "bg-blue-50"})).toHaveClass(["list-none", "bg-blue-50"]);
    // list
    expect(wrapper({class: "flex-row"})).toHaveClass(["flex", "flex-row"]);
    expect(wrapper({className: "flex-row"})).toHaveClass(["flex", "flex-row"]);
  });

  test("should work with slots -- custom variants", () => {
    const menu = tv({
      base: "text-3xl font-bold underline",
      slots: {
        title: "text-2xl",
        item: "text-xl",
        list: "list-none",
        wrapper: "flex flex-col",
      },
      variants: {
        color: {
          primary: "color--primary",
          secondary: {
            base: "color--secondary-base",
            title: "color--secondary-title",
            item: "color--secondary-item",
            list: "color--secondary-list",
            wrapper: "color--secondary-wrapper",
          },
        },
        size: {
          xs: "size--xs",
          sm: "size--sm",
          md: {
            title: "size--md-title",
          },
        },
        isDisabled: {
          true: {
            title: "disabled--title",
          },
          false: {
            item: "enabled--item",
          },
        },
      },
      defaultVariants: {
        color: "primary",
        size: "sm",
        isDisabled: false,
      },
    });

    // with custom props
    const {base, title, item, list, wrapper} = menu({
      color: "secondary",
      size: "md",
    });

    expect(base()).toHaveClass(["text-3xl", "font-bold", "underline", "color--secondary-base"]);
    expect(title()).toHaveClass(["text-2xl", "size--md-title", "color--secondary-title"]);
    expect(item()).toHaveClass(["text-xl", "color--secondary-item", "enabled--item"]);
    expect(list()).toHaveClass(["list-none", "color--secondary-list"]);
    expect(wrapper()).toHaveClass(["flex", "flex-col", "color--secondary-wrapper"]);
  });

  test("should work with slots -- custom variants -- custom class & className", () => {
    const menu = tv({
      slots: {
        base: "text-3xl font-bold underline",
        title: "text-2xl",
        item: "text-xl",
        list: "list-none",
        wrapper: "flex flex-col",
      },
      variants: {
        color: {
          primary: {
            base: "bg-blue-500",
          },
          secondary: {
            title: "text-white",
            item: "bg-purple-100",
            list: "bg-purple-200",
            wrapper: "bg-transparent",
          },
        },
        size: {
          xs: {
            base: "text-xs",
          },
          sm: {
            base: "text-sm",
          },
          md: {
            base: "text-md",
            title: "text-md",
          },
        },
        isDisabled: {
          true: {
            title: "opacity-50",
          },
          false: {
            item: "opacity-100",
          },
        },
      },
      defaultVariants: {
        color: "primary",
        size: "sm",
        isDisabled: false,
      },
    });

    // with default values
    const {base, title, item, list, wrapper} = menu({
      color: "secondary",
      size: "md",
    });

    // base
    expect(base({class: "text-xl"})).toHaveClass(["text-xl", "font-bold", "underline"]);
    expect(base({className: "text-xl"})).toHaveClass(["text-xl", "font-bold", "underline"]);
    // title
    expect(title({class: "text-2xl"})).toHaveClass(["text-2xl", "text-white"]);
    expect(title({className: "text-2xl"})).toHaveClass(["text-2xl", "text-white"]);
    //item
    expect(item({class: "bg-purple-50"})).toHaveClass(["text-xl", "bg-purple-50", "opacity-100"]);
    expect(item({className: "bg-purple-50"})).toHaveClass([
      "text-xl",
      "bg-purple-50",
      "opacity-100",
    ]);
    // list
    expect(list({class: "bg-purple-100"})).toHaveClass(["list-none", "bg-purple-100"]);
    expect(list({className: "bg-purple-100"})).toHaveClass(["list-none", "bg-purple-100"]);
    // wrapper
    expect(wrapper({class: "bg-purple-900 flex-row"})).toHaveClass([
      "flex",
      "bg-purple-900",
      "flex-row",
    ]);
    expect(wrapper({className: "bg-purple-900 flex-row"})).toHaveClass([
      "flex",
      "bg-purple-900",
      "flex-row",
    ]);
  });

  test("should work with slots and compoundVariants", () => {
    const menu = tv({
      base: "text-3xl font-bold underline",
      slots: {
        title: "text-2xl",
        item: "text-xl",
        list: "list-none",
        wrapper: "flex flex-col",
      },
      variants: {
        color: {
          primary: "color--primary",
          secondary: {
            base: "color--secondary-base",
            title: "color--secondary-title",
            item: "color--secondary-item",
            list: "color--secondary-list",
            wrapper: "color--secondary-wrapper",
          },
        },
        size: {
          xs: "size--xs",

          sm: "size--sm",
          md: {
            title: "size--md-title",
          },
        },
        isDisabled: {
          true: {
            title: "disabled--title",
          },
          false: {
            item: "enabled--item",
          },
        },
      },
      defaultVariants: {
        color: "primary",
        size: "sm",
        isDisabled: false,
      },
      compoundVariants: [
        {
          color: "secondary",
          size: "md",
          class: {
            base: "compound--base",
            title: "compound--title",
            item: "compound--item",
            list: "compound--list",
            wrapper: "compound--wrapper",
          },
        },
      ],
    });

    const {base, title, item, list, wrapper} = menu({
      color: "secondary",
      size: "md",
    });

    expect(base()).toHaveClass([
      "text-3xl",
      "font-bold",
      "underline",
      "color--secondary-base",
      "compound--base",
    ]);
    expect(title()).toHaveClass([
      "text-2xl",
      "size--md-title",
      "color--secondary-title",
      "compound--title",
    ]);
    expect(item()).toHaveClass([
      "text-xl",
      "color--secondary-item",
      "enabled--item",
      "compound--item",
    ]);
    expect(list()).toHaveClass(["list-none", "color--secondary-list", "compound--list"]);
    expect(wrapper()).toHaveClass([
      "flex",
      "flex-col",
      "color--secondary-wrapper",
      "compound--wrapper",
    ]);
  });

  test("should support slot level variant overrides", () => {
    const menu = tv({
      base: "text-3xl",
      slots: {
        title: "text-2xl",
      },
      variants: {
        color: {
          primary: {
            base: "color--primary-base",
            title: "color--primary-title",
          },
          secondary: {
            base: "color--secondary-base",
            title: "color--secondary-title",
          },
        },
      },
      defaultVariants: {
        color: "primary",
      },
    });

    const {base, title} = menu();

    expect(base()).toHaveClass(["text-3xl", "color--primary-base"]);
    expect(title()).toHaveClass(["text-2xl", "color--primary-title"]);
    expect(base({color: "secondary"})).toHaveClass(["text-3xl", "color--secondary-base"]);
    expect(title({color: "secondary"})).toHaveClass(["text-2xl", "color--secondary-title"]);
  });

  test("should support slot level variant overrides - compoundSlots", () => {
    const menu = tv({
      base: "text-3xl",
      slots: {
        title: "text-2xl",
        subtitle: "text-xl",
      },
      variants: {
        color: {
          primary: {
            base: "color--primary-base",
            title: "color--primary-title",
            subtitle: "color--primary-subtitle",
          },
          secondary: {
            base: "color--secondary-base",
            title: "color--secondary-title",
            subtitle: "color--secondary-subtitle",
          },
        },
      },
      compoundSlots: [
        {
          slots: ["title", "subtitle"],
          color: "secondary",
          class: ["truncate"],
        },
      ],
      defaultVariants: {
        color: "primary",
      },
    });

    const {base, title, subtitle} = menu();

    expect(base()).toHaveClass(["text-3xl", "color--primary-base"]);
    expect(title()).toHaveClass(["text-2xl", "color--primary-title"]);
    expect(subtitle()).toHaveClass(["text-xl", "color--primary-subtitle"]);
    expect(base({color: "secondary"})).toHaveClass(["text-3xl", "color--secondary-base"]);
    expect(title({color: "secondary"})).toHaveClass([
      "text-2xl",
      "color--secondary-title",
      "truncate",
    ]);
    expect(subtitle({color: "secondary"})).toHaveClass([
      "text-xl",
      "color--secondary-subtitle",
      "truncate",
    ]);
  });

  test("should support slot level variant and array variants overrides - compoundSlots", () => {
    const menu = tv({
      slots: {
        base: "flex flex-wrap",
        cursor: ["absolute", "flex", "overflow-visible"],
      },
      variants: {
        size: {
          xs: {},
          sm: {},
        },
      },
      compoundSlots: [
        {
          slots: ["base"],
          size: ["xs", "sm"],
          class: "w-7 h-7 text-xs",
        },
      ],
    });

    const {base, cursor} = menu();

    expect(base()).toEqual("flex flex-wrap");
    expect(base({size: "xs"})).toEqual("flex flex-wrap w-7 h-7 text-xs");
    expect(base({size: "sm"})).toEqual("flex flex-wrap w-7 h-7 text-xs");
    expect(cursor()).toEqual("absolute flex overflow-visible");
  });

  test("should not override the default classes when the variant doesn't match - compoundSlots", () => {
    const tabs = tv({
      slots: {
        base: "inline-flex",
        tabList: ["flex"],
        tab: ["z-0", "w-full", "px-3", "py-1", "flex", "group", "relative"],
        tabContent: ["relative", "z-10", "text-inherit", "whitespace-nowrap"],
        cursor: ["absolute", "z-0", "bg-white"],
        panel: ["py-3", "px-1", "outline-none"],
      },
      variants: {
        variant: {
          solid: {},
          light: {},
          underlined: {},
          bordered: {},
        },
        color: {
          default: {},
          primary: {},
          secondary: {},
          success: {},
          warning: {},
          danger: {},
        },
        size: {
          sm: {
            tabList: "rounded-md",
            tab: "h-7 text-xs rounded-sm",
            cursor: "rounded-sm",
          },
          md: {
            tabList: "rounded-md",
            tab: "h-8 text-sm rounded-sm",
            cursor: "rounded-sm",
          },
          lg: {
            tabList: "rounded-lg",
            tab: "h-9 text-md rounded-md",
            cursor: "rounded-md",
          },
        },
        radius: {
          none: {
            tabList: "rounded-none",
            tab: "rounded-none",
            cursor: "rounded-none",
          },
          sm: {
            tabList: "rounded-md",
            tab: "rounded-sm",
            cursor: "rounded-sm",
          },
          md: {
            tabList: "rounded-md",
            tab: "rounded-sm",
            cursor: "rounded-sm",
          },
          lg: {
            tabList: "rounded-lg",
            tab: "rounded-md",
            cursor: "rounded-md",
          },
          full: {
            tabList: "rounded-full",
            tab: "rounded-full",
            cursor: "rounded-full",
          },
        },
      },
      defaultVariants: {
        color: "default",
        variant: "solid",
        size: "md",
      },
      compoundSlots: [
        {
          variant: "underlined",
          slots: ["tab", "tabList", "cursor"],
          class: ["rounded-none"],
        },
      ],
    });

    const {tab, tabList, cursor} = tabs();

    expect(tab()).toHaveClass([
      "z-0",
      "w-full",
      "px-3",
      "py-1",
      "h-8",
      "flex",
      "group",
      "relative",
      "text-sm",
      "rounded-sm",
    ]);
    expect(tabList()).toHaveClass(["flex", "rounded-md"]);
    expect(cursor()).toHaveClass(["absolute", "z-0", "bg-white", "rounded-sm"]);
  });

  test("should override the default classes when the variant matches - compoundSlots", () => {
    const tabs = tv({
      slots: {
        base: "inline-flex",
        tabList: ["flex"],
        tab: ["z-0", "w-full", "px-3", "py-1", "flex", "group", "relative"],
        tabContent: ["relative", "z-10", "text-inherit", "whitespace-nowrap"],
        cursor: ["absolute", "z-0", "bg-white"],
        panel: ["py-3", "px-1", "outline-none"],
      },
      variants: {
        variant: {
          solid: {},
          light: {},
          underlined: {},
          bordered: {},
        },
        color: {
          default: {},
          primary: {},
          secondary: {},
          success: {},
          warning: {},
          danger: {},
        },
        size: {
          sm: {
            tabList: "rounded-md",
            tab: "h-7 text-xs rounded-sm",
            cursor: "rounded-sm",
          },
          md: {
            tabList: "rounded-md",
            tab: "h-8 text-sm rounded-sm",
            cursor: "rounded-sm",
          },
          lg: {
            tabList: "rounded-lg",
            tab: "h-9 text-md rounded-md",
            cursor: "rounded-md",
          },
        },
        radius: {
          none: {
            tabList: "rounded-none",
            tab: "rounded-none",
            cursor: "rounded-none",
          },
          sm: {
            tabList: "rounded-md",
            tab: "rounded-sm",
            cursor: "rounded-sm",
          },
          md: {
            tabList: "rounded-md",
            tab: "rounded-sm",
            cursor: "rounded-sm",
          },
          lg: {
            tabList: "rounded-lg",
            tab: "rounded-md",
            cursor: "rounded-md",
          },
          full: {
            tabList: "rounded-full",
            tab: "rounded-full",
            cursor: "rounded-full",
          },
        },
      },
      defaultVariants: {
        color: "default",
        variant: "solid",
        size: "md",
      },
      compoundSlots: [
        {
          variant: "underlined",
          slots: ["tab", "tabList", "cursor"],
          class: ["rounded-none"],
        },
      ],
    });

    const {tab, tabList, cursor} = tabs({variant: "underlined"});

    expect(tab()).toHaveClass([
      "z-0",
      "w-full",
      "px-3",
      "py-1",
      "h-8",
      "flex",
      "group",
      "relative",
      "text-sm",
      "rounded-none",
    ]);
    expect(tabList()).toHaveClass(["flex", "rounded-none"]);
    expect(cursor()).toHaveClass(["absolute", "z-0", "bg-white", "rounded-none"]);
  });

  test("should support slot level variant overrides - compoundVariants", () => {
    const menu = tv({
      base: "text-3xl",
      slots: {
        title: "text-2xl",
      },
      variants: {
        color: {
          primary: {
            base: "color--primary-base",
            title: "color--primary-title",
          },
          secondary: {
            base: "color--secondary-base",
            title: "color--secondary-title",
          },
        },
      },
      compoundVariants: [
        {
          color: "secondary",
          class: {
            title: "truncate",
          },
        },
      ],
      defaultVariants: {
        color: "primary",
      },
    });

    const {base, title} = menu();

    expect(base()).toHaveClass(["text-3xl", "color--primary-base"]);
    expect(title()).toHaveClass(["text-2xl", "color--primary-title"]);
    expect(base({color: "secondary"})).toHaveClass(["text-3xl", "color--secondary-base"]);
    expect(title({color: "secondary"})).toHaveClass([
      "text-2xl",
      "color--secondary-title",
      "truncate",
    ]);
  });

  test("should work with native prototype", () => {
    const avatar = tv({
      slots: {
        concat: "bg-white",
        link: "cursor-pointer",
        map: "bg-black",
      },
      variants: {
        size: {
          md: {
            concat: "size-10",
            link: "size-10",
            map: "size-10",
          },
        },
      },
    });

    const {concat, link, map} = avatar({size: "md"});

    expect(concat()).toBe("bg-white size-10");
    expect(link()).toBe("cursor-pointer size-10");
    expect(map()).toBe("bg-black size-10");
  });
});

describe("Tailwind Variants (TV) - Compound Slots", () => {
  test("should work with compound slots -- without variants", () => {
    const pagination = tv({
      slots: {
        base: "flex flex-wrap relative gap-1 max-w-fit",
        item: "",
        prev: "",
        next: "",
        cursor: ["absolute", "flex", "overflow-visible"],
      },
      compoundSlots: [
        {
          slots: ["item", "prev", "next"],
          class: ["flex", "flex-wrap", "truncate"],
        },
      ],
    });
    // with default values
    const {base, item, prev, next, cursor} = pagination();

    expect(base()).toHaveClass(["flex", "flex-wrap", "relative", "gap-1", "max-w-fit"]);
    expect(item()).toHaveClass(["flex", "flex-wrap", "truncate"]);
    expect(prev()).toHaveClass(["flex", "flex-wrap", "truncate"]);
    expect(next()).toHaveClass(["flex", "flex-wrap", "truncate"]);
    expect(cursor()).toHaveClass(["absolute", "flex", "overflow-visible"]);
  });

  test("should work with compound slots -- with a single variant -- defaultVariants", () => {
    const pagination = tv({
      slots: {
        base: "flex flex-wrap relative gap-1 max-w-fit",
        item: "",
        prev: "",
        next: "",
        cursor: ["absolute", "flex", "overflow-visible"],
      },
      variants: {
        size: {
          xs: {},
          sm: {},
          md: {},
          lg: {},
          xl: {},
        },
      },
      compoundSlots: [
        {
          slots: ["item", "prev", "next"],
          class: ["flex", "flex-wrap", "truncate"],
        },
        {
          slots: ["item", "prev", "next"],
          size: "xs",
          class: "w-7 h-7 text-xs",
        },
      ],
      defaultVariants: {
        size: "xs",
      },
    });
    // with default values
    const {base, item, prev, next, cursor} = pagination();

    expect(base()).toHaveClass(["flex", "flex-wrap", "relative", "gap-1", "max-w-fit"]);
    expect(item()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(prev()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(next()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(cursor()).toHaveClass(["absolute", "flex", "overflow-visible"]);
  });

  test("should work with compound slots -- with a single variant -- prop variant", () => {
    const pagination = tv({
      slots: {
        base: "flex flex-wrap relative gap-1 max-w-fit",
        item: "",
        prev: "",
        next: "",
        cursor: ["absolute", "flex", "overflow-visible"],
      },
      variants: {
        size: {
          xs: {},
          sm: {},
          md: {},
          lg: {},
          xl: {},
        },
      },
      compoundSlots: [
        {
          slots: ["item", "prev", "next"],
          class: ["flex", "flex-wrap", "truncate"],
        },
        {
          slots: ["item", "prev", "next"],
          size: "xs",
          class: "w-7 h-7 text-xs",
        },
      ],
      defaultVariants: {
        size: "sm",
      },
    });
    // with default values
    const {base, item, prev, next, cursor} = pagination({
      size: "xs",
    });

    expect(base()).toHaveClass(["flex", "flex-wrap", "relative", "gap-1", "max-w-fit"]);
    expect(item()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(prev()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(next()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(cursor()).toHaveClass(["absolute", "flex", "overflow-visible"]);
  });

  test("should work with compound slots -- with a single variant -- boolean variant", () => {
    const nav = tv({
      base: "base",
      slots: {
        toggle: "slot--toggle",
        item: "slot--item",
      },
      variants: {
        isActive: {
          true: "",
        },
      },
      compoundSlots: [
        {
          slots: ["item", "toggle"],
          class: "compound--item-toggle",
        },
        {
          slots: ["item", "toggle"],
          isActive: true,
          class: "compound--item-toggle--active",
        },
      ],
    });

    let styles = nav({isActive: false});

    expect(styles.base()).toHaveClass(["base"]);
    expect(styles.toggle()).toHaveClass(["slot--toggle", "compound--item-toggle"]);
    expect(styles.item()).toHaveClass(["slot--item", "compound--item-toggle"]);

    styles = nav({isActive: true});

    expect(styles.base()).toHaveClass(["base"]);
    expect(styles.toggle()).toHaveClass([
      "slot--toggle",
      "compound--item-toggle",
      "compound--item-toggle--active",
    ]);
    expect(styles.item()).toHaveClass([
      "slot--item",
      "compound--item-toggle",
      "compound--item-toggle--active",
    ]);
  });

  test("should work with compound slots -- with multiple variants -- defaultVariants", () => {
    const pagination = tv({
      slots: {
        base: "flex flex-wrap relative gap-1 max-w-fit",
        item: "",
        prev: "",
        next: "",
        cursor: ["absolute", "flex", "overflow-visible"],
      },
      variants: {
        size: {
          xs: {},
          sm: {},
          md: {},
          lg: {},
          xl: {},
        },
        color: {
          primary: {},
          secondary: {},
        },
        isBig: {
          true: {},
        },
      },
      compoundSlots: [
        {
          slots: ["item", "prev", "next"],
          class: ["flex", "flex-wrap", "truncate"],
        },
        {
          slots: ["item", "prev", "next"],
          size: "xs",
          color: "primary",
          isBig: false,
          class: "w-7 h-7 text-xs",
        },
      ],
      defaultVariants: {
        size: "xs",
        color: "primary",
        isBig: false,
      },
    });
    // with default values
    const {base, item, prev, next, cursor} = pagination();

    expect(base()).toHaveClass(["flex", "flex-wrap", "relative", "gap-1", "max-w-fit"]);
    expect(item()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(prev()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(next()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(cursor()).toHaveClass(["absolute", "flex", "overflow-visible"]);
  });

  test("should work with compound slots -- with multiple variants -- prop variants", () => {
    const pagination = tv({
      slots: {
        base: "flex flex-wrap relative gap-1 max-w-fit",
        item: "",
        prev: "",
        next: "",
        cursor: ["absolute", "flex", "overflow-visible"],
      },
      variants: {
        size: {
          xs: {},
          sm: {},
          md: {},
          lg: {},
          xl: {},
        },
        color: {
          primary: {},
          secondary: {},
        },
        isBig: {
          true: {},
        },
      },
      compoundSlots: [
        {
          slots: ["item", "prev", "next"],
          class: ["flex", "flex-wrap", "truncate"],
        },
        {
          slots: ["item", "prev", "next"],
          size: "xs",
          color: "primary",
          isBig: true,
          class: "w-7 h-7 text-xs",
        },
      ],
      defaultVariants: {
        size: "sm",
        color: "secondary",
        isBig: false,
      },
    });
    // with default values
    const {base, item, prev, next, cursor} = pagination({
      size: "xs",
      color: "primary",
      isBig: true,
    });

    expect(base()).toHaveClass(["flex", "flex-wrap", "relative", "gap-1", "max-w-fit"]);
    expect(item()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(prev()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(next()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(cursor()).toHaveClass(["absolute", "flex", "overflow-visible"]);
  });
});

describe("Tailwind Variants (TV) - Extends", () => {
  test("should include the extended classes", () => {
    const p = tv({
      base: "text-base text-green-500",
    });

    const h1 = tv({
      extend: p,
      base: "text-3xl font-bold",
    });

    const result = h1();
    const expectedResult = ["text-3xl", "font-bold", "text-green-500"];

    expect(result).toHaveClass(expectedResult);
  });

  test("should include the extended classes with variants", () => {
    const p = tv({
      base: "p--base text-base text-green-500",
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

    const h1 = tv({
      extend: p,
      base: "text-3xl font-bold",
      variants: {
        color: {
          purple: "text-purple-500",
          green: "text-green-500",
        },
      },
    });

    const result = h1({
      isBig: true,
      color: "red",
    });

    const expectedResult = ["font-bold", "text-red-500", "text-5xl", "p--base"];

    expect(result).toHaveClass(expectedResult);
  });

  test("should include nested the extended classes", () => {
    const base = tv({
      base: "text-base",
      variants: {
        color: {
          red: "color--red",
        },
      },
    });

    const p = tv({
      extend: base,
      base: "text-green-500",
      variants: {
        color: {
          blue: "color--blue",
          yellow: "color--yellow",
        },
      },
    });

    const h1 = tv({
      extend: p,
      base: "text-3xl font-bold",
      variants: {
        color: {
          green: "color--green",
        },
      },
    });

    const result = h1({
      // @ts-ignore TODO: should have the grand parent variants
      color: "red",
    });

    const expectedResult = ["text-3xl", "font-bold", "text-green-500", "color--red"];

    expect(result).toHaveClass(expectedResult);

    const result2 = h1({
      color: "blue",
    });

    const expectedResult2 = ["text-3xl", "font-bold", "text-green-500", "color--blue"];

    expect(result2).toHaveClass(expectedResult2);

    const result3 = h1({
      color: "green",
    });

    const expectedResult3 = ["text-3xl", "font-bold", "text-green-500", "color--green"];

    expect(result3).toHaveClass(expectedResult3);
  });

  test("should override the extended classes with variants", () => {
    const p = tv({
      base: "text-base text-green-500",
      variants: {
        isBig: {
          true: "text-5xl",
          false: "text-2xl",
        },
        color: {
          red: "text-red-500 bg-red-100 tracking-normal",
          blue: "text-blue-500",
        },
      },
    });

    const h1 = tv({
      extend: p,
      base: "text-3xl font-bold",
      variants: {
        color: {
          red: ["text-red-200", "bg-red-200"],
          green: "text-green-500",
        },
      },
    });

    const result = h1({
      isBig: true,
      color: "red",
    });

    const expectedResult = [
      "font-bold",
      "text-red-200",
      "bg-red-200",
      "tracking-normal",
      "text-5xl",
    ];

    expect(result).toHaveClass(expectedResult);
  });

  test("should include the extended classes with defaultVariants - parent", () => {
    const p = tv({
      base: "text-base text-green-500",
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
      defaultVariants: {
        isBig: true,
        color: "red",
      },
    });

    const h1 = tv({
      extend: p,
      base: "text-3xl font-bold",
      variants: {
        color: {
          purple: "text-purple-500",
          green: "text-green-500",
        },
      },
    });

    const result = h1();

    const expectedResult = ["font-bold", "text-red-500", "text-5xl"];

    expect(result).toHaveClass(expectedResult);
  });

  test("should include the extended classes with defaultVariants - children", () => {
    const p = tv({
      base: "text-base text-green-500",
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

    const h1 = tv({
      extend: p,
      base: "text-3xl font-bold",
      variants: {
        color: {
          purple: "text-purple-500",
          green: "text-green-500",
        },
      },
      defaultVariants: {
        isBig: true,
        color: "red",
      },
    });

    const result = h1();

    const expectedResult = ["font-bold", "text-red-500", "text-5xl"];

    expect(result).toHaveClass(expectedResult);
  });

  test("should override the extended defaultVariants - children", () => {
    const p = tv({
      base: "text-base text-green-500",
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
      defaultVariants: {
        isBig: true,
        color: "blue",
      },
    });

    const h1 = tv({
      extend: p,
      base: "text-3xl font-bold",
      variants: {
        color: {
          purple: "text-purple-500",
          green: "text-green-500",
        },
      },
      defaultVariants: {
        isBig: false,
        color: "red",
      },
    });

    const result = h1();

    const expectedResult = ["font-bold", "text-red-500", "text-2xl"];

    expect(result).toHaveClass(expectedResult);
  });

  test("should include the extended classes with compoundVariants - parent", () => {
    const p = tv({
      base: "text-base text-green-500",
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
      defaultVariants: {
        isBig: true,
        color: "red",
      },
      compoundVariants: [
        {
          isBig: true,
          color: "red",
          class: "bg-red-500",
        },
      ],
    });

    const h1 = tv({
      extend: p,
      base: "text-3xl font-bold",
      variants: {
        color: {
          purple: "text-purple-500",
          green: "text-green-500",
        },
      },
    });

    const result = h1();

    const expectedResult = ["font-bold", "text-red-500", "bg-red-500", "text-5xl"];

    expect(result).toHaveClass(expectedResult);
  });

  test("should include the extended classes with compoundVariants - children", () => {
    const p = tv({
      base: "text-base text-green-500",
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
      defaultVariants: {
        isBig: true,
        color: "red",
      },
    });

    const h1 = tv({
      extend: p,
      base: "text-3xl font-bold",
      variants: {
        color: {
          purple: "text-purple-500",
          green: "text-green-500",
        },
      },
      defaultVariants: {
        color: "green",
      },
      compoundVariants: [
        {
          isBig: true,
          color: "green",
          class: "bg-green-500",
        },
      ],
    });

    const result = h1();

    const expectedResult = ["font-bold", "bg-green-500", "text-green-500", "text-5xl"];

    expect(result).toHaveClass(expectedResult);
  });

  test("should override the extended classes with compoundVariants - children", () => {
    const p = tv({
      base: "text-base text-green-500",
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
      defaultVariants: {
        isBig: true,
        color: "red",
      },
      compoundVariants: [
        {
          isBig: true,
          color: "red",
          class: "bg-red-500",
        },
      ],
    });

    const h1 = tv({
      extend: p,
      base: "text-3xl font-bold",
      variants: {
        color: {
          purple: "text-purple-500",
          green: "text-green-500",
        },
      },
      compoundVariants: [
        {
          isBig: true,
          color: "red",
          class: "bg-red-600",
        },
      ],
    });

    const result = h1();

    const expectedResult = ["font-bold", "bg-red-600", "text-red-500", "text-5xl"];

    expect(result).toHaveClass(expectedResult);
  });

  test("should override the extended classes with variants and compoundVariants, using array", () => {
    const p = tv({
      base: "text-base text-green-500",
      variants: {
        isBig: {
          true: "text-5xl",
          false: ["text-2xl"],
        },
        color: {
          red: ["text-red-500 bg-red-100", "tracking-normal"],
          blue: "text-blue-500",
        },
      },
      defaultVariants: {
        isBig: true,
        color: "red",
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
          class: ["bg-red-500"],
        },
        {
          isBig: true,
          color: "blue",
          class: ["bg-blue-500"],
        },
        {
          isBig: false,
          color: "blue",
          class: "bg-blue-500",
        },
      ],
    });

    const h1 = tv({
      extend: p,
      base: "text-3xl font-bold",
      variants: {
        isBig: {
          true: "text-7xl",
          false: "text-3xl",
        },
        color: {
          red: ["text-red-200", "bg-red-200"],
          green: ["text-green-500"],
        },
      },
      compoundVariants: [
        {
          isBig: true,
          color: "red",
          class: "bg-red-600",
        },
        {
          isBig: false,
          color: "red",
          class: "bg-red-600",
        },
        {
          isBig: true,
          color: "blue",
          class: ["bg-blue-600"],
        },
        {
          isBig: false,
          color: "blue",
          class: ["bg-blue-600"],
        },
      ],
    });

    expect(h1({isBig: true, color: "red"})).toHaveClass([
      "font-bold",
      "text-red-200",
      "bg-red-600",
      "tracking-normal",
      "text-7xl",
    ]);

    expect(h1({isBig: true, color: "blue"})).toHaveClass([
      "font-bold",
      "text-blue-500",
      "bg-blue-600",
      "text-7xl",
    ]);

    expect(h1({isBig: false, color: "red"})).toHaveClass([
      "font-bold",
      "text-red-200",
      "bg-red-600",
      "tracking-normal",
      "text-3xl",
    ]);

    expect(h1({isBig: false, color: "blue"})).toHaveClass([
      "font-bold",
      "text-blue-500",
      "bg-blue-600",
      "text-3xl",
    ]);
  });

  test("should include the extended slots w/o children slots", () => {
    const menuBase = tv({
      base: "base--menuBase",
      slots: {
        title: "title--menuBase",
        item: "item--menuBase",
        list: "list--menuBase",
        wrapper: "wrapper--menuBase",
      },
    });

    const menu = tv({
      extend: menuBase,
      base: "base--menu",
    });

    // with default values
    const {base, title, item, list, wrapper} = menu();

    expect(base()).toHaveClass(["base--menuBase", "base--menu"]);
    expect(title()).toHaveClass(["title--menuBase"]);
    expect(item()).toHaveClass(["item--menuBase"]);
    expect(list()).toHaveClass(["list--menuBase"]);
    expect(wrapper()).toHaveClass(["wrapper--menuBase"]);
  });

  test("should include the extended slots w/ variants -- parent", () => {
    const menuBase = tv({
      base: "base--menuBase",
      slots: {
        title: "title--menuBase",
        item: "item--menuBase",
        list: "list--menuBase",
        wrapper: "wrapper--menuBase",
      },
      variants: {
        isBig: {
          true: {
            title: "title--isBig--menu",
            item: "item--isBig--menu",
            list: "list--isBig--menu",
            wrapper: "wrapper--isBig--menu",
          },
          false: "isBig--menu",
        },
      },
    });

    const menu = tv({
      extend: menuBase,
      base: "base--menu",
    });

    const {base, title, item, list, wrapper} = menu({
      isBig: true,
    });

    expect(base()).toHaveClass(["base--menuBase", "base--menu"]);
    expect(title()).toHaveClass(["title--menuBase", "title--isBig--menu"]);
    expect(item()).toHaveClass(["item--menuBase", "item--isBig--menu"]);
    expect(list()).toHaveClass(["list--menuBase", "list--isBig--menu"]);
    expect(wrapper()).toHaveClass(["wrapper--menuBase", "wrapper--isBig--menu"]);
  });

  test("should include the extended slots w/ variants -- children", () => {
    const menuBase = tv({
      base: "base--menuBase",
      slots: {
        title: "title--menuBase",
        item: "item--menuBase",
        list: "list--menuBase",
        wrapper: "wrapper--menuBase",
      },
    });

    const menu = tv({
      extend: menuBase,
      base: "base--menu",
      variants: {
        isBig: {
          true: {
            title: "title--isBig--menu",
            item: "item--isBig--menu",
            list: "list--isBig--menu",
            wrapper: "wrapper--isBig--menu",
          },
          false: "isBig--menu",
        },
      },
    });

    const {base, title, item, list, wrapper} = menu({
      isBig: true,
    });

    expect(base()).toHaveClass(["base--menuBase", "base--menu"]);
    expect(title()).toHaveClass(["title--menuBase", "title--isBig--menu"]);
    expect(item()).toHaveClass(["item--menuBase", "item--isBig--menu"]);
    expect(list()).toHaveClass(["list--menuBase", "list--isBig--menu"]);
    expect(wrapper()).toHaveClass(["wrapper--menuBase", "wrapper--isBig--menu"]);
  });

  test("should include the extended slots w/ children slots (same names)", () => {
    const menuBase = tv({
      base: "base--menuBase",
      slots: {
        title: "title--menuBase",
        item: "item--menuBase",
        list: "list--menuBase",
        wrapper: "wrapper--menuBase",
      },
    });

    const menu = tv({
      extend: menuBase,
      base: "base--menu",
      slots: {
        title: "title--menu",
        item: "item--menu",
        list: "list--menu",
        wrapper: "wrapper--menu",
      },
    });

    // with default values
    let res = menu();

    expect(res.base()).toHaveClass(["base--menuBase", "base--menu"]);
    expect(res.title()).toHaveClass(["title--menuBase", "title--menu"]);
    expect(res.item()).toHaveClass(["item--menuBase", "item--menu"]);
    expect(res.list()).toHaveClass(["list--menuBase", "list--menu"]);
    expect(res.wrapper()).toHaveClass(["wrapper--menuBase", "wrapper--menu"]);

    res = menuBase();

    expect(res.base()).toBe("base--menuBase");
    expect(res.title()).toBe("title--menuBase");
    expect(res.item()).toBe("item--menuBase");
    expect(res.list()).toBe("list--menuBase");
    expect(res.wrapper()).toBe("wrapper--menuBase");
  });

  test("should include the extended slots w/ children slots (additional)", () => {
    const menuBase = tv({
      base: "base--menuBase",
      slots: {
        title: "title--menuBase",
        item: "item--menuBase",
        list: "list--menuBase",
        wrapper: "wrapper--menuBase",
      },
    });

    const menu = tv({
      extend: menuBase,
      base: "base--menu",
      slots: {
        title: "title--menu",
        item: "item--menu",
        list: "list--menu",
        wrapper: "wrapper--menu",
        extra: "extra--menu",
      },
    });

    // with default values
    const {base, title, item, list, wrapper, extra} = menu();

    expect(base()).toHaveClass(["base--menuBase", "base--menu"]);
    expect(title()).toHaveClass(["title--menuBase", "title--menu"]);
    expect(item()).toHaveClass(["item--menuBase", "item--menu"]);
    expect(list()).toHaveClass(["list--menuBase", "list--menu"]);
    expect(wrapper()).toHaveClass(["wrapper--menuBase", "wrapper--menu"]);
    expect(extra()).toHaveClass(["extra--menu"]);
  });

  test("should include the extended variants w/slots and defaultVariants -- parent", () => {
    const menuBase = tv({
      base: "base--menuBase",
      slots: {
        title: "title--menuBase",
        item: "item--menuBase",
        list: "list--menuBase",
        wrapper: "wrapper--menuBase",
      },
      variants: {
        isBig: {
          true: {
            title: "isBig--title--menuBase",
            item: "isBig--item--menuBase",
            list: "isBig--list--menuBase",
            wrapper: "isBig--wrapper--menuBase",
          },
        },
      },
      defaultVariants: {
        isBig: true,
      },
    });

    const menu = tv({
      extend: menuBase,
      base: "base--menu",
      slots: {
        title: "title--menu",
        item: "item--menu",
        list: "list--menu",
        wrapper: "wrapper--menu",
      },
    });

    // with default values
    const {base, title, item, list, wrapper} = menu();

    expect(base()).toHaveClass(["base--menuBase", "base--menu"]);
    expect(title()).toHaveClass(["title--menuBase", "title--menu", "isBig--title--menuBase"]);
    expect(item()).toHaveClass(["item--menuBase", "item--menu", "isBig--item--menuBase"]);
    expect(list()).toHaveClass(["list--menuBase", "list--menu", "isBig--list--menuBase"]);
    expect(wrapper()).toHaveClass([
      "wrapper--menuBase",
      "wrapper--menu",
      "isBig--wrapper--menuBase",
    ]);
  });

  test("should include the extended variants w/slots and defaultVariants -- children", () => {
    const menuBase = tv({
      base: "base--menuBase",
      slots: {
        title: "title--menuBase",
        item: "item--menuBase",
        list: "list--menuBase",
        wrapper: "wrapper--menuBase",
      },
      variants: {
        isBig: {
          true: {
            title: "isBig--title--menuBase",
            item: "isBig--item--menuBase",
            list: "isBig--list--menuBase",
            wrapper: "isBig--wrapper--menuBase",
          },
        },
      },
    });

    const menu = tv({
      extend: menuBase,
      base: "base--menu",
      slots: {
        title: "title--menu",
        item: "item--menu",
        list: "list--menu",
        wrapper: "wrapper--menu",
      },
      defaultVariants: {
        isBig: true,
      },
    });

    // with default values
    const {base, title, item, list, wrapper} = menu();

    expect(base()).toHaveClass(["base--menuBase", "base--menu"]);
    expect(title()).toHaveClass(["title--menuBase", "title--menu", "isBig--title--menuBase"]);
    expect(item()).toHaveClass(["item--menuBase", "item--menu", "isBig--item--menuBase"]);
    expect(list()).toHaveClass(["list--menuBase", "list--menu", "isBig--list--menuBase"]);
    expect(wrapper()).toHaveClass([
      "wrapper--menuBase",
      "wrapper--menu",
      "isBig--wrapper--menuBase",
    ]);
  });

  test("should include the extended variants w/slots and compoundVariants -- parent", () => {
    const menuBase = tv({
      base: "base--menuBase",
      slots: {
        title: "title--menuBase",
        item: "item--menuBase",
        list: "list--menuBase",
        wrapper: "wrapper--menuBase",
      },
      variants: {
        color: {
          red: {
            title: "color--red--title--menuBase",
            item: "color--red--item--menuBase",
            list: "color--red--list--menuBase",
            wrapper: "color--red--wrapper--menuBase",
          },
          blue: {
            title: "color--blue--title--menuBase",
            item: "color--blue--item--menuBase",
            list: "color--blue--list--menuBase",
            wrapper: "color--blue--wrapper--menuBase",
          },
        },
        isBig: {
          true: {
            title: "isBig--title--menuBase",
            item: "isBig--item--menuBase",
            list: "isBig--list--menuBase",
            wrapper: "isBig--wrapper--menuBase",
          },
        },
      },
      defaultVariants: {
        isBig: true,
        color: "blue",
      },
      compoundVariants: [
        {
          color: "red",
          isBig: true,
          class: {
            title: "color--red--isBig--title--menuBase",
            item: "color--red--isBig--item--menuBase",
            list: "color--red--isBig--list--menuBase",
            wrapper: "color--red--isBig--wrapper--menuBase",
          },
        },
      ],
    });

    const menu = tv({
      extend: menuBase,
      base: "base--menu",
      slots: {
        title: "title--menu",
        item: "item--menu",
        list: "list--menu",
        wrapper: "wrapper--menu",
      },
    });

    // with default values
    const {base, title, item, list, wrapper} = menu({
      color: "red",
    });

    expect(base()).toHaveClass(["base--menuBase", "base--menu"]);
    expect(title()).toHaveClass([
      "title--menuBase",
      "title--menu",
      "isBig--title--menuBase",
      "color--red--title--menuBase",
      "color--red--isBig--title--menuBase",
    ]);
    expect(item()).toHaveClass([
      "item--menuBase",
      "item--menu",
      "isBig--item--menuBase",
      "color--red--item--menuBase",
      "color--red--isBig--item--menuBase",
    ]);
    expect(list()).toHaveClass([
      "list--menuBase",
      "list--menu",
      "isBig--list--menuBase",
      "color--red--list--menuBase",
      "color--red--isBig--list--menuBase",
    ]);
    expect(wrapper()).toHaveClass([
      "wrapper--menuBase",
      "wrapper--menu",
      "isBig--wrapper--menuBase",
      "color--red--wrapper--menuBase",
      "color--red--isBig--wrapper--menuBase",
    ]);
  });

  test("should include the extended variants w/slots and compoundVariants -- children", () => {
    const menuBase = tv({
      base: "base--menuBase",
      slots: {
        title: "title--menuBase",
        item: "item--menuBase",
        list: "list--menuBase",
        wrapper: "wrapper--menuBase",
      },
      variants: {
        color: {
          red: {
            title: "color--red--title--menuBase",
            item: "color--red--item--menuBase",
            list: "color--red--list--menuBase",
            wrapper: "color--red--wrapper--menuBase",
          },
          blue: {
            title: "color--blue--title--menuBase",
            item: "color--blue--item--menuBase",
            list: "color--blue--list--menuBase",
            wrapper: "color--blue--wrapper--menuBase",
          },
        },
        isBig: {
          true: {
            title: "isBig--title--menuBase",
            item: "isBig--item--menuBase",
            list: "isBig--list--menuBase",
            wrapper: "isBig--wrapper--menuBase",
          },
        },
      },
      defaultVariants: {
        isBig: true,
        color: "blue",
      },
    });

    const menu = tv({
      extend: menuBase,
      base: "base--menu",
      slots: {
        title: "title--menu",
        item: "item--menu",
        list: "list--menu",
        wrapper: "wrapper--menu",
      },
      compoundVariants: [
        {
          color: "red",
          isBig: true,
          class: {
            title: "color--red--isBig--title--menuBase",
            item: "color--red--isBig--item--menuBase",
            list: "color--red--isBig--list--menuBase",
            wrapper: "color--red--isBig--wrapper--menuBase",
          },
        },
      ],
    });

    // with default values
    const {base, title, item, list, wrapper} = menu({
      color: "red",
    });

    expect(base()).toHaveClass(["base--menuBase", "base--menu"]);
    expect(title()).toHaveClass([
      "title--menuBase",
      "title--menu",
      "isBig--title--menuBase",
      "color--red--title--menuBase",
      "color--red--isBig--title--menuBase",
    ]);
    expect(item()).toHaveClass([
      "item--menuBase",
      "item--menu",
      "isBig--item--menuBase",
      "color--red--item--menuBase",
      "color--red--isBig--item--menuBase",
    ]);
    expect(list()).toHaveClass([
      "list--menuBase",
      "list--menu",
      "isBig--list--menuBase",
      "color--red--list--menuBase",
      "color--red--isBig--list--menuBase",
    ]);
    expect(wrapper()).toHaveClass([
      "wrapper--menuBase",
      "wrapper--menu",
      "isBig--wrapper--menuBase",
      "color--red--wrapper--menuBase",
      "color--red--isBig--wrapper--menuBase",
    ]);
  });

  test("should work with cn", () => {
    const tvResult = ["w-fit", "h-fit"];
    const custom = ["w-full"];

    const resultWithoutMerge = cnMerge(tvResult.concat(custom))({twMerge: false});
    const resultWithMerge = cnMerge(tvResult.concat(custom))({twMerge: true});
    const emptyResultWithoutMerge = cnMerge([].concat([]))({twMerge: false});
    const emptyResultWithMerge = cnMerge([].concat([]))({twMerge: true});

    expect(resultWithoutMerge).toBe("w-fit h-fit w-full");
    expect(resultWithMerge).toBe("h-fit w-full");
    expect(emptyResultWithoutMerge).toBe(undefined);
    expect(emptyResultWithMerge).toBe(undefined);
  });

  test("should support parent w/slots when base does not have slots", () => {
    const menuBase = tv({base: "menuBase"});
    const menu = tv({
      extend: menuBase,
      base: "menu",
      slots: {
        title: "title",
      },
    });

    const {base, title} = menu();

    expect(base()).toHaveClass(["menuBase", "menu"]);
    expect(title()).toHaveClass(["title"]);
  });

  it("should support multi-level extends", () => {
    const themeButton = tv({
      base: "font-medium",
      variants: {
        color: {
          primary: "text-blue-500",
        },
        disabled: {
          true: "opacity-50",
        },
      },
      compoundVariants: [
        {
          color: "primary",
          disabled: true,
          class: "bg-black",
        },
      ],
      defaultVariants: {
        color: "primary",
        disabled: true,
      },
    });

    const appButton = tv({extend: themeButton});
    const button = tv({extend: appButton});

    expect(appButton()).toHaveClass("font-medium text-blue-500 opacity-50 bg-black");
    expect(button()).toHaveClass("font-medium text-blue-500 opacity-50 bg-black");
  });
});

describe("Tailwind Variants (TV) - Tailwind Merge", () => {
  it("should merge the tailwind classes correctly", () => {
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

  it("should support custom config", () => {
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

  it("should support legacy custom config", () => {
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
});

describe("Tailwind Variants (TV) - Required Variants", () => {
  test("should throw error when required variant is not provided", () => {
    const button = tv({
      base: "font-semibold border border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white",
      variants: {
        intent: {
          primary: "bg-blue-500 text-white border-transparent hover:bg-blue-600",
          secondary: "bg-white text-blue-500 border-blue-500 hover:bg-blue-500 hover:text-white",
        },
        size: {
          small: "text-sm px-2 py-1",
          medium: "text-base px-4 py-2",
          large: "text-lg px-6 py-3",
        },
      },
      requiredVariants: ["intent", "size"] as const,
    });

    // Should throw when intent is missing
    // @ts-expect-error - Testing runtime error with missing required variant
    expect(() => button({size: "small"})).toThrow(
      'Missing required variant: "intent". This variant must be provided.',
    );

    // Should throw when size is missing
    // @ts-expect-error - Testing runtime error with missing required variant
    expect(() => button({intent: "primary"})).toThrow(
      'Missing required variant: "size". This variant must be provided.',
    );

    // Should throw when both are missing
    expect(() => button()).toThrow(
      'Missing required variant: "intent". This variant must be provided.',
    );
  });

  test("should work correctly when all required variants are provided", () => {
    const button = tv({
      base: "font-semibold border border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white",
      variants: {
        intent: {
          primary: "bg-blue-500 text-white border-transparent hover:bg-blue-600",
          secondary: "bg-white text-blue-500 border-blue-500 hover:bg-blue-500 hover:text-white",
        },
        size: {
          small: "text-sm px-2 py-1",
          medium: "text-base px-4 py-2",
          large: "text-lg px-6 py-3",
        },
      },
      requiredVariants: ["intent", "size"] as const,
    });

    const expectedResult =
      "font-semibold border hover:text-white bg-blue-500 text-white border-transparent hover:bg-blue-600 text-base px-4 py-2";
    const result = button({intent: "primary", size: "medium"});

    expect(result).toBe(expectedResult);
  });

  test("should work with defaultVariants for required variants", () => {
    const button = tv({
      base: "font-semibold border",
      variants: {
        intent: {
          primary: "bg-blue-500 text-white",
          secondary: "bg-white text-blue-500",
        },
        size: {
          small: "text-sm px-2 py-1",
          medium: "text-base px-4 py-2",
        },
      },
      defaultVariants: {
        intent: "primary",
        size: "medium",
      },
      requiredVariants: ["intent"] as const,
    });

    const expectedResult1 = "font-semibold border bg-white text-blue-500 text-base px-4 py-2";
    const result1 = button({intent: "secondary"});

    expect(result1).toBe(expectedResult1);

    // Should still throw when required variant is not provided, even with default
    expect(() => button()).toThrow(
      'Missing required variant: "intent". This variant must be provided.',
    );
  });

  test("should work with slots and required variants", () => {
    const card = tv({
      slots: {
        base: "rounded-lg border shadow-md",
        header: "p-4 border-b",
        body: "p-4",
        footer: "p-4 border-t bg-gray-50",
      },
      variants: {
        size: {
          small: {
            base: "max-w-sm",
            header: "p-2",
            body: "p-2",
            footer: "p-2",
          },
          large: {
            base: "max-w-4xl",
            header: "p-6",
            body: "p-6",
            footer: "p-6",
          },
        },
      },
      requiredVariants: ["size"] as const,
    });

    // Should throw when required variant is missing
    expect(() => card()).toThrow(
      'Missing required variant: "size". This variant must be provided.',
    );

    const {base, header, body, footer} = card({size: "small"});

    expect(base()).toBe("rounded-lg border shadow-md max-w-sm");
    expect(header()).toBe("border-b p-2");
    expect(body()).toBe("p-2");
    expect(footer()).toBe("border-t bg-gray-50 p-2");
  });

  test("should work without required variants", () => {
    const button = tv({
      base: "font-semibold",
      variants: {
        intent: {
          primary: "bg-blue-500 text-white",
          secondary: "bg-white text-blue-500",
        },
      },
    });

    const expectedResult1 = "font-semibold";
    const result1 = button();

    expect(result1).toBe(expectedResult1);

    const expectedResult2 = "font-semibold bg-blue-500 text-white";
    const result2 = button({intent: "primary"});

    expect(result2).toBe(expectedResult2);
  });

  test("should throw error if requiredVariants is not an array", () => {
    expect(() =>
      tv({
        base: "font-semibold",
        variants: {
          intent: {
            primary: "bg-blue-500",
          },
        },
        // @ts-expect-error - testing runtime validation
        requiredVariants: "intent",
      })(),
    ).toThrow('The "requiredVariants" prop must be an array. Received: string');

    expect(() =>
      tv({
        base: "font-semibold",
        variants: {
          intent: {
            primary: "bg-blue-500",
          },
        },
        // @ts-expect-error - testing runtime validation
        requiredVariants: {intent: true},
      })(),
    ).toThrow('The "requiredVariants" prop must be an array. Received: object');
  });

  test("should expose requiredVariants on component", () => {
    const button = tv({
      base: "font-semibold",
      variants: {
        intent: {
          primary: "bg-blue-500",
          secondary: "bg-white",
        },
        size: {
          small: "text-sm",
          large: "text-lg",
        },
      },
      requiredVariants: ["intent"] as const,
    });

    expect(button.requiredVariants).toEqual(["intent"]);
  });

  test("should work with extend and required variants", () => {
    const baseButton = tv({
      base: "font-semibold",
      variants: {
        intent: {
          primary: "bg-blue-500",
          secondary: "bg-white",
        },
      },
      requiredVariants: ["intent"] as const,
    });

    const iconButton = tv({
      extend: baseButton,
      variants: {
        size: {
          small: "p-1",
          large: "p-3",
        },
      },
      requiredVariants: ["intent", "size"] as const,
    });

    // Should throw when required variants from extended component are missing
    // @ts-expect-error - Testing runtime error with missing required variant
    expect(() => iconButton({size: "small"})).toThrow(
      'Missing required variant: "intent". This variant must be provided.',
    );

    // @ts-expect-error - Testing runtime error with missing required variant
    expect(() => iconButton({intent: "primary"})).toThrow(
      'Missing required variant: "size". This variant must be provided.',
    );

    const expectedResult = "font-semibold p-1 bg-blue-500";
    const result = iconButton({intent: "primary", size: "small"});

    expect(result).toBe(expectedResult);
  });
});
