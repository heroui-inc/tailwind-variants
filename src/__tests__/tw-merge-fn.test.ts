import {afterEach, describe, expect, test} from "vitest";

import {createTV as createTVFull} from "../index";
import {state} from "../internal/state.js";
import {cn as cnLite, createCN, createTV as createTVLite, cx} from "../lite";

afterEach(() => {
  state.reset();
});

const lastPadding = (classList: string) => {
  const tokens = classList.split(" ");
  const padding = tokens.filter((token) => token.startsWith("px-")).at(-1);
  const rest = tokens.filter((token) => !token.startsWith("px-"));

  return [padding, ...rest].filter(Boolean).join(" ");
};

describe("lite createTV twMerge function", () => {
  test("uses the injected function", () => {
    const tv = createTVLite({twMerge: () => "merged"});

    expect(tv({base: "px-2 px-4"})()).toBe("merged");
  });

  test("can keep last padding like a real merger", () => {
    const tv = createTVLite({twMerge: lastPadding});

    expect(tv({base: "px-2 px-4"})()).toHaveClass("px-4");
  });

  test("concatenates when no function is provided", () => {
    expect(createTVLite()({base: "px-2 px-4"})()).toHaveClass("px-2 px-4");
  });

  test("concatenates when twMerge is false", () => {
    expect(createTVLite({twMerge: false})({base: "px-2 px-4"})()).toHaveClass("px-2 px-4");
  });

  test("concatenates when twMerge is true", () => {
    expect(createTVLite({twMerge: true})({base: "px-2 px-4"})()).toHaveClass("px-2 px-4");
  });

  test("cn honors a merge function", () => {
    expect(cnLite("px-2", "px-4")({twMerge: lastPadding})).toHaveClass("px-4");
    expect(cnLite("px-2", "px-4")({twMerge: true})).toHaveClass("px-2 px-4");
  });
});

describe("full createTV twMerge function", () => {
  test("uses the injected function instead of the built-in merger", () => {
    const tv = createTVFull({twMerge: () => "custom"});

    expect(tv({base: "px-2 px-4"})()).toBe("custom");
  });

  test("default still merges conflicting classes", () => {
    const tv = createTVFull({twMerge: true});

    expect(tv({base: "px-2 px-4"})()).toHaveClass("px-4");
  });

  test("per-call twMerge false keeps both classes after a factory function", () => {
    const tv = createTVFull({twMerge: lastPadding});
    const styles = tv({base: "px-2 px-4"}, {twMerge: false});

    expect(styles()).toHaveClass("px-2 px-4");
  });
});

describe("lite createCN", () => {
  test("returns cx when no merge function is provided", () => {
    expect(createCN()).toBe(cx);
    expect(createCN({twMerge: false})).toBe(cx);
    expect(createCN({twMerge: true})).toBe(cx);
  });

  test("uses the injected function", () => {
    const cn = createCN({twMerge: lastPadding});

    expect(cn("px-2", "px-4")).toHaveClass("px-4");
  });

  test("skips the merger for a single token", () => {
    const merge = (classList: string) => `merged:${classList}`;
    const cn = createCN({twMerge: merge});

    expect(cn("px-4")).toBe("px-4");
    expect(cn("px-2", "px-4")).toBe("merged:px-2 px-4");
  });

  test("skips the merger for an empty result", () => {
    const merge = () => "should-not-run";
    const cn = createCN({twMerge: merge});

    expect(cn()).toBe("");
  });
});

describe("lite tv per-call twMerge", () => {
  test("per-call function overrides a join-only factory", () => {
    const tv = createTVLite();
    const styles = tv({base: "px-2 px-4"}, {twMerge: lastPadding});

    expect(styles()).toHaveClass("px-4");
  });

  test("per-call false disables a factory function", () => {
    const tv = createTVLite({twMerge: lastPadding});
    const styles = tv({base: "px-2 px-4"}, {twMerge: false});

    expect(styles()).toHaveClass("px-2 px-4");
  });
});
