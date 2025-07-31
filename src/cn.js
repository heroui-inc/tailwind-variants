import {isEmptyObject} from "./utils.js";

let twMergeModule = null;
let loadingPromise = null;

const loadTwMerge = async () => {
  if (twMergeModule) return twMergeModule;
  if (loadingPromise) return loadingPromise;

  loadingPromise = import("tailwind-merge")
    .then((module) => {
      twMergeModule = module;

      return module;
    })
    .catch(() => {
      // If tailwind-merge is not installed, return null
      return null;
    });

  return loadingPromise;
};

export const createTwMerge = (cachedTwMergeConfig) => {
  // Return a function that will lazily load and use twMerge
  return (classes) => {
    // If tailwind-merge was already loaded and failed, just return the classes
    if (loadingPromise && !twMergeModule) {
      return classes;
    }

    // Try to load synchronously if already loaded
    if (twMergeModule) {
      const {twMerge: twMergeBase, extendTailwindMerge} = twMergeModule;
      const twMergeFn = isEmptyObject(cachedTwMergeConfig)
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

      return twMergeFn(classes);
    }

    // Try to require synchronously for CommonJS environments
    try {
      const {twMerge: twMergeBase, extendTailwindMerge} = require("tailwind-merge");

      twMergeModule = {twMerge: twMergeBase, extendTailwindMerge};
      const twMergeFn = isEmptyObject(cachedTwMergeConfig)
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

      return twMergeFn(classes);
    } catch {
      // If require fails, load asynchronously and return unmerged classes for now
      loadTwMerge();

      return classes;
    }
  };
};
