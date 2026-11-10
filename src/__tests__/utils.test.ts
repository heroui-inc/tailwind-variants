import {describe, expect, test} from "vitest";

import {tv} from "../index";
import {defineVariants, falsyToString} from "../utils";

describe("falsyToString", () => {
  test("returns a string when given a boolean", () => {
    expect(falsyToString(true)).toBe("true");
    expect(falsyToString(false)).toBe("false");
  });

  test("returns 0 when given 0", () => {
    expect(falsyToString(0)).toBe("0");
  });

  test("returns the original value when given a value other than 0 or a boolean", () => {
    expect(falsyToString("test")).toBe("test");
    expect(falsyToString(4)).toBe(4);
    expect(falsyToString(null)).toBe(null);
  });
});

describe("defineVariants", () => {
  test("returns the options unchanged", () => {
    const options = {base: "font-semibold", variants: {size: {sm: "text-sm"}}};

    expect(defineVariants(options)).toBe(options);
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
});
