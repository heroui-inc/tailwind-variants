import {twMerge as twMergeBase, extendTailwindMerge} from "tailwind-merge";
import {isEmptyObject} from "./utils.js";

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
