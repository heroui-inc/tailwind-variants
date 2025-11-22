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

export const cn = (...classnames) => {
  const execute = (config) => {
    const base = cx(classnames);

    if (!base || !(config?.twMerge ?? true)) return base;

    if (!state.cachedTwMerge || state.didTwMergeConfigChange) {
      state.didTwMergeConfigChange = false;

      state.cachedTwMerge = createTwMerge(state.cachedTwMergeConfig);
    }

    return state.cachedTwMerge(base) || undefined;
  };

  // Execute immediately with default config
  const defaultResult = execute({});

  // Create a function that can be called with config
  const fn = (config) => execute(config);

  // Make the function work as both a function and a value
  // When used directly (e.g., in template literals), return the default result
  // When called as a function, execute with the provided config
  return new Proxy(fn, {
    apply(target, thisArg, args) {
      // Called as function: fn() or fn(config)
      return target(...args);
    },
    get(target, prop) {
      if (prop === Symbol.toPrimitive) {
        return (hint) => {
          if (hint === "string" || hint === "default") {
            return defaultResult ?? "";
          }

          return defaultResult;
        };
      }
      if (prop === "valueOf") {
        return () => defaultResult;
      }
      if (prop === "toString") {
        return () => String(defaultResult ?? "");
      }

      return target[prop];
    },
  });
};
