import {twMerge as twMergeBase, extendTailwindMerge} from "tailwind-merge";

import {isEmptyObject, cn as cnBase} from "./utils.js";
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

export const cn = (...classnames) => {
  return (config) => {
    const base = cnBase(classnames);

    if (!base || !config.twMerge) return base;

    if (!state.cachedTwMerge || state.didTwMergeConfigChange) {
      state.didTwMergeConfigChange = false;

      state.cachedTwMerge = createTwMerge(state.cachedTwMergeConfig);
    }

    return state.cachedTwMerge(base) || undefined;
  };
};
