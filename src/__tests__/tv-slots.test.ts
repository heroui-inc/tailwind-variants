import {describe, expect, test} from "vitest";

import {tv} from "../index";

describe("tv (slots)", () => {
  test("applies default variants to slots", () => {
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

  test("supports empty slots", () => {
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

  test("always returns the implicit base slot", () => {
    const menu = tv({
      slots: {
        root: "flex items-center gap-2",
        label: "font-medium",
      },
    });

    const {root, label, ...remainingSlots} = menu();

    expect(root()).toHaveClass(["flex", "items-center", "gap-2"]);
    expect(label()).toBe("font-medium");
    expect(Object.keys(remainingSlots)).toEqual(["base"]);
    expect(remainingSlots.base()).toBeUndefined();
  });

  test("activates slot mode for an explicit empty slots object", () => {
    const emptySlots = tv({slots: {}});
    const emptySlotsWithBase = tv({
      base: "flex items-center",
      slots: {},
    });
    const extendedEmptySlots = tv({
      extend: emptySlotsWithBase,
    });

    expect(Object.keys(emptySlots())).toEqual(["base"]);
    expect(emptySlots().base()).toBeUndefined();
    expect(emptySlotsWithBase().base()).toBe("flex items-center");
    expect(extendedEmptySlots().base()).toBe("flex items-center");
  });

  test("applies custom classes to slots with default variants", () => {
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

  test("applies explicit variants to slots", () => {
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

  test("applies custom classes to slots with explicit variants", () => {
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
});
