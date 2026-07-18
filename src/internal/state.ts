import type {TWMergeConfig} from "../config.js";

export type TwMergeFn = (classList: string) => string;

type State = {
  cachedTwMerge: TwMergeFn | null;
  cachedTwMergeConfig: TWMergeConfig;
  didTwMergeConfigChange: boolean;
  reset: () => void;
};

function createState(): State {
  let cachedTwMerge: TwMergeFn | null = null;
  let cachedTwMergeConfig: TWMergeConfig = {};
  let didTwMergeConfigChange = false;

  return {
    get cachedTwMerge() {
      return cachedTwMerge;
    },

    set cachedTwMerge(value) {
      cachedTwMerge = value;
    },

    get cachedTwMergeConfig() {
      return cachedTwMergeConfig;
    },

    set cachedTwMergeConfig(value) {
      cachedTwMergeConfig = value;
    },

    get didTwMergeConfigChange() {
      return didTwMergeConfigChange;
    },

    set didTwMergeConfigChange(value) {
      didTwMergeConfigChange = value;
    },

    reset() {
      cachedTwMerge = null;
      cachedTwMergeConfig = {};
      didTwMergeConfigChange = false;
    },
  };
}

export const state = createState();
