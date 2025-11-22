import type {TVConfig, TWMConfig, TWMergeConfig} from "./config.d.ts";
import type {CnOptions, CnReturn, TV} from "./types.d.ts";

export type * from "./types.d.ts";

/**
 * Combines class names into a single string. Similar to `clsx` - simple concatenation without merging conflicting classes.
 * @param classes - Class names to combine. Accepts strings, numbers, arrays, objects, and nested structures.
 * @returns A space-separated string of class names, or `undefined` if no valid classes are provided
 * @example
 * ```ts
 * // Simple concatenation
 * cx('text-xl', 'font-bold') // => 'text-xl font-bold'
 *
 * // Handles arrays and objects
 * cx(['px-4', 'py-2'], { 'bg-blue-500': true, 'text-white': false }) // => 'px-4 py-2 bg-blue-500'
 *
 * // Ignores falsy values (except 0)
 * cx('text-xl', false && 'font-bold', null, undefined) // => 'text-xl'
 * ```
 */
export declare const cx: <T extends CnOptions>(...classes: T) => CnReturn;

/**
 * Combines class names and merges conflicting Tailwind CSS classes using `tailwind-merge`.
 * @param classes - Class names to combine (strings, arrays, objects, etc.)
 * @returns A callable function that returns the merged class string. Works directly in template literals (coerces to string) or can be called with optional config.
 * @example
 * ```ts
 * // twMerge defaults to true - works directly in template literals
 * `${cn('bg-red-500', 'bg-blue-500')}` // => 'bg-blue-500'
 * String(cn('bg-red-500', 'bg-blue-500')) // => 'bg-blue-500'
 *
 * // Can still be called with config for explicit control
 * cn('bg-red-500', 'bg-blue-500')() // => 'bg-blue-500'
 *
 * // Note: If you need simple concatenation without merging, use `cx` instead:
 * // Instead of: cn('bg-red-500', 'bg-blue-500')({ twMerge: false })
 * // Use: cx('bg-red-500', 'bg-blue-500') // => 'bg-red-500 bg-blue-500'
 * ```
 */
export declare const cn: <T extends CnOptions>(...classes: T) => (config?: TWMConfig) => CnReturn;

/**
 * Creates a variant-aware component function with Tailwind CSS classes.
 * Supports variants, slots, compound variants, and component composition.
 * @example
 * ```ts
 * const button = tv({
 *   base: "font-medium rounded-full",
 *   variants: {
 *     color: {
 *       primary: "bg-blue-500 text-white",
 *       secondary: "bg-purple-500 text-white",
 *     },
 *     size: {
 *       sm: "text-sm px-3 py-1",
 *       md: "text-base px-4 py-2",
 *     },
 *   },
 *   defaultVariants: {
 *     color: "primary",
 *     size: "md",
 *   },
 * });
 *
 * button({ color: "secondary", size: "sm" }) // => 'font-medium rounded-full bg-purple-500 text-white text-sm px-3 py-1'
 * ```
 * @see https://www.tailwind-variants.org/docs/getting-started
 */
export declare const tv: TV;

/**
 * Creates a configured `tv` instance with custom default configuration.
 * Useful when you want to set default `twMerge` or `twMergeConfig` options for all components.
 * @param config - Configuration object with default settings for `twMerge` and `twMergeConfig`
 * @returns A configured `tv` function that uses the provided defaults
 * @example
 * ```ts
 * // Create a tv instance with twMerge disabled by default
 * const tv = createTV({ twMerge: false });
 *
 * const button = tv({
 *   base: "px-4 py-2",
 *   variants: {
 *     color: {
 *       primary: "bg-blue-500",
 *     },
 *   },
 * });
 *
 * // Can still override config per component
 * const buttonWithMerge = tv(
 *   {
 *     base: "px-4 py-2",
 *     variants: { color: { primary: "bg-blue-500" } },
 *   },
 *   { twMerge: true }
 * );
 * ```
 */
export declare function createTV(config: TVConfig): TV;

/**
 * Default configuration object for tailwind-variants.
 * Can be modified to set global defaults for all components.
 * @example
 * ```ts
 * import { defaultConfig } from "tailwind-variants";
 *
 * defaultConfig.twMergeConfig = {
 *   extend: {
 *     theme: {
 *       spacing: ["medium", "large"],
 *     },
 *   },
 * };
 * ```
 */
export declare const defaultConfig: TVConfig;

// types
export type {TVConfig, TWMConfig, TWMergeConfig};
