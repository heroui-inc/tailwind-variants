import {describe, expect, test} from "vitest";

import {cnMerge, tv} from "../index";

describe("tv.extend (advanced composition)", () => {
  test("merges class arrays with cnMerge", () => {
    const tvResult = ["w-fit", "h-fit"];
    const custom = ["w-full"];

    const resultWithoutMerge = cnMerge(tvResult.concat(custom))({twMerge: false});
    const resultWithMerge = cnMerge(tvResult.concat(custom))({twMerge: true});
    const emptyResultWithoutMerge = cnMerge([].concat([]))({twMerge: false});
    const emptyResultWithMerge = cnMerge([].concat([]))({twMerge: true});

    expect(resultWithoutMerge).toBe("w-fit h-fit w-full");
    expect(resultWithMerge).toBe("h-fit w-full");
    expect(emptyResultWithoutMerge).toBe(undefined);
    expect(emptyResultWithMerge).toBe(undefined);
  });

  test("inherits parent slots when the child only defines a base", () => {
    const menuBase = tv({base: "menuBase"});
    const menu = tv({
      extend: menuBase,
      base: "menu",
      slots: {
        title: "title",
      },
    });

    const {base, title} = menu();

    expect(base()).toHaveClass(["menuBase", "menu"]);
    expect(title()).toHaveClass(["title"]);
  });

  test("supports multi-level extends", () => {
    const themeButton = tv({
      base: "font-medium",
      variants: {
        color: {
          primary: "text-blue-500",
        },
        disabled: {
          true: "opacity-50",
        },
      },
      compoundVariants: [
        {
          color: "primary",
          disabled: true,
          class: "bg-black",
        },
      ],
      defaultVariants: {
        color: "primary",
        disabled: true,
      },
    });

    const appButton = tv({extend: themeButton});
    const button = tv({extend: appButton});

    expect(appButton()).toHaveClass("font-medium text-blue-500 opacity-50 bg-black");
    expect(button()).toHaveClass("font-medium text-blue-500 opacity-50 bg-black");
  });
});
