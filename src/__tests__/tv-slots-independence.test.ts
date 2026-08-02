import {describe, expect, test} from "vitest";

import {createTV, tv} from "../index";
import {createTV as createTVLite, tv as tvLite} from "../lite";

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

/**
 * HeroUI Chip / React pattern (no React runtime):
 *   const slots = useMemo(() => chip({...}), [deps]);
 *   slots.base({ className }) // every render
 */
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

const runtimes = [
  ["tv", tv],
  ["tv/lite", tvLite],
  ["createTV", createTV({})],
  ["createTV/lite", createTVLite()],
] as const;

describe.each(runtimes)("%s slots independence (#304)", (_label, createTv) => {
  // ryuji — https://github.com/heroui-inc/tailwind-variants/issues/304
  test("ryuji: interleaved calls keep independent results and identity", () => {
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

  // lightsound — issue comment (HeroUI Chip + useMemo + className every render)
  test("lightsound: held slots survive sibling mounts when re-applying className", () => {
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
