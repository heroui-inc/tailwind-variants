/*
 * `tailwind-variants/config`: the default runtime plus custom merger configs.
 *
 * Everything the default entry exports is available here, and `tv`,
 * `createTV`, and `cnMerge` additionally accept `twMergeConfig`. The table
 * compiler and the source config live only in this entry, so apps that never
 * customize the merger do not ship them. It also exports the tailwind-merge
 * config API (`extendTailwindMerge`, `createTailwindMerge`, `fromTheme`,
 * `validators`, `mergeConfigs`, `getDefaultConfig`), so `tailwind-merge` can
 * be aliased here.
 */

import type {TVCustomConfig} from "./config.js";
import type {TV} from "./types.js";

import {diagnostics} from "./internal/debug/decorate.js";
import {defaultConfig as runtimeDefaultConfig} from "./internal/default-config.js";
import {
  cnMerge as cnMergeCustom,
  createCustomMergeAdapter,
  createTailwindMerge,
  createTwMerge,
  extendTailwindMerge,
} from "./internal/engine-cache.js";
import {clsx, twJoin, twMerge} from "./internal/engine-instance.js";
import {cn} from "./internal/merge-adapter.js";
import * as validatorFunctions from "./internal/merge-engine/validators.js";
import {getTailwindVariants} from "./internal/tv.js";
import {cx as runtimeCx} from "./utils.js";

export type {
  TVConfig,
  TVCustomConfig,
  TVLiteConfig,
  TWMConfig,
  TWMCustomConfig,
  TWMergeConfig,
  TwMergeFn,
} from "./config.js";
export type {CreateMergerConfig} from "./internal/compile-config/compile.js";
export type {
  AnyConfig,
  ClassGroup,
  ClassValidator,
  Config,
  ConfigExtension,
  DefaultClassGroupIds,
  DefaultThemeGroupIds,
  ThemeGetter,
  ThemeObject,
} from "./internal/compile-config/types.js";
export type {TwMergeFunction} from "./internal/engine-cache.js";
export type {
  ClassArray,
  ClassDictionary,
  ClassNameArray,
  ClassNameValue,
  CnFunction,
} from "./internal/merge-engine/types.js";
export type * from "./types.js";

const runtime = getTailwindVariants(createCustomMergeAdapter, diagnostics);

/**
 * Creates a variant-aware component function with Tailwind CSS classes.
 * Accepts `twMergeConfig` for custom utilities.
 * @see https://www.tailwind-variants.org/docs/getting-started
 */
export const tv = runtime.tv as TV<TVCustomConfig>;

/**
 * Creates a configured `tv` instance. `twMergeConfig` compiles once per
 * distinct config and is shared by every recipe using it.
 */
export const createTV = runtime.createTV as (config: TVCustomConfig) => TV<TVCustomConfig>;

/**
 * Default configuration object for tailwind-variants (shared with the default entry).
 */
export const defaultConfig: TVCustomConfig = runtimeDefaultConfig;

/**
 * Combines class names without merging conflicting Tailwind CSS classes.
 */
export const cx = runtimeCx;

/**
 * Combines class names and merges conflicting Tailwind classes.
 * Pass optional `twMerge` / `twMergeConfig` on the second call.
 */
export const cnMerge = cnMergeCustom;

/** tailwind-merge's validator predicates, usable in custom class groups (compiled to opcodes). */
export const validators = validatorFunctions;

export {getDefaultConfig} from "./internal/compile-config/default-config.js";
export {fromTheme} from "./internal/compile-config/from-theme.js";
export {mergeConfigs} from "./internal/compile-config/merge-configs.js";
export {clsx, cn, createTailwindMerge, createTwMerge, extendTailwindMerge, twJoin, twMerge};

export default clsx;
