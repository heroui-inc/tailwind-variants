import type {ClassNameValue} from "tailwind-merge";

import {expect, describe, test} from "@jest/globals";

import {createTV} from "../index";

describe("createTV", () => {
  test("should use config in tv calls", () => {
    const tv = createTV({twMerge: false});
    const h1 = tv({base: "text-3xl font-bold text-blue-400 text-xl text-blue-200"});

    expect(h1()).toHaveClass("text-3xl font-bold text-blue-400 text-xl text-blue-200");
  });

  test("should override config", () => {
    const tv = createTV({twMerge: false});
    const h1 = tv(
      {base: "text-3xl font-bold text-blue-400 text-xl text-blue-200"},
      {twMerge: true},
    );

    expect(h1()).toHaveClass("font-bold text-xl text-blue-200");
  });

  test("should use custom twMerge instance", () => {
    const customTwMerge = (..._classes: ClassNameValue[]) => {
      return "custom-result";
    };

    const tv = createTV({twMerge: true, twMergeFn: customTwMerge});
    const h1 = tv({base: "text-3xl font-bold text-blue-400"});

    expect(h1()).toBe("custom-result");
  });

  test("should use custom twMerge instance with runtime config override", () => {
    const customTwMerge = (..._classes: ClassNameValue[]) => {
      return "runtime-custom-result";
    };

    const tv = createTV({twMerge: true});
    const h1 = tv(
      {base: "text-3xl font-bold text-blue-400"},
      {twMerge: true, twMergeFn: customTwMerge},
    );

    expect(h1()).toBe("runtime-custom-result");
  });

  test("should prefer runtime twMergeFn over createTV twMergeFn", () => {
    const createTVTwMerge = (..._classes: ClassNameValue[]) => {
      return "createTV-result";
    };

    const runtimeTwMerge = (..._classes: ClassNameValue[]) => {
      return "runtime-result";
    };

    const tv = createTV({twMerge: true, twMergeFn: createTVTwMerge});
    const h1 = tv(
      {base: "text-3xl font-bold text-blue-400"},
      {twMerge: true, twMergeFn: runtimeTwMerge},
    );

    expect(h1()).toBe("runtime-result");
  });
});
