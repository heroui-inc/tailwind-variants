import {twMerge as twMergeBase, extendTailwindMerge} from "tailwind-merge";

import {isEmptyObject, cx} from "./utils.js";
import {state} from "./state.js";

export const createTwMerge = (cachedTwMergeConfig) => {
  return isEmptyObject(cachedTwMergeConfig)
    ? twMergeBase
    : extendTailwindMerge({
        ...cachedTwMergeConfig,
        extend: {
          theme: cachedTwMergeConfig.theme,
          classGroups: cachedTwMergeConfig.classGroups,
          conflictingClassGroupModifiers: cachedTwMergeConfig.conflictingClassGroupModifiers,
          conflictingClassGroups: cachedTwMergeConfig.conflictingClassGroups,
          ...cachedTwMergeConfig.extend,
        },
      });
};

const executeMerge = (classnames, config) => {
  const base = cx(classnames);

  if (!base || !(config?.twMerge ?? true)) return base;

  if (!state.cachedTwMerge || state.didTwMergeConfigChange) {
    state.didTwMergeConfigChange = false;

    state.cachedTwMerge = createTwMerge(state.cachedTwMergeConfig);
  }

  return state.cachedTwMerge(base) || undefined;
};

/**
 * Combines class names and merges conflicting Tailwind CSS classes using `tailwind-merge`.
 * Uses default twMerge config. For custom config, use `cnMerge` instead.
 * @param classnames - Class names to combine (strings, arrays, objects, etc.)
 * @returns A merged class string, or `undefined` if no valid classes are provided
 */
export const cn = (...classnames) => {
  return executeMerge(classnames, {});
};

/**
 * Combines class names and merges conflicting Tailwind CSS classes using `tailwind-merge`.
 * Supports custom twMerge config via the second function call.
 * @param classnames - Class names to combine (strings, arrays, objects, etc.)
 * @returns A function that accepts optional twMerge config and returns the merged class string
 * @example
 * ```ts
 * cnMerge('bg-red-500', 'bg-blue-500')({twMerge: true}) // => 'bg-blue-500'
 * cnMerge('px-2', 'px-4')({twMerge: false}) // => 'px-2 px-4'
 * ```
 */
export const cnMerge = (...classnames) => {
  return (config) => executeMerge(classnames, config);
};
