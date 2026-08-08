import {afterEach, describe, expect, test} from "vitest";

import {createTV, defaultConfig, tv} from "../index";
import {state} from "../internal/state.js";

const originalTwMerge = defaultConfig.twMerge ?? true;
const originalTwMergeConfig = defaultConfig.twMergeConfig ?? {};

afterEach(() => {
  defaultConfig.twMerge = originalTwMerge;
  defaultConfig.twMergeConfig = originalTwMergeConfig;
  state.reset();
});

describe("defaultConfig", () => {
  test("exports merging enabled with an empty merge config", () => {
    expect(defaultConfig.twMerge).toBe(true);
    expect(defaultConfig.twMergeConfig).toEqual({});
  });

  test("disabling twMerge affects components created afterwards", () => {
    defaultConfig.twMerge = false;

    const unmerged = tv({base: "px-2 px-4"});

    expect(unmerged()).toBe("px-2 px-4");

    defaultConfig.twMerge = true;

    const merged = tv({base: "px-2 px-4"});

    expect(merged()).toBe("px-4");
  });

  test("twMergeConfig edits change how conflicts resolve", () => {
    defaultConfig.twMergeConfig = {classGroups: {custom: ["foo-a", "foo-b"]}};

    const withGroup = tv({base: "foo-a foo-b"});

    expect(withGroup()).toBe("foo-b");
  });

  test("without a custom group the same classes do not conflict", () => {
    const plain = tv({base: "foo-a foo-b"});

    expect(plain()).toBe("foo-a foo-b");
  });

  test("twMergeConfig edits apply across multiple components", () => {
    defaultConfig.twMergeConfig = {
      classGroups: {
        custom: ["foo-a", "foo-b"],
        other: ["bar-a", "bar-b"],
      },
    };

    expect(tv({base: "foo-a foo-b"})()).toBe("foo-b");
    expect(tv({base: "bar-a bar-b"})()).toBe("bar-b");
  });

  test("createTV spreads its config over mutated defaults", () => {
    defaultConfig.twMerge = false;

    const inheriting = createTV({});
    const overriding = createTV({twMerge: true});

    expect(inheriting({base: "px-2 px-4"})()).toBe("px-2 px-4");
    expect(overriding({base: "px-2 px-4"})()).toBe("px-4");
  });
});
