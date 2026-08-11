import type {TWMergeConfig} from "../config.js";

export type TwMergeFn = (classList: string) => string;

type State = {
  cachedTwMerge: TwMergeFn | null;
  cachedTwMergeConfig: TWMergeConfig;
  didTwMergeConfigChange: boolean;
  reset: () => void;
};

export const state: State = {
  cachedTwMerge: null,
  cachedTwMergeConfig: {},
  didTwMergeConfigChange: false,
  reset() {
    state.cachedTwMerge = null;
    state.cachedTwMergeConfig = {};
    state.didTwMergeConfigChange = false;
  },
};
