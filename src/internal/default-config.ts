import type {TVCustomConfig} from "../config.js";

// Shared by every entry; `twMergeConfig` is only honored by `tailwind-variants/config`.
export const defaultConfig: TVCustomConfig = {
  twMerge: true,
  twMergeConfig: {},
};
