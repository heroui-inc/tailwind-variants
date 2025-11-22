import {expect, describe, test} from "@jest/globals";

import {cn as cnWithMerge, cx as cxFull} from "../index";
import {cn as cnLite, cx as cxLite} from "../lite";
import {cx as cxUtils} from "../utils";

const cxVariants = [
  {name: "main index", cx: cxFull},
  {name: "lite", cx: cxLite},
  {name: "utils", cx: cxUtils},
];

describe("cn function from lite (simple concatenation)", () => {
  test("should join strings and ignore falsy values", () => {
    expect(cnLite("text-xl", false && "font-bold", "text-center")()).toBe("text-xl text-center");
    expect(cnLite("text-xl", undefined, null, 0, "")()).toBe("text-xl 0");
  });

  test("should join arrays of class names", () => {
    expect(cnLite(["px-4", "py-2"], "bg-blue-500")()).toBe("px-4 py-2 bg-blue-500");
    expect(cnLite(["px-4", false, ["hover:bg-red-500", null, "rounded-lg"]])()).toBe(
      "px-4 hover:bg-red-500 rounded-lg",
    );
  });

  test("should handle nested arrays", () => {
    expect(
      cnLite(["px-4", ["py-2", ["bg-blue-500", ["rounded-lg", false, ["shadow-md"]]]]])(),
    ).toBe("px-4 py-2 bg-blue-500 rounded-lg shadow-md");
  });

  test("should join objects with truthy values as keys", () => {
    expect(cnLite({"text-sm": true, "font-bold": false, "bg-green-200": 1, "m-0": 0})()).toBe(
      "text-sm bg-green-200",
    );
  });

  test("should handle mixed arguments correctly", () => {
    expect(
      cnLite(
        "text-lg",
        ["px-3", {"hover:bg-yellow-300": true, "focus:outline-none": false}],
        {"rounded-md": true, "shadow-md": null},
        "leading-tight",
      )(),
    ).toBe("text-lg px-3 hover:bg-yellow-300 rounded-md leading-tight");
  });

  test("should handle numbers and bigint", () => {
    expect(cnLite(123, "text-base", 0n, {border: true})()).toBe("123 text-base 0 border");
  });

  test("should return undefined for no input", () => {
    expect(cnLite()()).toBeUndefined();
  });

  test("should return '0' for zero and ignore other falsy", () => {
    expect(cnLite(false, null, undefined, "", 0)()).toBe("0");
  });

  test("should normalize template strings with irregular whitespace", () => {
    const input = `
      px-4
      py-2

      bg-blue-500
        rounded-lg
    `;

    expect(cnLite(input)()).toBe("px-4 py-2 bg-blue-500 rounded-lg");

    expect(
      cnLite(
        ` text-center
          font-semibold  `,
        ["text-sm", `   uppercase   `],
        {"shadow-lg": true, "opacity-50": false},
      )(),
    ).toBe("text-center font-semibold text-sm uppercase shadow-lg");
  });

  test("should handle empty and falsy values correctly", () => {
    expect(cnLite("", null, undefined, false, NaN, 0, "0")()).toBe("0 0");
  });
});

describe("cn function with tailwind-merge (main index)", () => {
  test("should merge conflicting tailwind classes when twMerge is true", () => {
    const result = cnWithMerge("px-2", "px-4", "py-2")({twMerge: true});

    expect(result).toBe("px-4 py-2");
  });

  test("should not merge classes when twMerge is false", () => {
    const result = cnWithMerge("px-2", "px-4", "py-2")({twMerge: false});

    expect(result).toBe("px-2 px-4 py-2");
  });

  test("should merge text color classes", () => {
    const result = cnWithMerge("text-red-500", "text-blue-500")({twMerge: true});

    expect(result).toBe("text-blue-500");
  });

  test("should merge background color classes", () => {
    const result = cnWithMerge("bg-red-500", "bg-blue-500")({twMerge: true});

    expect(result).toBe("bg-blue-500");
  });

  test("should merge multiple conflicting classes", () => {
    const result = cnWithMerge("px-2 py-1 text-sm", "px-4 py-2 text-lg")({twMerge: true});

    expect(result).toBe("px-4 py-2 text-lg");
  });

  test("should handle non-conflicting classes", () => {
    const result = cnWithMerge("px-2", "py-2", "text-sm")({twMerge: true});

    expect(result).toBe("px-2 py-2 text-sm");
  });

  test("should return undefined when no classes provided", () => {
    const result = cnWithMerge()({twMerge: true});

    expect(result).toBeUndefined();
  });

  test("should handle arrays with tailwind-merge", () => {
    const result = cnWithMerge(["px-2", "px-4"], "py-2")({twMerge: true});

    expect(result).toBe("px-4 py-2");
  });

  test("should handle objects with tailwind-merge", () => {
    const result = cnWithMerge({"px-2": true, "px-4": true, "py-2": true})({twMerge: true});

    expect(result).toBe("px-4 py-2");
  });

  test("should merge when config is undefined (default behavior)", () => {
    const result = cnWithMerge("px-2", "px-4")({twMerge: true});

    expect(result).toBe("px-4");
  });

  test("should merge classes by default when called directly without ()", () => {
    const result = cnWithMerge("px-2", "px-4", "py-2");

    // Should work as a string in template literals and string coercion
    expect(String(result)).toBe("px-4 py-2");
    expect(`${result}`).toBe("px-4 py-2");
  });

  test("should merge classes by default when no config is provided", () => {
    const result = cnWithMerge("px-2", "px-4", "py-2")();

    expect(result).toBe("px-4 py-2");
  });

  test("should merge text color classes by default when called directly", () => {
    const result = cnWithMerge("text-red-500", "text-blue-500");

    expect(String(result)).toBe("text-blue-500");
  });

  test("should merge text color classes by default when no config is provided", () => {
    const result = cnWithMerge("text-red-500", "text-blue-500")();

    expect(result).toBe("text-blue-500");
  });

  test("should merge background color classes by default when called directly", () => {
    const result = cnWithMerge("bg-red-500", "bg-blue-500");

    expect(String(result)).toBe("bg-blue-500");
  });

  test("should merge background color classes by default when no config is provided", () => {
    const result = cnWithMerge("bg-red-500", "bg-blue-500")();

    expect(result).toBe("bg-blue-500");
  });

  test("should not merge classes when twMerge is explicitly false", () => {
    const result = cnWithMerge("px-2", "px-4", "py-2")({twMerge: false});

    expect(result).toBe("px-2 px-4 py-2");
  });

  test("should merge classes when twMerge is explicitly true (backward compatibility)", () => {
    const result = cnWithMerge("px-2", "px-4", "py-2")({twMerge: true});

    expect(result).toBe("px-4 py-2");
  });

  test("should merge classes when config is empty object (defaults to true)", () => {
    const result = cnWithMerge("px-2", "px-4", "py-2")({});

    expect(result).toBe("px-4 py-2");
  });

  test("should merge classes when config is undefined", () => {
    const result = cnWithMerge("px-2", "px-4", "py-2")(undefined);

    expect(result).toBe("px-4 py-2");
  });
});

describe.each(cxVariants)("cx function - $name", ({cx}) => {
  test("should join strings and ignore falsy values", () => {
    expect(cx("text-xl", false && "font-bold", "text-center")).toBe("text-xl text-center");
    expect(cx("text-xl", undefined, null, 0, "")).toBe("text-xl 0");
  });

  test("should join arrays of class names", () => {
    expect(cx(["px-4", "py-2"], "bg-blue-500")).toBe("px-4 py-2 bg-blue-500");
    expect(cx(["px-4", false, ["hover:bg-red-500", null, "rounded-lg"]])).toBe(
      "px-4 hover:bg-red-500 rounded-lg",
    );
  });

  test("should handle nested arrays", () => {
    expect(cx(["px-4", ["py-2", ["bg-blue-500", ["rounded-lg", false, ["shadow-md"]]]]])).toBe(
      "px-4 py-2 bg-blue-500 rounded-lg shadow-md",
    );
  });

  test("should join objects with truthy values as keys", () => {
    expect(cx({"text-sm": true, "font-bold": false, "bg-green-200": 1, "m-0": 0})).toBe(
      "text-sm bg-green-200",
    );
  });

  test("should handle mixed arguments correctly", () => {
    expect(
      cx(
        "text-lg",
        ["px-3", {"hover:bg-yellow-300": true, "focus:outline-none": false}],
        {"rounded-md": true, "shadow-md": null},
        "leading-tight",
      ),
    ).toBe("text-lg px-3 hover:bg-yellow-300 rounded-md leading-tight");
  });

  test("should handle numbers and bigint", () => {
    expect(cx(123, "text-base", 0n, {border: true})).toBe("123 text-base 0 border");
  });

  test("should return undefined for no input", () => {
    expect(cx()).toBeUndefined();
  });

  test("should return '0' for zero and ignore other falsy", () => {
    expect(cx(false, null, undefined, "", 0)).toBe("0");
  });

  test("should normalize template strings with irregular whitespace", () => {
    const input = `
      px-4
      py-2

      bg-blue-500
        rounded-lg
    `;

    expect(cx(input)).toBe("px-4 py-2 bg-blue-500 rounded-lg");

    expect(
      cx(
        ` text-center
          font-semibold  `,
        ["text-sm", `   uppercase   `],
        {"shadow-lg": true, "opacity-50": false},
      ),
    ).toBe("text-center font-semibold text-sm uppercase shadow-lg");
  });

  test("should handle empty and falsy values correctly", () => {
    expect(cx("", null, undefined, false, NaN, 0, "0")).toBe("0 0");
  });

  test("should NOT merge conflicting classes (simple concatenation)", () => {
    // cx should just concatenate, not merge
    expect(cx("px-2", "px-4", "py-2")).toBe("px-2 px-4 py-2");
  });

  test("should handle conflicting classes without merging", () => {
    expect(cx("text-red-500", "text-blue-500")).toBe("text-red-500 text-blue-500");
  });
});
