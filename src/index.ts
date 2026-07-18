import type {TVConfig, TWMConfig, TWMergeConfig} from "./config.js";
import {defaultConfig as runtimeDefaultConfig} from "./internal/default-config.js";
import {getTailwindVariants} from "./internal/tv.js";
import {cn, cnAdapter, cnMerge} from "./internal/tw-merge.js";
import type {TV} from "./types.js";
import {cx as runtimeCx} from "./utils.js";

export type * from "./types.js";
export type {TVConfig, TWMConfig, TWMergeConfig};

const runtime = getTailwindVariants(cnAdapter);

/**
 * Creates a variant-aware component function with Tailwind CSS classes.
 * Supports variants, slots, compound variants, and component composition.
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

export {cn, cnMerge};
