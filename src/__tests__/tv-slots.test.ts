import type {TVFactory} from "../index";

import {describe, expect, test} from "vitest";

import {createTV, tv} from "../index";
import {createTV as createTVLite, tv as tvLite} from "../lite";

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

    const expectedResult = "";

    expect(base()).toBe(expectedResult);
    expect(title()).toBe(expectedResult);
    expect(item()).toBe(expectedResult);
    expect(list()).toBe(expectedResult);
  });

  test("lets slots.base replace root base instead of appending", () => {
    const card = tv({
      base: "root-layer rounded-xl",
      slots: {
        base: "slot-layer border",
        title: "font-medium",
      },
    });

    const {base, title} = card();

    expect(base()).toHaveClass(["slot-layer", "border"]);
    expect(base()?.includes("root-layer")).toBe(false);
    expect(base()?.includes("rounded-xl")).toBe(false);
    expect(title()).toHaveClass(["font-medium"]);
  });

  test("keeps root base on the base slot when slots.base is omitted", () => {
    const card = tv({
      base: "root-layer rounded-xl",
      slots: {
        title: "font-medium",
      },
    });

    const {base, title} = card();

    expect(base()).toHaveClass(["root-layer", "rounded-xl"]);
    expect(title()).toHaveClass(["font-medium"]);
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
    expect(remainingSlots.base()).toBe("");
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
    expect(emptySlots().base()).toBe("");
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

    const {base, title, item, list, wrapper} = menu();

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
    expect(title({class: "text-2xl"})).toHaveClass(["text-2xl"]);
    expect(title({className: "text-2xl"})).toHaveClass(["text-2xl"]);
    expect(item({class: "text-sm"})).toHaveClass(["text-sm", "opacity-100"]);
    expect(list({className: "bg-blue-50"})).toHaveClass(["list-none", "bg-blue-50"]);
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

    const {base, title, item, list, wrapper} = menu({
      color: "secondary",
      size: "md",
    });

    expect(base({class: "text-xl"})).toHaveClass(["text-xl", "font-bold", "underline"]);
    expect(base({className: "text-xl"})).toHaveClass(["text-xl", "font-bold", "underline"]);
    expect(title({class: "text-2xl"})).toHaveClass(["text-2xl", "text-white"]);
    expect(title({className: "text-2xl"})).toHaveClass(["text-2xl", "text-white"]);
    expect(item({class: "bg-purple-50"})).toHaveClass(["text-xl", "bg-purple-50", "opacity-100"]);
    expect(item({className: "bg-purple-50"})).toHaveClass([
      "text-xl",
      "bg-purple-50",
      "opacity-100",
    ]);
    expect(list({class: "bg-purple-100"})).toHaveClass(["list-none", "bg-purple-100"]);
    expect(list({className: "bg-purple-100"})).toHaveClass(["list-none", "bg-purple-100"]);
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

// Fresh instance per test so cached results never couple the two tabs tests.
const createTabs = () =>
  tv({
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
    expect(root({orientation: null, variant: null} as any)).toBe("");
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
    const {tab, tabList, cursor} = createTabs()();

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
    const {tab, tabList, cursor} = createTabs()({variant: "underlined"});

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

describe("tv (slots independence)", () => {
  const slotsConfig = {
    slots: {
      root: "root-base",
      icon: "icon-base",
    },
    variants: {
      size: {
        sm: {root: "root-sm", icon: "icon-sm"},
        lg: {root: "root-lg", icon: "icon-lg"},
      },
    },
    defaultVariants: {size: "sm" as const},
  };

  // HeroUI Chip / React pattern (no React runtime):
  //   const slots = useMemo(() => chip({...}), [deps]);
  //   slots.base({ className }) // every render
  const chipConfig = {
    slots: {
      base: "chip",
      label: "chip__label",
    },
    variants: {
      color: {
        warning: {base: "chip--warning"},
        success: {base: "chip--success"},
        default: {base: "chip--default"},
      },
      size: {
        sm: {base: "chip--sm"},
        md: {base: "chip--md"},
      },
      variant: {
        soft: {base: "chip--soft"},
        primary: {base: "chip--primary"},
      },
    },
    defaultVariants: {
      color: "default" as const,
      size: "md" as const,
      variant: "soft" as const,
    },
  };

  const warningSoft = ["chip", "chip--warning", "chip--sm", "chip--soft"] as const;

  const successPrimary = ["chip", "chip--success", "chip--sm", "chip--primary"] as const;

  // Overloaded `TV | TVLite` unions are not callable; widen to {@link TVFactory}.
  const runtimes: [string, TVFactory][] = [
    ["tv", tv],
    ["tv/lite", tvLite],
    ["createTV", createTV({})],
    ["createTV/lite", createTVLite()],
  ];

  describe.each(runtimes)("%s slots independence (#304)", (_label, createTv) => {
    // Original repro from https://github.com/heroui-inc/tailwind-variants/issues/304
    test("interleaved calls keep independent results and identity", () => {
      const v = createTv(slotsConfig);

      const s1 = v({size: "sm"});
      const s2 = v({size: "lg"});

      expect(s1).not.toBe(s2);
      expect(s1.root()).toHaveClass(["root-base", "root-sm"]);
      expect(s1.root()).not.toHaveClass(["root-lg"]);
      expect(s2.root()).toHaveClass(["root-base", "root-lg"]);
      expect(s2.root()).not.toHaveClass(["root-sm"]);

      // Held / cold-path result must not pick up later props (incl. multi-slot).
      expect(s1.icon()).toHaveClass(["icon-base", "icon-sm"]);
      expect(s1.icon()).not.toHaveClass(["icon-lg"]);

      const viaDefault = v();

      v({size: "lg"});
      expect(viaDefault.root()).toHaveClass(["root-base", "root-sm"]);
      expect(viaDefault.root()).not.toHaveClass(["root-lg"]);
    });

    // Repro from an issue #304 comment: HeroUI Chip, useMemo, className on every render.
    test("held slots survive sibling mounts when re-applying className", () => {
      const chip = createTv(chipConfig);

      const slotsA = chip({color: "warning", size: "sm", variant: "soft"});

      expect(slotsA.base({className: "badge"})).toHaveClass([...warningSoft, "badge"]);

      const slotsB = chip({color: "success", size: "sm", variant: "primary"});

      expect(slotsB.base({className: "other"})).toHaveClass([...successPrimary, "other"]);

      // A re-renders without useMemo recompute
      expect(slotsA.base({className: "badge"})).toHaveClass([...warningSoft, "badge"]);
      expect(slotsA.base({className: "badge"})).not.toHaveClass([
        "chip--success",
        "chip--primary",
        "chip--default",
      ]);

      chip({color: "default", size: "sm", variant: "soft"});

      expect(slotsA.base({className: "badge"})).toHaveClass([...warningSoft, "badge"]);
      expect(slotsA.label({className: "badge-label"})).toHaveClass(["chip__label", "badge-label"]);
    });

    test("reuses the same result object for the same props after cold invoke", () => {
      const v = createTv(slotsConfig);

      v({size: "sm"}); // cold path (uncached)

      const a = v({size: "sm"});
      const b = v({size: "sm"});

      expect(a).toBe(b);
      expect(a.root()).toHaveClass(["root-base", "root-sm"]);
    });

    test("class and slot-level variant overrides do not poison siblings", () => {
      const v = createTv(slotsConfig);
      const s1 = v({size: "sm"});
      const s2 = v({size: "lg"});

      expect(s1.root({class: "extra"})).toHaveClass(["root-base", "root-sm", "extra"]);
      expect(s1.root({size: "lg"})).toHaveClass(["root-base", "root-lg"]);
      expect(s1.root({size: "lg"})).not.toHaveClass(["root-sm"]);

      expect(s2.root()).toHaveClass(["root-base", "root-lg"]);
      expect(s2.root()).not.toHaveClass(["extra", "root-sm"]);
      expect(s1.root()).toHaveClass(["root-base", "root-sm"]);
      expect(s1.icon({size: "lg"})).toHaveClass(["icon-base", "icon-lg"]);
      expect(s2.icon()).toHaveClass(["icon-base", "icon-lg"]);
    });

    test("keeps results independent when props fingerprint cannot be built", () => {
      const v = createTv({
        slots: {root: "root-base"},
        variants: {
          size: {
            sm: {root: "root-sm"},
            lg: {root: "root-lg"},
          },
        },
        defaultVariants: {size: "sm"},
      });

      const circular: {self?: unknown; size: "sm" | "lg"} = {size: "sm"};

      circular.self = circular;

      const held = v(circular as {size: "sm"});

      v({size: "lg"});

      expect(held.root()).toHaveClass(["root-base", "root-sm"]);
      expect(held.root()).not.toHaveClass(["root-lg"]);
    });

    test("extended slots components keep held results independent", () => {
      const base = createTv(slotsConfig);
      const extended = createTv({
        extend: base,
        variants: {
          size: {
            sm: {root: "root-sm-ext"},
            lg: {root: "root-lg-ext"},
          },
        },
      });

      const held = extended({size: "sm"});

      extended({size: "lg"});

      expect(held.root()).toHaveClass(["root-base", "root-sm", "root-sm-ext"]);
      expect(held.root()).not.toHaveClass(["root-lg", "root-lg-ext"]);
    });

    test("keeps compoundVariants independent across interleaved calls", () => {
      const v = createTv({
        slots: {
          root: "root-base",
          label: "label-base",
        },
        variants: {
          color: {
            primary: {root: "root-primary"},
            danger: {root: "root-danger"},
          },
          solid: {
            true: {label: "label-solid"},
            false: {label: "label-soft"},
          },
        },
        compoundVariants: [
          {
            color: "danger",
            solid: true,
            class: {label: "label-danger-solid"},
          },
        ],
        defaultVariants: {
          color: "primary",
          solid: false,
        },
      });

      const soft = v({color: "primary", solid: false});
      const danger = v({color: "danger", solid: true});

      expect(soft).not.toBe(danger);
      expect(soft.label()).toHaveClass(["label-base", "label-soft"]);
      expect(soft.label()).not.toHaveClass(["label-danger-solid"]);
      expect(danger.label()).toHaveClass(["label-base", "label-solid", "label-danger-solid"]);
      expect(soft.label()).toHaveClass(["label-base", "label-soft"]);
    });

    test("keeps compoundSlots independent across interleaved calls", () => {
      const v = createTv({
        slots: {
          title: "title-base",
          subtitle: "subtitle-base",
        },
        variants: {
          color: {
            primary: {},
            secondary: {},
          },
        },
        compoundSlots: [
          {
            slots: ["title", "subtitle"],
            color: "secondary",
            class: "truncate",
          },
        ],
        defaultVariants: {
          color: "primary",
        },
      });

      const primary = v({color: "primary"});
      const secondary = v({color: "secondary"});

      expect(primary).not.toBe(secondary);
      expect(primary.title()).toHaveClass(["title-base"]);
      expect(primary.title()).not.toHaveClass(["truncate"]);
      expect(secondary.title()).toHaveClass(["title-base", "truncate"]);
      expect(primary.title()).not.toHaveClass(["truncate"]);
    });

    test("invalidates parent cache after in-place compoundVariants mutation", () => {
      const menu = createTv({
        slots: {
          root: "root",
          title: "title",
        },
        variants: {
          color: {
            primary: {root: "root-p", title: "title-p"},
            secondary: {root: "root-s", title: "title-s"},
          },
        },
        compoundVariants: [{color: "primary", class: {title: "compound-old"}}],
        defaultVariants: {color: "primary"},
      });

      expect(menu({color: "primary"}).title()).toHaveClass(["title", "title-p", "compound-old"]);

      menu.compoundVariants[0].color = "secondary";
      menu.compoundVariants[0].class = {title: "compound-new"};

      expect(menu({color: "primary"}).title()).toHaveClass(["title", "title-p"]);
      expect(menu({color: "primary"}).title()).not.toHaveClass(["compound-old", "compound-new"]);
      expect(menu({color: "secondary"}).title()).toHaveClass(["title", "title-s", "compound-new"]);
    });

    test("invalidates parent cache after in-place compoundSlots mutation", () => {
      const menu = createTv({
        slots: {
          title: "title-base",
          subtitle: "subtitle-base",
        },
        variants: {
          color: {
            primary: {},
            secondary: {},
          },
        },
        compoundSlots: [
          {
            slots: ["title", "subtitle"],
            color: "secondary",
            class: "truncate",
          },
        ],
        defaultVariants: {
          color: "secondary",
        },
      });

      expect(menu().title()).toHaveClass(["title-base", "truncate"]);

      menu.compoundSlots[0].class = "line-clamp-2";

      expect(menu().title()).toHaveClass(["title-base", "line-clamp-2"]);
      expect(menu().title()).not.toHaveClass(["truncate"]);
    });
  });
});
