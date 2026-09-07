import {describe, expect, test, vi} from "vitest";

import {cn, createCN, createTV, cx, tv} from "../lite";

/*
 * The lite entrypoint must never load the merge engine, so bundlers can drop
 * it. Each engine module is mocked with a throwing factory: if a future change
 * adds an import edge from lite into the engine, this whole file fails to load.
 */
vi.mock("../internal/merge-adapter.js", () => {
  throw new Error("lite must not load the merge adapter");
});

vi.mock("../internal/engine-instance.js", () => {
  throw new Error("lite must not load the default engine");
});

vi.mock("../internal/merge-engine/engine.js", () => {
  throw new Error("lite must not load the merge engine");
});

vi.mock("../internal/merge-engine/tables.generated.js", () => {
  throw new Error("lite must not load the compiled tables");
});

vi.mock("../internal/merge-engine/compiler.js", () => {
  throw new Error("lite must not load the table compiler");
});

vi.mock("../internal/compile-config/compile.js", () => {
  throw new Error("lite must not load the custom-config compiler");
});

vi.mock("../internal/engine-cache.js", () => {
  throw new Error("lite must not load the custom-config merge layer");
});

describe("lite entrypoint isolation", () => {
  test("tripwire: the mocked engine modules throw when loaded", async () => {
    // Vitest wraps the factory error, so only the rejection itself is asserted.
    await expect(import("../internal/engine-instance.js")).rejects.toThrow();
    await expect(import("../internal/merge-engine/engine.js")).rejects.toThrow();
  });

  test("lite tv works without the merge engine", () => {
    const button = tv({
      base: "px-2 px-4",
      variants: {
        color: {red: "text-red-500"},
      },
    });

    expect(button({color: "red"})).toBe("px-2 px-4 text-red-500");
  });

  test("lite slots, cn, cx, and createTV work without the merge engine", () => {
    const card = tv({slots: {root: "p-2 p-4"}});

    expect(card().root()).toBe("p-2 p-4");
    expect(cn("px-2", "px-4")()).toBe("px-2 px-4");
    expect(cx("px-2", ["px-4"])).toBe("px-2 px-4");
    expect(createTV()({base: "m-1 m-2"})()).toBe("m-1 m-2");
  });

  test("createTV injects a merge function without loading the engine", () => {
    const tv = createTV({
      twMerge: (s) => s.replace("px-2", "px-8"),
    });

    expect(tv({base: "px-2 px-4"})()).toBe("px-8 px-4");
  });

  test("createCN injects a merge function without loading the engine", () => {
    const cn = createCN({
      twMerge: (s) => s.replace("px-2", "px-8"),
    });

    expect(cn("px-2", "px-4")).toBe("px-8 px-4");
    expect(createCN()).toBe(cx);
  });
});
