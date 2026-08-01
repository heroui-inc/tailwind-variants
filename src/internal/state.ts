import type {TWMergeConfig} from "../config.js";

export type TwMergeFn = (classList: string) => string;

type State = {
  cachedTwMerge: TwMergeFn | null;
  cachedTwMergeConfig: TWMergeConfig;
  didTwMergeConfigChange: boolean;
  /**
   * Bumped by every `reset()`, so a module holding derived state can notice one happened without
   * this module knowing that module exists.
   *
   * The merge engine owns a memoised merger and an argument cache that a reset has to clear, and
   * they cannot move here — they are the engine's hot state, not configuration. Having the engine
   * PATCH `reset` was the alternative, and it is what made `"sideEffects": false` untrue: the patch
   * is an evaluation-time write, so a bundle that drops the module for having no side effects also
   * drops the clearing. The `lite` entry does not pull the engine at all, so a reset there cleared
   * the config and left the merger alive.
   *
   * A counter read on the way in inverts that. Nothing writes at evaluation time, and both entries
   * get the same reset semantics because neither depends on which modules a bundler kept.
   */
  readonly generation: number;
  reset: () => void;
};

function createState(): State {
  let cachedTwMerge: TwMergeFn | null = null;
  let cachedTwMergeConfig: TWMergeConfig = {};
  let didTwMergeConfigChange = false;
  let generation = 0;

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

    get generation() {
      return generation;
    },

    reset() {
      cachedTwMerge = null;
      cachedTwMergeConfig = {};
      didTwMergeConfigChange = false;
      generation++;
    },
  };
}

export const state = createState();
