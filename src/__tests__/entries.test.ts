import {build} from "esbuild";
import {afterEach, describe, expect, test} from "vitest";

import {createTV, createTwMerge} from "../config-entry";
import {
  createTV as createDefaultTV,
  createTV as createTVFull,
  cnMerge as defaultCnMerge,
  tv as defaultTV,
} from "../index";
import {getCompileCount} from "../internal/compile-config/compile.js";
import {engine as defaultEngine, twMerge as defaultTwMerge} from "../internal/engine-instance.js";
import {state} from "../internal/state.js";
import {
  cn as cnLite,
  createCN,
  createTV as createLiteTV,
  createTV as createTVLite,
  cx,
} from "../lite";

import {fileURLToPath} from "node:url";
import {gzipSync} from "node:zlib";

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

/*
 * Bundle each entry the way an app bundler would and check two things: which
 * source modules end up in the graph, and the min+gzip size. The default entry
 * must ship the compiled engine and its tables but never the table compiler
 * or the source config; `./merge` must not ship the recipe runtime; lite must
 * ship none of the engine at all.
 */
const root = fileURLToPath(new URL("../../", import.meta.url));

// Budgets in bytes (min+gzip). Raise deliberately, never by accident.
const DEFAULT_ENTRY_BUDGET = 18_000;

const MERGE_ENTRY_BUDGET = 13_000;

const LITE_ENTRY_BUDGET = 6_000;

const bundle = async (entry: string) => {
  const result = await build({
    entryPoints: [`${root}${entry}`],
    bundle: true,
    minify: true,
    write: false,
    metafile: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    define: {"process.env.NODE_ENV": '"production"'},
    logLevel: "silent",
  });
  const inputs = Object.keys(result.metafile!.inputs).map((file) => file.replace(/\\/g, "/"));
  const code = result.outputFiles[0]!.contents;

  return {inputs, minified: code.length, gzip: gzipSync(code).length};
};

const includes = (inputs: string[], suffix: string) => inputs.some((file) => file.endsWith(suffix));

describe("default entry module graph", async () => {
  const {inputs, gzip} = await bundle("src/index.ts");

  test("ships the compiled engine, its tables, and the recipe runtime", () => {
    expect(includes(inputs, "merge-engine/engine.ts")).toBe(true);
    expect(includes(inputs, "merge-engine/tables.generated.ts")).toBe(true);
    expect(includes(inputs, "internal/class-resolver.ts")).toBe(true);
  });

  test("never imports the table compiler, the source config, or the custom-config layer", () => {
    expect(includes(inputs, "merge-engine/compiler.ts")).toBe(false);
    expect(includes(inputs, "merge-engine/validators.ts")).toBe(false);
    expect(inputs.some((file) => file.includes("internal/compile-config/"))).toBe(false);
    expect(inputs.some((file) => file.includes("internal/merge/"))).toBe(false);
    expect(includes(inputs, "internal/engine-cache.ts")).toBe(false);
  });

  test(`stays under ${DEFAULT_ENTRY_BUDGET} bytes min+gzip`, () => {
    expect(gzip).toBeLessThan(DEFAULT_ENTRY_BUDGET);
  });
});

describe("merge entry module graph", async () => {
  const {inputs, gzip} = await bundle("src/merge-entry.ts");

  test("ships the engine and tables without the recipe runtime or compiler", () => {
    expect(includes(inputs, "merge-engine/engine.ts")).toBe(true);
    expect(includes(inputs, "merge-engine/tables.generated.ts")).toBe(true);
    expect(includes(inputs, "internal/class-resolver.ts")).toBe(false);
    expect(includes(inputs, "internal/tv.ts")).toBe(false);
    expect(includes(inputs, "internal/resolve-options.ts")).toBe(false);
    expect(includes(inputs, "internal/cache.ts")).toBe(false);
    expect(includes(inputs, "merge-engine/compiler.ts")).toBe(false);
    expect(inputs.some((file) => file.includes("internal/compile-config/"))).toBe(false);
  });

  test(`stays under ${MERGE_ENTRY_BUDGET} bytes min+gzip`, () => {
    expect(gzip).toBeLessThan(MERGE_ENTRY_BUDGET);
  });
});

describe("lite entry module graph", async () => {
  const {inputs, gzip} = await bundle("src/lite.ts");

  test("ships no engine, tables, or compiler", () => {
    expect(inputs.some((file) => file.includes("internal/merge-engine/"))).toBe(false);
    expect(inputs.some((file) => file.includes("internal/compile-config/"))).toBe(false);
    expect(includes(inputs, "internal/engine-instance.ts")).toBe(false);
    expect(includes(inputs, "internal/merge-adapter.ts")).toBe(false);
    expect(includes(inputs, "internal/engine-cache.ts")).toBe(false);
  });

  test(`stays under ${LITE_ENTRY_BUDGET} bytes min+gzip`, () => {
    expect(gzip).toBeLessThan(LITE_ENTRY_BUDGET);
  });
});

describe("config entry module graph", async () => {
  const {inputs} = await bundle("src/config-entry.ts");

  test("is where the compiler and the source config live", () => {
    expect(includes(inputs, "merge-engine/compiler.ts")).toBe(true);
    expect(includes(inputs, "compile-config/default-config.ts")).toBe(true);
    expect(includes(inputs, "merge-engine/engine.ts")).toBe(true);
  });
});

const customGroups = () => ({
  extend: {
    theme: {spacing: ["unit", "unit-2"]},
    classGroups: {custom: ["foo-a", "foo-b"]},
  },
});

describe("default entry without the compiler", () => {
  test("rejects twMergeConfig with a pointer to the config entry", () => {
    const config = {twMergeConfig: customGroups()} as any;

    expect(() => defaultTV({base: "foo-a foo-b"}, config)).toThrow(/tailwind-variants\/config/);
    expect(() => createDefaultTV(config)({base: "foo-a"})).toThrow(/tailwind-variants\/config/);
    expect(() => defaultCnMerge("foo-a", "foo-b")(config)).toThrow(/tailwind-variants\/config/);
  });

  test("an empty twMergeConfig is the default engine", () => {
    expect(defaultTV({base: "px-2 px-4"}, {twMergeConfig: {}} as any)()).toBe("px-4");
    expect(defaultCnMerge("px-2", "px-4")({twMergeConfig: {}} as any)).toBe("px-4");
  });
});

describe("createTwMerge", () => {
  test("injects a compiled custom config into any entry", () => {
    const merge = createTwMerge(customGroups());

    expect(merge("foo-a foo-b px-unit px-unit-2")).toBe("foo-b px-unit-2");
    expect(merge("px-2")).toBe("px-2");
    expect(createLiteTV({twMerge: merge})({base: "foo-a foo-b"})()).toBe("foo-b");
    expect(createCN({twMerge: merge})("foo-a", "foo-b")).toBe("foo-b");
    expect(createDefaultTV({twMerge: merge})({base: "foo-a foo-b"})()).toBe("foo-b");
    expect(defaultCnMerge("foo-a", "foo-b")({twMerge: merge})).toBe("foo-b");
  });

  test("shares the engine with recipes that use the same config", () => {
    const before = getCompileCount();
    const config = customGroups();

    createTwMerge(config);
    createTV({twMergeConfig: customGroups()});
    expect(getCompileCount()).toBe(before + 1);
  });
});

describe("lite entry with an external merge function", () => {
  test("createTV and createCN call the injected function with the joined string", () => {
    const seen: string[] = [];
    const external = (classList: string) => {
      seen.push(classList);

      return defaultEngine.mergeString(classList);
    };
    const liteTV = createLiteTV({twMerge: external});
    const liteCN = createCN({twMerge: external});
    const button = liteTV({base: "px-2 text-sm", variants: {size: {lg: "px-6"}}});

    expect(button({size: "lg"})).toBe("text-sm px-6");
    expect(button({size: "lg", class: "px-8"})).toBe("text-sm px-8");
    expect(liteCN("px-2", "px-4")).toBe("px-4");
    // The first recipe call is uncached, so the second call resolves the core
    // again before merging the override onto it.
    expect(seen).toEqual([
      "px-2 text-sm px-6",
      "px-2 text-sm px-6",
      "text-sm px-6 px-8",
      "px-2 px-4",
    ]);
  });

  test("a variadic cn-style function works as the injected merger", () => {
    const cnLike = (...inputs: (string | false | null | undefined)[]) => defaultTwMerge(...inputs);
    const liteTV = createLiteTV({twMerge: cnLike});

    expect(liteTV({base: "px-2 px-4"})()).toBe("px-4");
    expect(createCN({twMerge: cnLike})("px-2", "px-4", "text-sm")).toBe("px-4 text-sm");
  });
});
