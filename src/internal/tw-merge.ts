import {extendTailwindMerge, twMerge as twMergeBase} from "tailwind-merge";
import type {TWMConfig, TWMergeConfig} from "../config.js";
import type {CnOptions, CnReturn} from "../types.js";
import {cx, isEmptyObject} from "../utils.js";
import type {TwMergeFn} from "./state.js";
import {state} from "./state.js";
import type {CnAdapter} from "./types.js";

const createTwMerge = (cachedTwMergeConfig: TWMergeConfig): TwMergeFn => {
  return isEmptyObject(cachedTwMergeConfig)
    ? twMergeBase
    : extendTailwindMerge({
        ...cachedTwMergeConfig,
        extend: {
          theme: cachedTwMergeConfig.theme,
          classGroups: cachedTwMergeConfig.classGroups,
          conflictingClassGroupModifiers: cachedTwMergeConfig.conflictingClassGroupModifiers,
          conflictingClassGroups: cachedTwMergeConfig.conflictingClassGroups,
          ...(cachedTwMergeConfig as any).extend,
        },
      } as Parameters<typeof extendTailwindMerge>[0]);
};

const executeMerge = (classnames: CnOptions, config?: TWMConfig): CnReturn => {
  const base = cx(classnames);

  if (!base || !(config?.twMerge ?? true)) return base;

  if (base.indexOf(" ") === -1) return base;

  if (!state.cachedTwMerge || state.didTwMergeConfigChange) {
    state.didTwMergeConfigChange = false;
    state.cachedTwMerge = createTwMerge(state.cachedTwMergeConfig);
  }

  return state.cachedTwMerge(base) || undefined;
};

export const cnAdapter: CnAdapter = (config, ...classnames) => executeMerge(classnames, config);

/**
 * Combines class names and merges conflicting Tailwind CSS classes using `tailwind-merge`.
 * Uses default twMerge config. For custom config, use `cnMerge` instead.
 */
export const cn = <T extends CnOptions>(...classnames: T): CnReturn => {
  return executeMerge(classnames, {});
};

/**
 * Combines class names and merges conflicting Tailwind CSS classes using `tailwind-merge`.
 * Supports custom twMerge config via the second function call.
 */
export const cnMerge = <T extends CnOptions>(
  ...classnames: T
): ((config?: TWMConfig) => CnReturn) => {
  return (config) => executeMerge(classnames, config);
};
