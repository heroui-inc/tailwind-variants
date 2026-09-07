/*
 * Custom-config merge layer for the `tailwind-variants/config` entry.
 *
 * A `twMergeConfig` is merged into the default config, compiled to tables,
 * and wrapped in its own engine plus `wrapClsx` cache. Engines are cached by
 * config identity first and by a stable structural key second, so a config
 * object literal rebuilt on every `createTV` / `tv()` call compiles once.
 */

import type {TWMCustomConfig, TWMergeConfig} from "../config.js";
import type {CnOptions, CnReturn} from "../types.js";
import type {AnyConfig, ConfigExtension} from "./compile-config/types.js";
import type {JoinClassValue} from "./join-class-value.js";
import type {CnFunction, Engine} from "./merge-engine/types.js";
import type {MergeAdapterFactory} from "./types.js";

import {cx, isEmptyObject} from "../utils.js";

import {type CreateMergerConfig, createCompiledEngine} from "./compile-config/compile.js";
import {
  cn,
  createBaseMergeAdapter,
  createMergeApi,
  defaultApi,
  hasCustomMergeConfig,
  type MergeApi,
} from "./merge-adapter.js";
import {wrapClsx} from "./merge-engine/engine.js";
import {state} from "./state.js";

const functionIds = new WeakMap<object, number>();
let nextFunctionId = 1;

const functionId = (fn: object): number => {
  let id = functionIds.get(fn);

  if (id === undefined) {
    id = nextFunctionId++;
    functionIds.set(fn, id);
  }

  return id;
};

const dump = (value: unknown, stack: Set<object>): string => {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      return String(value);
    case "boolean":
      return value ? "true" : "false";
    case "bigint":
      return `${value}n`;
    case "undefined":
      return "undefined";
    // Validators and theme getters compare by identity; the same function
    // instance in two clones still yields the same key.
    case "function":
      return `fn#${functionId(value as object)}`;
    case "symbol":
      throw new TypeError("symbol");
    default: {
      const object = value as object;

      if (stack.has(object)) throw new TypeError("cycle");
      stack.add(object);

      let out: string;

      if (Array.isArray(object)) {
        out = "[";
        for (let i = 0; i < object.length; i++) out += `${dump(object[i], stack)},`;
        out += "]";
      } else {
        const record = object as Record<string, unknown>;
        const keys = Object.keys(record).sort();

        out = "{";
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i]!;

          if (record[key] === undefined) continue;
          out += `${JSON.stringify(key)}:${dump(record[key], stack)},`;
        }
        out += "}";
      }

      stack.delete(object);

      return out;
    }
  }
};

// Stable dump of a config: sorted keys, functions by identity. `null` when the
// value cannot be keyed (cycles, symbols); such configs cache by identity only.
export const structuralKey = (value: unknown): string | null => {
  try {
    return dump(value, new Set());
  } catch {
    return null;
  }
};

// Normalize TV config shapes into `{ extend, override }` plus static knobs.
const toMergerConfig = (config: TWMergeConfig): ConfigExtension | undefined => {
  if (isEmptyObject(config)) return undefined;

  const source = config as TWMergeConfig & Record<string, unknown>;
  const extend: Record<string, unknown> = {
    ...((source.extend as object | undefined) ?? {}),
  };

  for (const key of [
    "theme",
    "classGroups",
    "conflictingClassGroups",
    "conflictingClassGroupModifiers",
    "postfixLookupClassGroups",
    "orderSensitiveModifiers",
  ] as const) {
    if (source[key] !== undefined && extend[key] === undefined) {
      extend[key] = source[key];
    }
  }

  const result: ConfigExtension = {};

  if (source.cacheSize !== undefined) result.cacheSize = source.cacheSize as number;
  if (source.prefix !== undefined) result.prefix = source.prefix as string;

  if (Object.keys(extend).length > 0) {
    result.extend = extend as NonNullable<ConfigExtension["extend"]>;
  }

  if (source.override != null && !isEmptyObject(source.override as object)) {
    result.override = source.override as NonNullable<ConfigExtension["override"]>;
  }

  if (Object.keys(result).length === 0) return undefined;

  return result;
};

let byObject = new WeakMap<object, MergeApi>();
let byKey = new Map<string, MergeApi>();

const compileApi = (config: CreateMergerConfig): MergeApi => {
  const {engine, cacheSize} = createCompiledEngine(config);

  return createMergeApi(engine, wrapClsx(engine.mergeString, engine), cacheSize);
};

// Engine + caches for any config input; compiles only when neither identity nor structure is known.
export const getApiFor = (input: CreateMergerConfig): MergeApi => {
  let api = byObject.get(input);

  if (api !== undefined) return api;

  const key = structuralKey(input);

  if (key !== null) {
    api = byKey.get(key);
    if (api !== undefined) {
      byObject.set(input, api);

      return api;
    }
  }

  if (typeof input === "function") {
    api = compileApi(input);
  } else {
    const extension = toMergerConfig(input as TWMergeConfig);

    api = extension === undefined ? defaultApi : compileApi(extension);
  }
  byObject.set(input, api);
  if (key !== null) byKey.set(key, api);

  return api;
};

state.onReset(() => {
  byObject = new WeakMap();
  byKey = new Map();
});

// Adapter for a resolved recipe config; a `twMergeConfig` compiles here, once.
export const createCustomMergeAdapter: MergeAdapterFactory = (config) =>
  createBaseMergeAdapter(config) ?? getApiFor((config as TWMCustomConfig).twMergeConfig!).adapter;

/** `twMerge` shape: variadic strings and nested arrays, no object syntax. */
export type TwMergeFunction = Engine["merge"];

/**
 * Merge function for a custom config: `{ extend, override, prefix, cacheSize }`,
 * a `(defaultConfig) => config` function, or a complete config. Accepts the
 * same arguments as `twMerge`, so it can be injected through `twMerge` on any
 * entry (including lite) or used directly.
 */
export const createTwMerge = (input: CreateMergerConfig): TwMergeFunction =>
  getApiFor(input).engine.merge;

/** tailwind-merge's `extendTailwindMerge`: same input shapes, same result. */
export const extendTailwindMerge = createTwMerge;

/**
 * tailwind-merge's `createTailwindMerge`: a function returning the first
 * config, then any number of `(config) => config` transforms.
 */
export const createTailwindMerge = (
  createConfigFirst: () => AnyConfig,
  ...createConfigRest: ((config: AnyConfig) => AnyConfig)[]
): TwMergeFunction => {
  let config = createConfigFirst();

  for (let i = 0; i < createConfigRest.length; i++) config = createConfigRest[i]!(config);

  return getApiFor(config).engine.merge;
};

/**
 * Combines class names and merges conflicting Tailwind classes.
 * Pass optional `twMerge` / `twMergeConfig` on the second call.
 */
export const cnMerge = <T extends CnOptions>(
  ...classnames: T
): ((config?: TWMCustomConfig) => CnReturn) => {
  return (config) => {
    if (config == null) return cn(...(classnames as Parameters<CnFunction>));
    if (config.twMerge === false) return cx(...(classnames as JoinClassValue[]));
    if (typeof config.twMerge === "function") {
      const joined = cx(...(classnames as JoinClassValue[]));

      return joined ? config.twMerge(joined) : "";
    }
    if (hasCustomMergeConfig(config)) {
      return getApiFor(config.twMergeConfig!).cn(...(classnames as Parameters<CnFunction>));
    }

    return cn(...(classnames as Parameters<CnFunction>));
  };
};
