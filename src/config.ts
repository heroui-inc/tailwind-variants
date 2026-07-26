/*
 * Compatible with common `extend` / `override` merger config shapes.
 *
 * @see https://github.com/dcastil/tailwind-merge
 * @see https://github.com/dcastil/tailwind-merge/blob/main/LICENSE.md
 */

import type {AnyConfig, ConfigExtension} from "./internal/merge/types.js";

/** Merger config for the built-in Tailwind conflict resolver. */
export type TWMergeConfig = ConfigExtension &
  Partial<AnyConfig> & {
    extend?: Partial<AnyConfig>;
    override?: Partial<AnyConfig>;
  };

export type TWMConfig = {
  /**
   * Whether to merge conflicting Tailwind classes.
   * @default true
   */
  twMerge?: boolean;
  /**
   * Custom merger config (`extend` / `override`, or legacy flat fields).
   */
  twMergeConfig?: TWMergeConfig;
};

export type TVConfig = TWMConfig;
