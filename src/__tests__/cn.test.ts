import {describe, expect, test} from "vitest";

import {cn, cnMerge, cx as cxFull} from "../index";
import {cn as cnLite, cx as cxLite} from "../lite";
import {cx as cxUtils} from "../utils";

const cxVariants = [
  {name: "main index", cx: cxFull},
  {name: "lite", cx: cxLite},
  {name: "utils", cx: cxUtils},
];

describe("cnLite", () => {
  test("joins strings and ignores falsy values", () => {
    expect(cnLite("text-xl", false && "font-bold", "text-center")()).toBe("text-xl text-center");
    expect(cnLite("text-xl", undefined, null, 0, "")()).toBe("text-xl 0");
  });

  test("joins arrays of class names", () => {
    expect(cnLite(["px-4", "py-2"], "bg-blue-500")()).toBe("px-4 py-2 bg-blue-500");
    expect(cnLite(["px-4", false, ["hover:bg-red-500", null, "rounded-lg"]])()).toBe(
      "px-4 hover:bg-red-500 rounded-lg",
    );
  });

  test("handles nested arrays", () => {
    expect(
      cnLite(["px-4", ["py-2", ["bg-blue-500", ["rounded-lg", false, ["shadow-md"]]]]])(),
    ).toBe("px-4 py-2 bg-blue-500 rounded-lg shadow-md");
  });

  test("joins objects with truthy values as keys", () => {
    expect(cnLite({"text-sm": true, "font-bold": false, "bg-green-200": 1, "m-0": 0})()).toBe(
      "text-sm bg-green-200",
    );
  });

  test("handles mixed class value arguments", () => {
    expect(
      cnLite(
        "text-lg",
        ["px-3", {"hover:bg-yellow-300": true, "focus:outline-none": false}],
        {"rounded-md": true, "shadow-md": null},
        "leading-tight",
      )(),
    ).toBe("text-lg px-3 hover:bg-yellow-300 rounded-md leading-tight");
  });

  test("handles numbers and bigint", () => {
    expect(cnLite(123, "text-base", 0n, {border: true})()).toBe("123 text-base 0 border");
  });

  test("returns undefined for no input", () => {
    expect(cnLite()()).toBeUndefined();
  });

  test("returns '0' for zero and ignores other falsy values", () => {
    expect(cnLite(false, null, undefined, "", 0)()).toBe("0");
  });

  test("normalizes template strings with irregular whitespace", () => {
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

  test("handles empty and falsy values", () => {
    expect(cnLite("", null, undefined, false, NaN, 0, "0")()).toBe("0 0");
  });
});

describe("cn", () => {
  test("merges conflicting Tailwind classes by default", () => {
    const result = cn("px-2", "px-4", "py-2");

    expect(result).toBe("px-4 py-2");
  });

  test("merges text color classes by default", () => {
    const result = cn("text-red-500", "text-blue-500");

    expect(result).toBe("text-blue-500");
  });

  test("merges background color classes by default", () => {
    const result = cn("bg-red-500", "bg-blue-500");

    expect(result).toBe("bg-blue-500");
  });

  test("merges multiple conflicting classes", () => {
    const result = cn("px-2 py-1 text-sm", "px-4 py-2 text-lg");

    expect(result).toBe("px-4 py-2 text-lg");
  });

  test("handles non-conflicting classes", () => {
    const result = cn("px-2", "py-2", "text-sm");

    expect(result).toBe("px-2 py-2 text-sm");
  });

  test("returns undefined when no classes provided", () => {
    const result = cn();

    expect(result).toBeUndefined();
  });

  test("handles arrays with tailwind-merge", () => {
    const result = cn(["px-2", "px-4"], "py-2");

    expect(result).toBe("px-4 py-2");
  });

  test("handles objects with tailwind-merge", () => {
    const result = cn({"px-2": true, "px-4": true, "py-2": true});

    expect(result).toBe("px-4 py-2");
  });

  test("handles complex className with conditional object classes", () => {
    const selectedZoom: string = "a";
    const key: string = "b";

    const result = cn(
      "text-foreground ease-in-out-quad absolute left-1/2 top-1/2 origin-center -translate-x-1/2 -translate-y-1/2 scale-75 text-[21px] font-medium opacity-0 transition-[scale,opacity] duration-[300ms] ease-[cubic-bezier(0.33,1,0.68,1)] data-[selected=true]:scale-100 data-[selected=true]:opacity-100 data-[selected=true]:delay-200",
      {
        "sr-only": selectedZoom !== key,
      },
    );

    expect(result).toContain("text-foreground");
    expect(result).toContain("sr-only");
    expect(typeof result).toBe("string");
  });

  test("handles conditional object classes when condition is false", () => {
    const selectedZoom: string = "a";
    const key: string = "a";

    const result = cn("text-xl font-bold", {
      "sr-only": selectedZoom !== key,
    });

    expect(result).toBe("text-xl font-bold");
    expect(result).not.toContain("sr-only");
  });
});

describe("cnMerge", () => {
  test("merges conflicting Tailwind classes when twMerge is true", () => {
    const result = cnMerge("px-2", "px-4", "py-2")({twMerge: true});

    expect(result).toBe("px-4 py-2");
  });

  test("does not merge classes when twMerge is false", () => {
    const result = cnMerge("px-2", "px-4", "py-2")({twMerge: false});

    expect(result).toBe("px-2 px-4 py-2");
  });

  test("merges text color classes", () => {
    const result = cnMerge("text-red-500", "text-blue-500")({twMerge: true});

    expect(result).toBe("text-blue-500");
  });

  test("merges background color classes", () => {
    const result = cnMerge("bg-red-500", "bg-blue-500")({twMerge: true});

    expect(result).toBe("bg-blue-500");
  });

  test("merges multiple conflicting classes", () => {
    const result = cnMerge("px-2 py-1 text-sm", "px-4 py-2 text-lg")({twMerge: true});

    expect(result).toBe("px-4 py-2 text-lg");
  });

  test("handles non-conflicting classes", () => {
    const result = cnMerge("px-2", "py-2", "text-sm")({twMerge: true});

    expect(result).toBe("px-2 py-2 text-sm");
  });

  test("returns undefined when no classes provided", () => {
    const result = cnMerge()({twMerge: true});

    expect(result).toBeUndefined();
  });

  test("handles arrays with tailwind-merge", () => {
    const result = cnMerge(["px-2", "px-4"], "py-2")({twMerge: true});

    expect(result).toBe("px-4 py-2");
  });

  test("handles objects with tailwind-merge", () => {
    const result = cnMerge({"px-2": true, "px-4": true, "py-2": true})({twMerge: true});

    expect(result).toBe("px-4 py-2");
  });

  test("merges classes by default when no config is provided", () => {
    const result = cnMerge("px-2", "px-4", "py-2")();

    expect(result).toBe("px-4 py-2");
  });

  test("merges classes when config is undefined", () => {
    const result = cnMerge("px-2", "px-4", "py-2")(undefined);

    expect(result).toBe("px-4 py-2");
  });

  test("merges classes when config is empty object (defaults to true)", () => {
    const result = cnMerge("px-2", "px-4", "py-2")({});

    expect(result).toBe("px-4 py-2");
  });

  test("does not merge classes when twMerge is explicitly false", () => {
    const result = cnMerge("px-2", "px-4", "py-2")({twMerge: false});

    expect(result).toBe("px-2 px-4 py-2");
  });

  test("merges classes when twMerge is explicitly true", () => {
    const result = cnMerge("px-2", "px-4", "py-2")({twMerge: true});

    expect(result).toBe("px-4 py-2");
  });

  test("handles complex className with conditional object classes", () => {
    const selectedZoom: string = "a";
    const key: string = "b";

    const result = cnMerge(
      "text-foreground ease-in-out-quad absolute left-1/2 top-1/2 origin-center -translate-x-1/2 -translate-y-1/2 scale-75 text-[21px] font-medium opacity-0 transition-[scale,opacity] duration-[300ms] ease-[cubic-bezier(0.33,1,0.68,1)] data-[selected=true]:scale-100 data-[selected=true]:opacity-100 data-[selected=true]:delay-200",
      {
        "sr-only": selectedZoom !== key,
      },
    )();

    expect(result).toContain("text-foreground");
    expect(result).toContain("sr-only");
    expect(typeof result).toBe("string");
  });
});

describe.each(cxVariants)("cx ($name export)", ({cx}) => {
  test("joins strings and ignores falsy values", () => {
    expect(cx("text-xl", false && "font-bold", "text-center")).toBe("text-xl text-center");
    expect(cx("text-xl", undefined, null, 0, "")).toBe("text-xl 0");
  });

  test("joins arrays of class names", () => {
    expect(cx(["px-4", "py-2"], "bg-blue-500")).toBe("px-4 py-2 bg-blue-500");
    expect(cx(["px-4", false, ["hover:bg-red-500", null, "rounded-lg"]])).toBe(
      "px-4 hover:bg-red-500 rounded-lg",
    );
  });

  test("handles nested arrays", () => {
    expect(cx(["px-4", ["py-2", ["bg-blue-500", ["rounded-lg", false, ["shadow-md"]]]]])).toBe(
      "px-4 py-2 bg-blue-500 rounded-lg shadow-md",
    );
  });

  test("joins objects with truthy values as keys", () => {
    expect(cx({"text-sm": true, "font-bold": false, "bg-green-200": 1, "m-0": 0})).toBe(
      "text-sm bg-green-200",
    );
  });

  test("handles mixed class value arguments", () => {
    expect(
      cx(
        "text-lg",
        ["px-3", {"hover:bg-yellow-300": true, "focus:outline-none": false}],
        {"rounded-md": true, "shadow-md": null},
        "leading-tight",
      ),
    ).toBe("text-lg px-3 hover:bg-yellow-300 rounded-md leading-tight");
  });

  test("handles numbers and bigint", () => {
    expect(cx(123, "text-base", 0n, {border: true})).toBe("123 text-base 0 border");
  });

  test("returns undefined for no input", () => {
    expect(cx()).toBeUndefined();
  });

  test("returns '0' for zero and ignores other falsy values", () => {
    expect(cx(false, null, undefined, "", 0)).toBe("0");
  });

  test("normalizes template strings with irregular whitespace", () => {
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

  test("handles empty and falsy values", () => {
    expect(cx("", null, undefined, false, NaN, 0, "0")).toBe("0 0");
  });

  test("does not merge conflicting classes (simple concatenation)", () => {
    // cx should just concatenate, not merge
    expect(cx("px-2", "px-4", "py-2")).toBe("px-2 px-4 py-2");
  });

  test("handles conflicting classes without merging", () => {
    expect(cx("text-red-500", "text-blue-500")).toBe("text-red-500 text-blue-500");
  });
});
