import {describe, expect, test} from "vitest";

import {tv} from "../index";
import {tv as tvLite} from "../lite";

const slotsConfig = {
  slots: {
    root: "root-base",
    icon: "icon-base",
  },
  variants: {
    size: {
      sm: {root: "root-sm"},
      lg: {root: "root-lg"},
    },
  },
  defaultVariants: {size: "sm" as const},
};

describe.each([
  ["tv", tv],
  ["tv/lite", tvLite],
] as const)("%s slots independence (#304)", (_label, createTv) => {
  test("keeps interleaved parent calls independent", () => {
    const v = createTv(slotsConfig);

    const s1 = v({size: "sm"});
    const s2 = v({size: "lg"});

    expect(s1).not.toBe(s2);
    expect(s1.root()).toHaveClass(["root-base", "root-sm"]);
    expect(s1.root()).not.toHaveClass(["root-lg"]);
    expect(s2.root()).toHaveClass(["root-base", "root-lg"]);
    expect(s2.root()).not.toHaveClass(["root-sm"]);
  });

  test("does not contaminate a held result after a later call", () => {
    const v = createTv(slotsConfig);

    const held = v({size: "sm"});

    v({size: "lg"});

    expect(held.root()).toHaveClass(["root-base", "root-sm"]);
    expect(held.root()).not.toHaveClass(["root-lg"]);
  });

  test("reuses the same result object for the same props fingerprint", () => {
    const v = createTv(slotsConfig);

    // First parent invoke is a cold path (no cache); warm reuse starts afterward.
    v({size: "sm"});

    const a = v({size: "sm"});
    const b = v({size: "sm"});

    expect(a).toBe(b);
    expect(a.root()).toHaveClass(["root-base", "root-sm"]);
  });

  test("slot class overrides do not poison sibling instances", () => {
    const v = createTv(slotsConfig);

    const s1 = v({size: "sm"});
    const s2 = v({size: "lg"});

    expect(s1.root({class: "extra"})).toHaveClass(["root-base", "root-sm", "extra"]);
    expect(s2.root()).toHaveClass(["root-base", "root-lg"]);
    expect(s2.root()).not.toHaveClass(["extra"]);
    expect(s1.root()).toHaveClass(["root-base", "root-sm"]);
    expect(s1.root()).not.toHaveClass(["extra"]);
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
