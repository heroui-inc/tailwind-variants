import {describe, expect, test} from "vitest";

import {tv} from "../index";

describe("tv (array variant value targeting base slot)", () => {
  test("applies array variant value to base slot", () => {
    const component = tv({
      base: "font-medium",
      slots: {icon: ""},
      variants: {size: {sm: ["text-sm", "tracking-tight"]}},
    });

    const {base, icon} = component({size: "sm"});

    expect(base()).toHaveClass(["font-medium", "text-sm", "tracking-tight"]);
    expect(icon()).not.toHaveClass(["text-sm", "tracking-tight"]);
  });

  test("applies array variant value to base under default variants", () => {
    const component = tv({
      base: "font-medium",
      slots: {icon: ""},
      variants: {size: {sm: ["text-sm", "tracking-tight"], lg: ["text-lg"]}},
      defaultVariants: {size: "sm"},
    });

    expect(component().base()).toHaveClass(["font-medium", "text-sm", "tracking-tight"]);
    expect(component({size: "lg"}).base()).toHaveClass(["font-medium", "text-lg"]);
  });

  test("keeps array base variant independent of slot-keyed variant values", () => {
    const component = tv({
      base: "font-medium",
      slots: {icon: "block"},
      variants: {
        size: {sm: ["text-sm", "tracking-tight"]},
        color: {red: {icon: "text-red-500"}},
      },
    });

    const {base, icon} = component({size: "sm", color: "red"});

    expect(base()).toHaveClass(["font-medium", "text-sm", "tracking-tight"]);
    expect(icon()).toHaveClass(["block", "text-red-500"]);
  });

  test("filters falsy entries in array variant value", () => {
    const component = tv({
      base: "",
      slots: {icon: ""},
      variants: {size: {sm: ["text-sm", null, false]}},
    });

    const {base} = component({size: "sm"});

    expect(base()).toHaveClass(["text-sm"]);
  });

  test("coexists with string base variant values", () => {
    const component = tv({
      base: "",
      slots: {icon: ""},
      variants: {
        size: {sm: "text-sm", md: ["text-md", "tracking-wide"]},
      },
    });

    expect(component({size: "sm"}).base()).toHaveClass(["text-sm"]);
    expect(component({size: "md"}).base()).toHaveClass(["text-md", "tracking-wide"]);
  });
});
