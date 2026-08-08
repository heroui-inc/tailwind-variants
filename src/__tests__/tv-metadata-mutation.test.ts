import {describe, expect, test} from "vitest";

import {tv} from "../index";

/*
 * Characterization of post-creation metadata mutation. compoundVariants /
 * compoundSlots invalidation is covered in tv-default and
 * tv-slots-independence; these tests freeze the boundary for the remaining
 * metadata fields so refactors cannot silently change it.
 */
describe("tv metadata mutation (defaultVariants)", () => {
  test("in-place edits take effect in variants mode", () => {
    const button = tv({
      variants: {
        size: {sm: "text-sm", lg: "text-lg"},
      },
      defaultVariants: {size: "sm"},
    });

    button();

    expect(button()).toBe("text-sm");

    button.defaultVariants.size = "lg";

    expect(button()).toBe("text-lg");
  });

  test("in-place edits take effect in slots mode", () => {
    const card = tv({
      slots: {root: "root"},
      variants: {
        size: {sm: {root: "root-sm"}, lg: {root: "root-lg"}},
      },
      defaultVariants: {size: "sm"},
    });

    card();

    expect(card().root()).toHaveClass(["root", "root-sm"]);

    card.defaultVariants.size = "lg";

    expect(card().root()).toHaveClass(["root", "root-lg"]);
  });
});

describe("tv metadata mutation (variants)", () => {
  test("in-place option edits reach only prop combinations not yet cached", () => {
    const button = tv({
      variants: {
        size: {sm: "text-sm", lg: "text-lg"},
      },
    });

    button();
    expect(button({size: "sm"})).toBe("text-sm");
    expect(button({size: "sm"})).toBe("text-sm");

    button.variants.size.sm = "text-sm-edited";
    button.variants.size.lg = "text-lg-edited";

    expect(button({size: "sm"})).toBe("text-sm");
    expect(button({size: "lg"})).toBe("text-lg-edited");
  });

  test("replacing a whole axis after the first call is not picked up", () => {
    const button = tv({
      variants: {
        size: {sm: "text-sm"},
      },
    });

    button();

    button.variants.size = {sm: "replaced"};

    expect(button({size: "sm"})).toBe("text-sm");
  });

  test("replacing a whole axis before the first call is picked up", () => {
    const button = tv({
      variants: {
        size: {sm: "text-sm"},
      },
    });

    button.variants.size = {sm: "replaced"};

    expect(button({size: "sm"})).toBe("replaced");
  });
});

describe("tv metadata mutation (slots)", () => {
  test("in-place slot class edits reach only calls not served from cache", () => {
    const card = tv({
      slots: {root: "root-a", label: "label-a"},
      variants: {
        size: {sm: {root: "r-sm"}, lg: {root: "r-lg"}},
      },
    });

    card({size: "sm"});
    expect(card({size: "sm"}).root()).toHaveClass(["root-a", "r-sm"]);

    card.slots.root = "root-b";

    expect(card({size: "sm"}).root()).toHaveClass(["root-a", "r-sm"]);
    expect(card({size: "lg"}).root()).toHaveClass(["root-b", "r-lg"]);
  });

  test("adding a slot after the first call is not picked up", () => {
    const panel = tv({slots: {root: "root"}});

    panel();

    (panel.slots as Record<string, string>).extra = "extra";

    expect("extra" in panel()).toBe(false);
  });

  test("adding a slot before the first call is picked up", () => {
    const panel = tv({slots: {root: "root"}});

    (panel.slots as Record<string, string>).extra = "extra";

    const slots = panel() as Record<string, () => string | undefined>;

    expect(slots.extra()).toBe("extra");
  });
});
