import {describe, expect, test} from "vitest";

import {tv} from "../index";

describe("tv.extend (slots)", () => {
  test("inherits parent slots when the child defines no slots", () => {
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

  test("inherits compoundSlots when extending slots", () => {
    const one = tv({
      slots: {
        base: "bg-red w-full",
        child: "rounded bg-blue-500",
      },
      compoundSlots: [
        {
          slots: ["base", "child"],
          class: "flex",
        },
      ],
    });
    const two = tv({
      extend: one,
      slots: {
        child: "bg-green-500",
      },
    });

    expect(one().base()).toHaveClass(["bg-red", "w-full", "flex"]);
    expect(one().child()).toHaveClass(["rounded", "bg-blue-500", "flex"]);
    expect(two().base()).toHaveClass(["bg-red", "w-full", "flex"]);
    expect(two().child()).toHaveClass(["rounded", "bg-green-500", "flex"]);
  });

  test("merges compoundSlots across multiple extend levels", () => {
    const parent = tv({
      slots: {
        base: "parent-base",
        child: "parent-child",
      },
      compoundSlots: [
        {
          slots: ["base", "child"],
          class: "parent-compound",
        },
      ],
    });
    const child = tv({
      extend: parent,
      slots: {
        child: "child-override",
      },
      compoundSlots: [
        {
          slots: ["child"],
          class: "child-compound",
        },
      ],
    });
    const grandchild = tv({
      extend: child,
      slots: {
        child: "grandchild-child",
      },
    });

    expect(child().base()).toHaveClass(["parent-base", "parent-compound"]);
    expect(child().child()).toHaveClass([
      "parent-child",
      "child-override",
      "parent-compound",
      "child-compound",
    ]);
    expect(grandchild().base()).toHaveClass(["parent-base", "parent-compound"]);
    expect(grandchild().child()).toHaveClass([
      "parent-child",
      "child-override",
      "grandchild-child",
      "parent-compound",
      "child-compound",
    ]);
  });

  test("applies parent variants to inherited slots", () => {
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

  test("applies child variants to inherited slots", () => {
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

  test("merges child slots with matching parent slots", () => {
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

  test("adds child slots that are absent from the parent", () => {
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

  test("applies parent defaultVariants to inherited slots", () => {
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

  test("applies child defaultVariants to inherited slots", () => {
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

  test("applies parent compoundVariants to inherited slots", () => {
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

  test("applies child compoundVariants to inherited slots", () => {
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
});
