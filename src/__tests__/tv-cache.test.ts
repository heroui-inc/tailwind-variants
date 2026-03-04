import {expect, describe, test} from "@jest/globals";

import {tv} from "../index";

describe("Tailwind Variants (TV) - Slot Caching", () => {
  test("should return cached strings for repeated calls with same variant props", () => {
    const menu = tv({
      base: "base-class",
      slots: {
        title: "title-class",
        item: "item-class",
      },
      variants: {
        color: {
          primary: {
            title: "title--primary",
            item: "item--primary",
          },
          secondary: {
            title: "title--secondary",
            item: "item--secondary",
          },
        },
      },
    });

    const result1 = menu({color: "primary"});
    const result2 = menu({color: "primary"});

    // Slot functions should return identical strings (reference equality)
    expect(result1.base()).toBe(result2.base());
    expect(result1.title()).toBe(result2.title());
    expect(result1.item()).toBe(result2.item());
  });

  test("should return different strings for different variant props", () => {
    const menu = tv({
      base: "base-class",
      slots: {
        title: "title-class",
      },
      variants: {
        color: {
          primary: {title: "title--primary"},
          secondary: {title: "title--secondary"},
        },
      },
    });

    const primary = menu({color: "primary"});
    const secondary = menu({color: "secondary"});

    expect(primary.title()).not.toBe(secondary.title());
    expect(primary.title()).toBe("title-class title--primary");
    expect(secondary.title()).toBe("title-class title--secondary");
  });

  test("should bypass cache when slot-level overrides are provided", () => {
    const menu = tv({
      base: "base-class",
      slots: {
        title: "text-sm",
      },
      variants: {
        color: {
          primary: {title: "text-blue-500"},
        },
      },
    });

    const result = menu({color: "primary"});

    // No override — uses cached string
    const noOverride = result.title();

    // With className override — bypasses cache, runs tw-merge
    const withOverride = result.title({className: "text-red-500"});

    expect(noOverride).toBe("text-sm text-blue-500");
    expect(withOverride).toBe("text-sm text-red-500");
  });

  test("should bypass cache when slot-level variant overrides are provided", () => {
    const menu = tv({
      base: "base-class",
      slots: {
        title: "title-class",
      },
      variants: {
        color: {
          primary: {title: "title--primary"},
          secondary: {title: "title--secondary"},
        },
      },
    });

    const result = menu({color: "primary"});

    // No override — cached
    expect(result.title()).toBe("title-class title--primary");

    // Slot-level variant override — bypasses cache
    expect(result.title({color: "secondary"})).toBe("title-class title--secondary");
  });

  test("should cache correctly with compoundVariants", () => {
    const button = tv({
      base: "base-class",
      slots: {
        label: "label-class",
      },
      variants: {
        variant: {
          solid: {label: "label--solid"},
          outline: {label: "label--outline"},
        },
        color: {
          primary: {label: "label--primary"},
          danger: {label: "label--danger"},
        },
      },
      compoundVariants: [
        {
          variant: "solid",
          color: "danger",
          class: {label: "label--solid-danger"},
        },
      ],
    });

    const result1 = button({variant: "solid", color: "danger"});
    const result2 = button({variant: "solid", color: "danger"});

    // Compound variant classes should be included
    expect(result1.label()).toContain("label--solid-danger");

    // Should be cached (reference equality)
    expect(result1.label()).toBe(result2.label());

    // Different variant combo should not include compound classes
    const result3 = button({variant: "outline", color: "danger"});

    expect(result3.label()).not.toContain("label--solid-danger");
  });

  test("should cache correctly with defaultVariants", () => {
    const menu = tv({
      base: "base-class",
      slots: {
        title: "title-class",
      },
      variants: {
        color: {
          primary: {title: "title--primary"},
          secondary: {title: "title--secondary"},
        },
      },
      defaultVariants: {
        color: "primary",
      },
    });

    // No args — uses default variant
    const withDefault = menu();
    // Explicit same value as default
    const withExplicit = menu({color: "primary"});

    expect(withDefault.title()).toBe("title-class title--primary");
    expect(withExplicit.title()).toBe("title-class title--primary");
  });

  test("should cache correctly with extend", () => {
    const baseMenu = tv({
      base: "base-class",
      slots: {
        title: "title-class",
      },
      variants: {
        size: {
          sm: {title: "title--sm"},
          md: {title: "title--md"},
        },
      },
    });

    const extendedMenu = tv({
      extend: baseMenu,
      variants: {
        color: {
          primary: {title: "title--primary"},
        },
      },
    });

    const result1 = extendedMenu({size: "sm", color: "primary"});
    const result2 = extendedMenu({size: "sm", color: "primary"});

    // Should include both parent and child variant classes
    expect(result1.title()).toContain("title--sm");
    expect(result1.title()).toContain("title--primary");

    // Should be cached
    expect(result1.title()).toBe(result2.title());
  });

  test("should not affect non-slot components", () => {
    const badge = tv({
      base: "badge-base",
      variants: {
        color: {
          primary: "badge--primary",
          secondary: "badge--secondary",
        },
      },
    });

    // Non-slot components return strings directly, no caching needed
    expect(badge({color: "primary"})).toBe("badge-base badge--primary");
    expect(badge({color: "secondary"})).toBe("badge-base badge--secondary");
  });

  test("should cache correctly with boolean variants", () => {
    const button = tv({
      base: "base-class",
      slots: {
        label: "label-class",
      },
      variants: {
        disabled: {
          true: {label: "label--disabled"},
        },
      },
    });

    const result1 = button({disabled: true});
    const result2 = button({disabled: true});

    expect(result1.label()).toContain("label--disabled");
    expect(result1.label()).toBe(result2.label());

    // false should produce different result
    const result3 = button({disabled: false});

    expect(result3.label()).not.toContain("label--disabled");
  });

  test("should isolate caches between different tv definitions", () => {
    const menu1 = tv({
      base: "menu1-base",
      slots: {
        title: "menu1-title",
      },
      variants: {
        color: {
          primary: {title: "menu1--primary"},
        },
      },
    });

    const menu2 = tv({
      base: "menu2-base",
      slots: {
        title: "menu2-title",
      },
      variants: {
        color: {
          primary: {title: "menu2--primary"},
        },
      },
    });

    const r1 = menu1({color: "primary"});
    const r2 = menu2({color: "primary"});

    // Each tv() definition has its own cache
    expect(r1.title()).toBe("menu1-title menu1--primary");
    expect(r2.title()).toBe("menu2-title menu2--primary");
  });

  test("should cache correctly with compoundSlots", () => {
    const button = tv({
      base: "base-class",
      slots: {
        label: "label-class",
        icon: "icon-class",
      },
      variants: {
        size: {
          sm: {label: "label--sm", icon: "icon--sm"},
          md: {label: "label--md", icon: "icon--md"},
        },
      },
      compoundSlots: [
        {
          slots: ["label", "icon"],
          size: "sm",
          class: "compound-sm",
        },
      ],
    });

    const result1 = button({size: "sm"});
    const result2 = button({size: "sm"});

    // Compound slot classes should be included
    expect(result1.label()).toContain("compound-sm");
    expect(result1.icon()).toContain("compound-sm");

    // Should be cached
    expect(result1.label()).toBe(result2.label());
    expect(result1.icon()).toBe(result2.icon());
  });
});
