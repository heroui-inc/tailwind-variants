import type {TVLiteConfig} from "./config.js";
import type {CnAdapter} from "./internal/types.js";
import type {CnOptions, CnReturn, TVLite} from "./types.js";

import {defaultConfig as runtimeDefaultConfig} from "./internal/default-config.js";
import {getTailwindVariants} from "./internal/tv.js";
import {cx} from "./utils.js";

export type {TVConfig, TVLiteConfig, TWMConfig, TWMergeConfig, TwMergeFn} from "./config.js";
export type * from "./types.js";

/** After `cx`, tokens are space-separated; a single token has nothing to conflict. */
const canSkipMerge = (joined: string): boolean => !joined || joined.indexOf(" ") === -1;

const applyMerge = (joined: string, config?: TVLiteConfig): string => {
  if (typeof config?.twMerge === "function" && !canSkipMerge(joined)) {
    return config.twMerge(joined);
  }

  return joined;
};

export const cn = <T extends CnOptions>(
  ...classnames: T
): ((config?: TVLiteConfig) => CnReturn) => {
  return (config?: TVLiteConfig) => applyMerge(cx(classnames), config);
};

/** @internal */
export const cnAdapter = cn;

const classAdapter: CnAdapter = (config, ...classnames) => applyMerge(cx(classnames), config);

const runtime = getTailwindVariants(classAdapter);

export const tv = runtime.tv as TVLite;
export const createTV = runtime.createTV as (config?: TVLiteConfig) => TVLite;

/**
 * Bound `cn` for the lite entry. `createTV` does not bind the exported `cn`.
 * With no merge function this is `cx` itself.
 */
export const createCN = (
  config?: TVLiteConfig,
): (<T extends CnOptions>(...classnames: T) => CnReturn) => {
  const merge = typeof config?.twMerge === "function" ? config.twMerge : undefined;

  if (!merge) return cx;

  return <T extends CnOptions>(...classnames: T): CnReturn => {
    const joined = cx(classnames);

    if (canSkipMerge(joined)) return joined;

    return merge(joined);
  };
};

/** @internal */
export const defaultConfig = runtimeDefaultConfig;

export {cx};
