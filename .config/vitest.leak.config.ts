/**
 * The base config plus garbage collection exposed, so the reachability assertions can run.
 *
 * The flag has to reach the worker, not this process. Vitest runs suites in a separate worker, so a
 * flag on the parent leaves `globalThis.gc` undefined inside the tests; `execArgv` is what puts it
 * in the worker's own argv.
 *
 * Declaring it here rather than exporting `NODE_OPTIONS` from a wrapper script keeps the run free
 * of environment hooks. `NODE_OPTIONS=… vitest` is POSIX shell syntax that `cmd.exe` does not
 * implement, and every way of restoring it on Windows — a spawner, cross-env, a `.cmd` wrapper — is
 * a second mechanism to keep working. A config field is read identically on every platform, and it
 * puts the flag under version control beside the tests that need it rather than in the environment
 * of whoever happened to run them.
 */
import {defineConfig, mergeConfig} from "vitest/config";

import baseConfig from "./vitest.config";

/**
 * Tells the suite that this run is the one that must have garbage collection.
 *
 * Without it a broken `execArgv` would be invisible: the leak suites are guarded by
 * `describe.skipIf(!gcAvailable)`, so they would all skip and the run would report green having
 * asserted nothing. `reachability-harness.test.ts` reads this and fails instead.
 */
declare module "vitest" {
  interface ProvidedContext {
    requiresGarbageCollection: boolean;
  }
}

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      execArgv: ["--expose-gc"],
      provide: {requiresGarbageCollection: true},
    },
  }),
);
