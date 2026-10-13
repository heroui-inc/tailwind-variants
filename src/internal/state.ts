/*
 * Process-global reset hook for the merge layer. Tests call `state.reset()`
 * to drop the default engine, every compiled custom config, and the argument
 * caches, so one test's config cannot leak into the next.
 */
type State = {
  reset: () => void;
  // Register a reset callback (module init only).
  onReset: (hook: () => void) => void;
};

const hooks: (() => void)[] = [];

export const state: State = {
  reset() {
    for (let i = 0; i < hooks.length; i++) hooks[i]!();
  },
  onReset(hook) {
    hooks.push(hook);
  },
};
