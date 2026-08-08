import {describe, expect, test} from "vitest";

import {createTV as createTVFull} from "../index";
import {createTV as createTVLite} from "../lite";

const variants = [
  {name: "full - tailwind-merge", createTV: createTVFull, mode: "full"},
  {name: "lite - without tailwind-merge", createTV: createTVLite, mode: "lite"},
];

describe.each(variants)("createTV ($name)", ({createTV, mode}) => {
  test("respects twMerge config when creating tv instance", () => {
    const tv = createTV({twMerge: false});
    const h1 = tv({
      base: "text-3xl font-bold text-blue-400 text-xl text-blue-200",
    });

    expect(h1()).toHaveClass("text-3xl font-bold text-blue-400 text-xl text-blue-200");
  });

  test("overrides twMerge config on tv call", () => {
    const tv = createTV({twMerge: false});
    const h1 = tv(
      {base: "text-3xl font-bold text-blue-400 text-xl text-blue-200"},
      {twMerge: true},
    );

    // lite mode has no merger, so the twMerge override keeps the original classes
    const expected =
      mode === "lite"
        ? "text-3xl font-bold text-blue-400 text-xl text-blue-200"
        : "font-bold text-xl text-blue-200";

    expect(h1()).toHaveClass(expected);
  });

  test("per-call twMerge false disables merging from a merging instance", () => {
    const tv = createTV({twMerge: true});
    const h1 = tv({base: "px-2 px-4"}, {twMerge: false});

    expect(h1()).toHaveClass("px-2 px-4");
  });

  test("keeps instance config keys not overridden per call", () => {
    const tv = createTV({twMerge: false});
    const h1 = tv({base: "px-2 px-4"}, {twMergeConfig: {}});

    expect(h1()).toHaveClass("px-2 px-4");
  });
});
