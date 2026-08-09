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

/**
 * Config for a recipe or a `createTV` factory.
 *
 * The debug flag lives behind `process.env.NODE_ENV !== "production"` branches,
 * so a bundled production build strips the console reporter and the logging
 * wrapper entirely.
 */
export type TVConfig = TWMConfig & {
  /**
   * Log how each invocation resolved its classes to the browser console:
   * effective props, `base`, `variants`, `compounds`, classes `tailwind-merge`
   * discarded, and the final `result`.
   *
   * Logging is development-only and browser-only — SSR and production builds
   * stay silent. When disabled, recipes are returned untouched.
   *
   * @default false
   * @see https://www.tailwind-variants.org/docs/debugging
   */
  debug?: boolean;
};
