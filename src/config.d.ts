import type {extendTailwindMerge, ClassNameValue} from "tailwind-merge";

type MergeConfig = Parameters<typeof extendTailwindMerge>[0];
type LegacyMergeConfig = Extract<MergeConfig, {extend?: unknown}>["extend"];

export type TWMergeConfig = MergeConfig & LegacyMergeConfig;

export type TWMConfig = {
  /**
   * Whether to merge the class names with `tailwind-merge` library.
   * It's avoid to have duplicate tailwind classes. (Recommended)
   * @see https://github.com/dcastil/tailwind-merge/blob/v2.2.0/README.md
   * @default true
   */
  twMerge?: boolean;
  /**
   * The config object for `tailwind-merge` library.
   * @see https://github.com/dcastil/tailwind-merge/blob/v2.2.0/docs/configuration.md
   */
  twMergeConfig?: MergeConfig & LegacyMergeConfig;
  /**
   * Custom twMerge function to use instead of the default one.
   * This allows you to use a pre-configured twMerge instance.
   * Should have the same signature as twMerge: (...inputs: ClassNameValue[]) => string
   */
  twMergeFn?: (...inputs: ClassNameValue[]) => string;
};

export type TVConfig = TWMConfig;

export declare const defaultConfig: TVConfig;
