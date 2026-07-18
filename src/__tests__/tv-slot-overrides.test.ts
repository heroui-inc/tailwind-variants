import {describe, expect, test} from "vitest";

import {tv} from "../index";

describe("tv (slot overrides)", () => {
  test("supports slots and compoundVariants", () => {
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

  test("preserves defaultVariants when slot props explicitly contain undefined", () => {
    const component = tv({
      slots: {
        root: "",
      },
      variants: {
        variant: {
          solid: {},
        },
        orientation: {
          horizontal: {
            root: "",
          },
        },
      },
      compoundVariants: [
        {
          orientation: "horizontal",
          variant: "solid",
          className: {
            root: "border-b",
          },
        },
      ],
      defaultVariants: {
        orientation: "horizontal",
        variant: "solid",
      },
    });

    const {root} = component();

    expect(root({})).toBe("border-b");
    expect(root({orientation: undefined, variant: undefined})).toBe("border-b");
    expect(root({orientation: null, variant: null} as any)).toBeUndefined();
  });

  test("preserves defaultVariants for compoundSlots when slot props contain undefined", () => {
    const component = tv({
      slots: {
        root: "",
      },
      variants: {
        orientation: {
          horizontal: {},
        },
      },
      compoundSlots: [
        {
          slots: ["root"],
          orientation: "horizontal",
          class: "border-b",
        },
      ],
      defaultVariants: {
        orientation: "horizontal",
      },
    });

    const {root} = component();

    expect(root({orientation: undefined})).toBe("border-b");
  });

  test("supports slot-level variant overrides", () => {
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

  test("applies slot-level overrides to compoundSlots", () => {
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

  test("applies scalar and array variant overrides to compoundSlots", () => {
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

  test("preserves default classes when compoundSlots variants do not match", () => {
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

  test("overrides default classes when compoundSlots variants match", () => {
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

  test("applies slot-level overrides to compoundVariants", () => {
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

  test("supports variant objects with native prototypes", () => {
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
