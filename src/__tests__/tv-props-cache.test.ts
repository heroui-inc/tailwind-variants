import {describe, expect, test} from "vitest";

import {cnMerge, tv} from "../index";

describe("tv props cache (key ordering)", () => {
  test("returns identical results regardless of prop key order", () => {
    const button = tv({
      base: "font-medium",
      variants: {
        size: {sm: "text-sm", lg: "text-lg"},
        color: {red: "text-red-500", blue: "text-blue-500"},
      },
    });

    button();

    const forward = button({size: "sm", color: "red"});
    const reversed = button({color: "red", size: "sm"});

    expect(forward).toBe(reversed);
    expect(forward).toHaveClass(["font-medium", "text-sm", "text-red-500"]);
    expect(button({size: "lg", color: "blue"})).toHaveClass([
      "font-medium",
      "text-lg",
      "text-blue-500",
    ]);
  });

  test("orders compound conditions on undeclared axes consistently", () => {
    const badge = tv({
      base: "badge",
      variants: {
        color: {red: "badge-red", blue: "badge-blue"},
      },
      compoundVariants: [{color: "red", isFancy: true, class: "badge-fancy"} as any],
    });

    badge();

    const forward = badge({color: "red", isFancy: true} as any);
    const reversed = badge({isFancy: true, color: "red"} as any);

    expect(forward).toBe(reversed);
    expect(forward).toHaveClass(["badge", "badge-red", "badge-fancy"]);
    expect(badge({color: "red", isFancy: false} as any)).toHaveClass(["badge", "badge-red"]);
    expect(badge({color: "blue", isFancy: true} as any)).toHaveClass(["badge", "badge-blue"]);
  });

  test("keeps slot results order-insensitive", () => {
    const card = tv({
      slots: {root: "root", label: "label"},
      variants: {
        size: {sm: {root: "root-sm"}, lg: {root: "root-lg"}},
        tone: {light: {label: "label-light"}, dark: {label: "label-dark"}},
      },
    });

    card();

    const forward = card({size: "sm", tone: "dark"});
    const reversed = card({tone: "dark", size: "sm"});

    expect(forward).toBe(reversed);
    expect(forward.root()).toHaveClass(["root", "root-sm"]);
    expect(forward.label()).toHaveClass(["label", "label-dark"]);
  });
});

describe("tv props cache (fingerprint bail-out)", () => {
  test("function-valued props return correct classes and stay stable", () => {
    const button = tv({
      base: "font-medium",
      variants: {
        color: {red: "text-red-500", blue: "text-blue-500"},
      },
    });
    const onClick = () => {};

    for (let i = 0; i < 3; i++) {
      expect(button({color: "red", onClick} as any)).toHaveClass(["font-medium", "text-red-500"]);
    }

    expect(button({color: "blue", onClick} as any)).toHaveClass(["font-medium", "text-blue-500"]);
    expect(button({color: "red"})).toHaveClass(["font-medium", "text-red-500"]);
    expect(button({color: "red", onClick} as any)).toHaveClass(["font-medium", "text-red-500"]);
  });

  test("function-valued props do not poison the cache for later calls", () => {
    const button = tv({
      base: "base",
      variants: {
        size: {sm: "size-sm", lg: "size-lg"},
      },
    });

    button({size: "sm", onClick: () => {}} as any);

    expect(button({size: "sm"})).toHaveClass(["base", "size-sm"]);
    expect(button({size: "lg"})).toHaveClass(["base", "size-lg"]);
    expect(button({size: "sm"})).toHaveClass(["base", "size-sm"]);
  });

  test("held slot results with function props survive later calls", () => {
    const chip = tv({
      slots: {root: "root"},
      variants: {
        size: {sm: {root: "root-sm"}, lg: {root: "root-lg"}},
      },
      defaultVariants: {size: "sm"},
    });

    const held = chip({size: "sm", onRender: () => {}} as any);

    chip({size: "lg"});

    expect(held.root()).toHaveClass(["root", "root-sm"]);
    expect(held.root()).not.toHaveClass(["root-lg"]);
  });

  test("symbol-valued props bypass the cache without breaking results", () => {
    const button = tv({
      base: "base",
      variants: {
        size: {sm: "size-sm"},
      },
    });
    const marker = Symbol("marker");

    expect(button({size: "sm", marker} as any)).toHaveClass(["base", "size-sm"]);
    expect(button({size: "sm"})).toHaveClass(["base", "size-sm"]);
  });
});

describe("tv props cache (rotation sweeps)", () => {
  test("variants mode stays correct past the result cache limit", () => {
    const options: Record<string, string> = {};

    for (let i = 0; i < 300; i++) options[`o${i}`] = `w-${i}`;

    const box = tv({variants: {size: options}});

    box({size: "o0"});

    for (let i = 0; i < 300; i++) {
      expect(box({size: `o${i}`})).toBe(`w-${i}`);
    }

    for (const i of [0, 1, 100, 255, 299]) {
      expect(box({size: `o${i}`})).toBe(`w-${i}`);
    }
  });

  test("slots mode stays correct past the parent cache limit", () => {
    const options: Record<string, {root: string}> = {};

    for (let i = 0; i < 300; i++) options[`o${i}`] = {root: `w-${i}`};

    const box = tv({slots: {root: "root"}, variants: {size: options}});

    box({size: "o0"});

    for (let i = 0; i < 300; i++) {
      expect(box({size: `o${i}`}).root()).toHaveClass(["root", `w-${i}`]);
    }

    for (const i of [0, 1, 100, 255, 299]) {
      expect(box({size: `o${i}`}).root()).toHaveClass(["root", `w-${i}`]);
    }
  });

  test("cn argument cache stays correct past bucket and total limits", () => {
    for (let i = 0; i < 70; i++) {
      expect(cnMerge("px-2", `m-${i}`)()).toBe(`px-2 m-${i}`);
    }

    expect(cnMerge("px-2", "m-0")()).toBe("px-2 m-0");
    expect(cnMerge("px-2", "px-4")()).toBe("px-4");
    expect(cnMerge("px-2", "px-4")()).toBe("px-4");

    for (let i = 0; i < 600; i++) {
      expect(cnMerge(`base-${i}`, `extra-${i}`)()).toBe(`base-${i} extra-${i}`);
    }

    expect(cnMerge("base-0", "extra-0")()).toBe("base-0 extra-0");
  });
});
