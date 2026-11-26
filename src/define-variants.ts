import type {TVDefineVariants} from "./types.js";

/**
 * Returns `tv()` options unchanged, checking them where they are written.
 * Use it for options kept apart from the `tv()` call: `satisfies` cannot do
 * this, because it widens `compoundVariants` and `defaultVariants` values to
 * `string`, which `tv()` then rejects.
 * @example
 * const buttonTheme = defineVariants({ base: "font-semibold", variants: { size: { sm: "text-sm" } } });
 * const button = tv(buttonTheme);
 */
export const defineVariants = ((options: unknown) => options) as TVDefineVariants;
