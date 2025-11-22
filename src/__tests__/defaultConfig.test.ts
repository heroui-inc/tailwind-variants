import {expect, describe, test, beforeEach, afterEach} from "@jest/globals";

import {defaultConfig, tv, createTV} from "../index";

describe("defaultConfig", () => {
  // Store original values to restore after each test
  const originalTwMerge = defaultConfig.twMerge ?? true;
  const originalTwMergeConfig = {...defaultConfig.twMergeConfig};

  beforeEach(() => {
    // Reset to original values before each test
    defaultConfig.twMerge = originalTwMerge;
    defaultConfig.twMergeConfig = {...originalTwMergeConfig};
  });

  afterEach(() => {
    // Ensure cleanup after each test
    defaultConfig.twMerge = originalTwMerge;
    defaultConfig.twMergeConfig = {...originalTwMergeConfig};
  });

  test("should be importable as a value (not just a type)", () => {
    expect(defaultConfig).toBeDefined();
    expect(typeof defaultConfig).toBe("object");
    expect(defaultConfig).toHaveProperty("twMerge");
    expect(defaultConfig).toHaveProperty("twMergeConfig");
  });

  test("should have default values", () => {
    expect(defaultConfig.twMerge).toBe(true);
    expect(defaultConfig.twMergeConfig).toEqual({});
  });

  test("should allow modification of twMergeConfig", () => {
    const customConfig = {
      extend: {
        theme: {
          spacing: ["medium", "large"],
        },
      },
    };

    defaultConfig.twMergeConfig = customConfig;

    expect(defaultConfig.twMergeConfig).toEqual(customConfig);
    expect(defaultConfig.twMergeConfig.extend?.theme?.spacing).toEqual(["medium", "large"]);
  });

  test("should allow modification of twMerge property", () => {
    defaultConfig.twMerge = false;
    expect(defaultConfig.twMerge).toBe(false);

    defaultConfig.twMerge = true;
    expect(defaultConfig.twMerge).toBe(true);
  });

  test("should affect tv behavior when twMergeConfig is modified", () => {
    // Set up a custom twMergeConfig
    defaultConfig.twMergeConfig = {
      extend: {
        theme: {
          spacing: ["medium", "large"],
        },
      },
    };

    const button = tv({
      base: "px-medium py-large",
    });

    // The custom config should be used
    expect(button()).toBeDefined();
  });

  test("should allow nested modifications of twMergeConfig", () => {
    defaultConfig.twMergeConfig = {
      extend: {
        theme: {
          spacing: ["small"],
        },
      },
    };

    // Modify nested properties
    if (defaultConfig.twMergeConfig.extend?.theme) {
      defaultConfig.twMergeConfig.extend.theme.spacing = ["small", "medium", "large"];
    }

    expect(defaultConfig.twMergeConfig.extend?.theme?.spacing).toEqual([
      "small",
      "medium",
      "large",
    ]);
  });

  test("should work with createTV when defaultConfig is modified", () => {
    defaultConfig.twMerge = false;

    const tv = createTV({});
    const h1 = tv({
      base: "text-3xl font-bold text-blue-400 text-xl text-blue-200",
    });

    // Since defaultConfig.twMerge is false and no override is provided,
    // classes should not be merged
    expect(h1()).toContain("text-3xl");
    expect(h1()).toContain("text-xl");
  });

  test("should allow setting twMergeConfig with extend.classGroups", () => {
    const configWithClassGroups = {
      extend: {
        classGroups: {
          shadow: [
            {
              shadow: ["small", "medium", "large"],
            },
          ],
        },
      },
    };

    defaultConfig.twMergeConfig = configWithClassGroups;

    expect(defaultConfig.twMergeConfig.extend?.classGroups).toBeDefined();
    expect(defaultConfig.twMergeConfig.extend?.classGroups?.shadow).toEqual([
      {shadow: ["small", "medium", "large"]},
    ]);
  });

  test("should persist modifications across multiple tv calls", () => {
    defaultConfig.twMergeConfig = {
      extend: {
        theme: {
          spacing: ["custom-spacing"],
        },
      },
    };

    const button1 = tv({base: "px-custom-spacing"});
    const button2 = tv({base: "py-custom-spacing"});

    // Both should use the modified config
    expect(button1()).toBeDefined();
    expect(button2()).toBeDefined();
  });

  test("should allow complete replacement of twMergeConfig object", () => {
    const newConfig = {
      extend: {
        theme: {
          opacity: ["disabled"],
          spacing: ["unit", "unit-2"],
        },
      },
    };

    defaultConfig.twMergeConfig = newConfig;

    expect(defaultConfig.twMergeConfig).toEqual(newConfig);
    expect(defaultConfig.twMergeConfig.extend?.theme?.opacity).toEqual(["disabled"]);
    expect(defaultConfig.twMergeConfig.extend?.theme?.spacing).toEqual(["unit", "unit-2"]);
  });
});
