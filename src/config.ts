/*
 * Config types shared by every entry. Compatible with common `extend` /
 * `override` merger config shapes.
 *
 * @see https://github.com/dcastil/tailwind-merge
 * @see https://github.com/dcastil/tailwind-merge/blob/main/LICENSE.md
 */

import type {AnyConfig, ConfigExtension} from "./internal/compile-config/types.js";

/** Merger config for the built-in Tailwind conflict resolver. */
export type TWMergeConfig = ConfigExtension &
  Partial<AnyConfig> & {
    extend?: Partial<AnyConfig>;
    override?: Partial<AnyConfig>;
  };

/** Join-then-merge function. A string of class names in, merged string out. */
export type TwMergeFn = (classList: string) => string;

/** Merge options every entry understands. */
export type TWMConfig = {
  /**
   * Whether to merge conflicting classes, or a custom merge function.
   * A function is the way to use an external merger (`twMerge` from
   * `tailwind-variants/merge`, `createTwMerge` from `tailwind-variants/config`,
   * or `cn`'s `twMerge`).
   * @default true
   */
  twMerge?: boolean | TwMergeFn;
};

/** Merge options of the `tailwind-variants/config` entry: adds a custom table config. */
export type TWMCustomConfig = TWMConfig & {
  /**
   * Custom merger config (`extend` / `override`, or legacy flat fields).
   * Compiled to its own tables once per distinct config.
   */
  twMergeConfig?: TWMergeConfig;
};

/**
 * Config accepted by the lite entry. Only `twMerge` is honored:
 * `twMergeConfig` and `debug` belong on the other entries.
 */
export type TVLiteConfig = {
  /**
   * A merge function, or `false` to join only.
   * `true` / omitted still join only: lite has no built-in table.
   */
  twMerge?: boolean | TwMergeFn;
};

/**
 * Config for a recipe or a `createTV` factory on the default entry.
 *
 * The debug flag lives behind `process.env.NODE_ENV !== "production"` branches,
 * so a bundled production build strips the console reporter and the logging
 * wrapper entirely.
 */
export type TVConfig = TWMConfig & {
  /**
   * Log how each invocation resolved its classes to the browser console:
   * effective props, `base`, `variants`, `compounds`, classes the merger
   * discarded, and the final `result`.
   *
   * Logging is development-only and browser-only: SSR and production builds
   * stay silent. When disabled, recipes are returned untouched.
   *
   * @default false
   * @see https://www.tailwind-variants.org/docs/debugging
   */
  debug?: boolean;
};

/** Config for a recipe or factory on `tailwind-variants/config`: adds `twMergeConfig`. */
export type TVCustomConfig = TVConfig & TWMCustomConfig;
