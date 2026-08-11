import {describe, expect, test} from "vitest";

import {tv} from "../index";

describe("tv (compoundVariants array class without slot key)", () => {
  test("applies array class to base when no slot key is specified", () => {
    const component = tv({
      base: "",
      slots: {title: ""},
      compoundVariants: [{class: ["truncate"]}],
    });

    const {base, title} = component();

    expect(base()).toHaveClass(["truncate"]);
    expect(title()).not.toHaveClass(["truncate"]);
  });

  test("applies array className to base when no slot key is specified", () => {
    const component = tv({
      base: "",
      slots: {title: ""},
      compoundVariants: [{className: ["truncate", "font-bold"]}],
    });

    const {base, title} = component();

    expect(base()).toHaveClass(["truncate", "font-bold"]);
    expect(title()).not.toHaveClass(["truncate", "font-bold"]);
  });

  test("applies array class to base under variant conditions", () => {
    const component = tv({
      base: "font-medium",
      slots: {icon: ""},
      variants: {size: {sm: "text-sm", lg: "text-lg"}},
      compoundVariants: [{size: "sm", class: ["truncate", "underline"]}],
    });

    const {base, icon} = component({size: "sm"});

    expect(base()).toHaveClass(["font-medium", "text-sm", "truncate", "underline"]);
    expect(icon()).not.toHaveClass(["truncate", "underline"]);

    expect(component({size: "lg"}).base()).toHaveClass(["font-medium", "text-lg"]);
  });

  test("keeps array class and slot-keyed object class independent", () => {
    const component = tv({
      base: "text-3xl",
      slots: {title: "text-2xl"},
      variants: {
        color: {primary: {}, tertiary: {}},
      },
      compoundVariants: [
        {color: "tertiary", class: ["color--tertiary-base"]},
        {color: "tertiary", class: {title: "color--tertiary-title"}},
      ],
      defaultVariants: {color: "primary"},
    });

    const {base, title} = component({color: "tertiary"});

    expect(base()).toHaveClass(["text-3xl", "color--tertiary-base"]);
    expect(title()).toHaveClass(["text-2xl", "color--tertiary-title"]);
  });

  test("filters falsy entries in array class targeting base", () => {
    const component = tv({
      base: "",
      slots: {title: ""},
      compoundVariants: [{class: ["truncate", null, false]}],
    });

    const {base, title} = component();

    expect(base()).toHaveClass(["truncate"]);
    expect(title()).not.toHaveClass(["truncate"]);
  });

  test("array class targeting base coexists with scalar string class", () => {
    const component = tv({
      base: "",
      slots: {title: ""},
      compoundVariants: [
        {class: ["truncate"]},
        {class: "font-bold"},
        {class: {title: "title--compound"}},
      ],
    });

    const {base, title} = component();

    expect(base()).toHaveClass(["truncate", "font-bold"]);
    expect(title()).toHaveClass(["title--compound"]);
  });
});
