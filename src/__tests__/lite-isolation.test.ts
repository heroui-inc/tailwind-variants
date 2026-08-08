import {describe, expect, test, vi} from "vitest";

import {cn, createTV, cx, tv} from "../lite";

/*
 * The lite entrypoint must never load the merge engine, so bundlers can drop
 * it. Each engine module is mocked with a throwing factory: if a future change
 * adds an import edge from lite into the engine, this whole file fails to load.
 */
vi.mock("../internal/tw-merge.js", () => {
  throw new Error("lite must not load internal/tw-merge");
});
vi.mock("../internal/merge/index.js", () => {
  throw new Error("lite must not load the merge engine");
});
vi.mock("../internal/merge/create-tailwind-merge.js", () => {
  throw new Error("lite must not load the merge engine");
});
vi.mock("../internal/merge/default-config.js", () => {
  throw new Error("lite must not load the merge engine");
});

describe("lite entrypoint isolation", () => {
  test("tripwire: the mocked engine modules throw when loaded", async () => {
    // Vitest wraps the factory error, so only the rejection itself is asserted.
    await expect(import("../internal/merge/index.js")).rejects.toThrow();
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
});
