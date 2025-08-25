import {expect, describe, test} from "@jest/globals";

import {cnBase as cnFull} from "../index";
import {cn as cnLite} from "../lite";
import {cn as cnUtils} from "../utils";

const variants = [
  {name: "full - tailwind-merge", cn: cnFull},
  {name: "lite - without tailwind-merge", cn: cnLite},
  {name: "utils - without tailwind-merge", cn: cnUtils},
];

describe.each(variants)("cn function - $name", ({cn}) => {
  test("should join strings and ignore falsy values", () => {
    expect(cn("text-xl", false && "font-bold", "text-center")).toBe("text-xl text-center");
    expect(cn("text-xl", undefined, null, 0, "")).toBe("text-xl 0");
  });

  test("should join arrays of class names", () => {
    expect(cn(["px-4", "py-2"], "bg-blue-500")).toBe("px-4 py-2 bg-blue-500");
    expect(cn(["px-4", false, ["hover:bg-red-500", null, "rounded-lg"]])).toBe(
      "px-4 hover:bg-red-500 rounded-lg",
    );
  });

  test("should handle nested arrays", () => {
    expect(cn(["px-4", ["py-2", ["bg-blue-500", ["rounded-lg", false, ["shadow-md"]]]]])).toBe(
      "px-4 py-2 bg-blue-500 rounded-lg shadow-md",
    );
  });

  test("should join objects with truthy values as keys", () => {
    expect(cn({"text-sm": true, "font-bold": false, "bg-green-200": 1, "m-0": 0})).toBe(
      "text-sm bg-green-200",
    );
  });

  test("should handle mixed arguments correctly", () => {
    expect(
      cn(
        "text-lg",
        ["px-3", {"hover:bg-yellow-300": true, "focus:outline-none": false}],
        {"rounded-md": true, "shadow-md": null},
        "leading-tight",
      ),
    ).toBe("text-lg px-3 hover:bg-yellow-300 rounded-md leading-tight");
  });

  test("should handle numbers and bigint", () => {
    expect(cn(123, "text-base", 0n, {border: true})).toBe("123 text-base 0 border");
  });

  test("should return undefined for no input", () => {
    expect(cn()).toBeUndefined();
  });

  test("should return '0' for zero and ignore other falsy", () => {
    expect(cn(false, null, undefined, "", 0)).toBe("0");
  });

  test("should normalize template strings with irregular whitespace", () => {
    const input = `
      px-4
      py-2

      bg-blue-500
        rounded-lg
    `;

    expect(cn(input)).toBe("px-4 py-2 bg-blue-500 rounded-lg");

    expect(
      cn(
        ` text-center
          font-semibold  `,
        ["text-sm", `   uppercase   `],
        {"shadow-lg": true, "opacity-50": false},
      ),
    ).toBe("text-center font-semibold text-sm uppercase shadow-lg");
  });

  test("should handle empty and falsy values correctly", () => {
    expect(cn("", null, undefined, false, NaN, 0, "0")).toBe("0 0");
  });
});
