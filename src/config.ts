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

/** Join-then-merge function. A string of class names in, merged string out. */
export type TwMergeFn = (classList: string) => string;

export type TWMConfig = {
  /**
   * Whether to merge conflicting classes, or a custom merge function.
   * A function is the lite-entry way to use an external merger (e.g. `twMerge`
   * from `tailwind-merge`) without shipping the built-in table.
   * @default true
   */
  twMerge?: boolean | TwMergeFn;
  /**
   * Custom merger config (`extend` / `override`, or legacy flat fields).
   */
  twMergeConfig?: TWMergeConfig;
};

/**
 * Config accepted by the lite entry. Only `twMerge` is honored —
 * `twMergeConfig` and `debug` belong on the default entry.
 */
export type TVLiteConfig = {
  /**
   * A merge function, or `false` to join only.
   * `true` / omitted still join only: lite has no built-in table.
   */
  twMerge?: boolean | TwMergeFn;
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
