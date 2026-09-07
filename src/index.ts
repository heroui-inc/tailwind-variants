import type {
  TVConfig,
  TVCustomConfig,
  TVLiteConfig,
  TWMConfig,
  TWMCustomConfig,
  TWMergeConfig,
  TwMergeFn,
} from "./config.js";
import type {TV} from "./types.js";

import {diagnostics} from "./internal/debug/decorate.js";
import {defaultConfig as runtimeDefaultConfig} from "./internal/default-config.js";
import {clsx, twJoin, twMerge} from "./internal/engine-instance.js";
import {cn, cnMerge, createMergeAdapter} from "./internal/merge-adapter.js";
import {getTailwindVariants} from "./internal/tv.js";
import {cx as runtimeCx} from "./utils.js";

export type {
  ClassArray,
  ClassDictionary,
  ClassNameArray,
  ClassNameValue,
  CnFunction,
} from "./internal/merge-engine/types.js";
export type * from "./types.js";
export type {
  TVConfig,
  TVCustomConfig,
  TVLiteConfig,
  TWMConfig,
  TWMCustomConfig,
  TWMergeConfig,
  TwMergeFn,
};

const runtime = getTailwindVariants(createMergeAdapter, diagnostics);

/**
 * Creates a variant-aware component function with Tailwind CSS classes.
 * Supports variants, slots, compound variants, and component composition.
 * Custom merger configs (`twMergeConfig`) live on `tailwind-variants/config`.
 * @see https://www.tailwind-variants.org/docs/getting-started
 */
export const tv = runtime.tv as TV;

/**
 * Creates a configured `tv` instance with custom default configuration.
 */
export const createTV = runtime.createTV as (config: TVConfig) => TV;

/**
 * Default configuration object for tailwind-variants.
 */
export const defaultConfig: TVConfig = runtimeDefaultConfig;

/**
 * Combines class names without merging conflicting Tailwind CSS classes.
 */
export const cx = runtimeCx;

export {clsx, cn, cnMerge, twJoin, twMerge};

/** `clsx` as the default export, so `import clsx from "clsx"` can alias to this package. */
export default clsx;
