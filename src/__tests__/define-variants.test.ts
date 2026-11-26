import {describe, expect, test} from "vitest";

import {createTV, defineVariants as customDefineVariants, tv as customTV} from "../config-entry";
import {defineVariants, tv} from "../index";
import {defineVariants as liteDefineVariants, tv as liteTV} from "../lite";

const chipTheme = defineVariants({
  slots: {base: "inline-flex", icon: "shrink-0"},
  variants: {size: {sm: {base: "h-8"}, lg: {base: "h-12"}}, disabled: {true: "opacity-50"}},
  compoundVariants: [{size: "sm", disabled: true, class: {icon: "size-3"}}],
  compoundSlots: [{slots: ["base", "icon"], size: "lg", class: "gap-2"}],
  defaultVariants: {size: "sm"},
});
const inlineChip = tv({
  slots: {base: "inline-flex", icon: "shrink-0"},
  variants: {size: {sm: {base: "h-8"}, lg: {base: "h-12"}}, disabled: {true: "opacity-50"}},
  compoundVariants: [{size: "sm", disabled: true, class: {icon: "size-3"}}],
  compoundSlots: [{slots: ["base", "icon"], size: "lg", class: "gap-2"}],
  defaultVariants: {size: "sm"},
});
const chipProps = [{}, {size: "lg"}, {size: "sm", disabled: true}, {disabled: false}] as const;

const chipSlots = (recipe: any, props: object) => {
  const {base, icon} = recipe(props);

  return {base: base(), icon: icon()};
};

describe("defineVariants", () => {
  test("returns the options unchanged", () => {
    const options = {base: "font-semibold", variants: {size: {sm: "text-sm"}}};

    expect(defineVariants(options)).toBe(options);
    expect(liteDefineVariants(options)).toBe(options);
    expect(customDefineVariants(options)).toBe(options);
  });

  test("adds no brand key at runtime", () => {
    expect("~tv" in chipTheme).toBe(false);
    expect(Object.keys(chipTheme)).not.toContain("~tv");
  });

  test("builds the same recipe as inline options", () => {
    const options = defineVariants({
      slots: {base: "inline-flex", icon: "shrink-0"},
      variants: {size: {sm: {base: "h-8"}, lg: {base: "h-12"}}},
      compoundVariants: [{size: "sm", class: {icon: "size-3"}}],
      defaultVariants: {size: "sm"},
    });
    const {base, icon} = tv(options)();

    expect(base()).toBe("inline-flex h-8");
    expect(icon()).toBe("shrink-0 size-3");
  });

  test("matches inline options with compoundSlots and compoundVariants", () => {
    for (const props of chipProps) {
      expect(chipSlots(tv(chipTheme), props)).toEqual(chipSlots(inlineChip, props));
    }
  });

  test("works with the lite, createTV and config entries", () => {
    const createdTV = createTV({twMerge: false});
    const noMerge = tv(chipTheme, {twMerge: false});

    for (const props of chipProps) {
      expect(chipSlots(liteTV(liteDefineVariants(chipTheme)), props)).toEqual(
        chipSlots(noMerge, props),
      );
      expect(chipSlots(createdTV(customDefineVariants(chipTheme)), props)).toEqual(
        chipSlots(noMerge, props),
      );
      expect(chipSlots(customTV(chipTheme), props)).toEqual(chipSlots(inlineChip, props));
    }
  });

  test("matches inline options with multiple extends", () => {
    const focusable = tv({base: "ring", variants: {focus: {on: "ring-2"}}});
    const animated = tv({base: "transition", variants: {speed: {fast: "duration-100"}}});
    const cardTheme = defineVariants({
      extend: [focusable, animated],
      variants: {tone: {muted: "bg-gray-100"}},
      compoundVariants: [{focus: "on", speed: "fast", class: "shadow"}],
    });
    const inlineCard = tv({
      extend: [focusable, animated],
      variants: {tone: {muted: "bg-gray-100"}},
      compoundVariants: [{focus: "on", speed: "fast", class: "shadow"}],
    });
    const card = tv(cardTheme);

    for (const props of [{}, {focus: "on", speed: "fast"}, {tone: "muted"}] as const) {
      expect(card(props)).toBe(inlineCard(props));
    }
    expect(card({focus: "on", speed: "fast"})).toHaveClass("transition ring-2 duration-100 shadow");
  });

  test("lets a spread override fields without changing the original", () => {
    const large = tv({...chipTheme, defaultVariants: {size: "lg"}});
    const toned = tv({
      ...chipTheme,
      variants: {...chipTheme.variants, tone: {red: "text-red-500"}},
    });

    expect(large().base()).toBe(inlineChip({size: "lg"}).base());
    expect(toned({tone: "red"}).base()).toHaveClass("inline-flex h-8 text-red-500");
    expect(chipTheme.defaultVariants.size).toBe("sm");
  });

  test("builds a recipe that can be extended", () => {
    const extended = tv({extend: tv(chipTheme), variants: {tone: {red: "text-red-500"}}});
    const extendedInline = tv({extend: inlineChip, variants: {tone: {red: "text-red-500"}}});

    for (const props of [{size: "lg", tone: "red"}, {}] as const) {
      expect(chipSlots(extended, props)).toEqual(chipSlots(extendedInline, props));
    }
  });
});
