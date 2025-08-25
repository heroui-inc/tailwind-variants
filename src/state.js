function createState() {
  let cachedTwMerge = null;
  let cachedTwMergeConfig = {};
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

const state = createState();

export {state};
