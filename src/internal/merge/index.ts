/*
 * Merger factory and re-exports.
 *
 * @see https://github.com/dcastil/tailwind-merge
 * @see https://github.com/dcastil/tailwind-merge/blob/main/LICENSE.md
 */

import {createTailwindMerge, type TailwindMerge} from "./create-tailwind-merge.js";
import {getDefaultConfig} from "./default-config.js";
import {mergeConfigs} from "./merge-configs.js";
import type {AnyConfig, ConfigExtension} from "./types.js";

export type Merger = TailwindMerge;

export type CreateMergerConfig = ConfigExtension | ((defaultConfig: AnyConfig) => AnyConfig);

/** Create a merger; accepts `{ extend, override }` or a `(defaultConfig) => config` function. */
export const createMerger = (config?: CreateMergerConfig): Merger => {
  if (!config) {
    return createTailwindMerge(getDefaultConfig);
  }

  const createConfig =
    typeof config === "function"
      ? () => config(getDefaultConfig())
      : () => mergeConfigs(getDefaultConfig(), config);

  return createTailwindMerge(createConfig);
};

export {getDefaultConfig} from "./default-config.js";
export {mergeConfigs} from "./merge-configs.js";
export type {AnyConfig, ClassNameValue, ConfigExtension} from "./types.js";
