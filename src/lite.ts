import type {TVLiteConfig, TwMergeFn} from "./config.js";
import type {MergeAdapter, MergeAdapterFactory} from "./internal/types.js";
import type {CnOptions, CnReturn, TVLite} from "./types.js";

import {defaultConfig as runtimeDefaultConfig} from "./internal/default-config.js";
import {getTailwindVariants} from "./internal/tv.js";
import {cx, normalizeClassString} from "./utils.js";

export type {TVConfig, TVLiteConfig, TWMConfig, TWMergeConfig, TwMergeFn} from "./config.js";
export type * from "./types.js";

// After `cx`, tokens are space-separated; a single token has nothing to conflict.
const canSkipMerge = (joined: string): boolean => !joined || joined.indexOf(" ") === -1;

const applyMerge = (joined: string, config?: TVLiteConfig): string => {
  if (typeof config?.twMerge === "function" && !canSkipMerge(joined)) {
    return config.twMerge(joined);
  }

  return joined;
};

/**
 * Joins class names with `cx`; the returned function applies an injected
 * `twMerge` when the config carries one.
 */
export const cn = <T extends CnOptions>(
  ...classnames: T
): ((config?: TVLiteConfig) => CnReturn) => {
  return (config?: TVLiteConfig) => applyMerge(cx(classnames), config);
};

/** @internal */
export const cnAdapter = cn;

// Join the gathered class strings the way `cx` would (single normalization pass).
const joinParts = (list: readonly string[], count: number): string => {
  if (count === 0) return "";

  let joined = list[0]!;

  for (let i = 1; i < count; i++) joined += " " + list[i];

  return normalizeClassString(joined);
};

// Join only: no merge function was injected.
const joinAdapter: MergeAdapter = {
  parts: joinParts,
  override: (core, classValue, classNameValue) =>
    cx(core, classValue as any, classNameValue as any),
};

// Join, then hand multi-token strings to the injected merge function.
const createFunctionAdapter = (merge: TwMergeFn): MergeAdapter => {
  const apply = (joined: string): string => (canSkipMerge(joined) ? joined : merge(joined));

  return {
    parts: (list, count) => apply(joinParts(list, count)),
    override: (core, classValue, classNameValue) =>
      apply(cx(core, classValue as any, classNameValue as any)),
  };
};

const createMergeAdapter: MergeAdapterFactory = (config) =>
  typeof config.twMerge === "function" ? createFunctionAdapter(config.twMerge) : joinAdapter;

const runtime = getTailwindVariants(createMergeAdapter);

/**
 * Creates a variant-aware component function without a built-in merger.
 * Pass a merge function as `twMerge` to resolve Tailwind conflicts.
 * @see https://www.tailwind-variants.org/docs/getting-started
 */
export const tv = runtime.tv as TVLite;

/** Creates a configured lite `tv` instance. */
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

/**
 * `clsx/lite` shape: strings only, everything else ignored, no merging. Lets
 * an alias of `clsx` cover code that imports the `/lite` subpath too.
 */
export const clsx = function (): string {
  let str = "";

  for (let i = 0; i < arguments.length; i++) {
    const tmp = arguments[i];

    if (tmp && typeof tmp === "string") {
      if (str) str += " ";
      str += tmp;
    }
  }

  return str;
} as (...inputs: unknown[]) => string;

export {cx};

export default clsx;
