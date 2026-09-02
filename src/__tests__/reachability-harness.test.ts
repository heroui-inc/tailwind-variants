import {describe, expect, inject, test} from "vitest";

import {gcAvailable, isRetainedAfter} from "./support/reachability.js";

// Set only by `.config/vitest.leak.config.ts`, the config whose entire job is to expose gc. Absent
// under the default config, where having no gc is the expected state rather than a fault.
const requiresGarbageCollection = inject("requiresGarbageCollection") ?? false;

// The leak cases are only as trustworthy as the instrument. A reachability probe that always
// reports "collected" would pass every leak test for the wrong reason, so both directions are
// pinned here with a control that is retained by construction and one that cannot be.
describe.skipIf(!gcAvailable)("reachability probe", () => {
  test("reports a value a module-level array still holds", async () => {
    const holder: object[] = [];
    const retained = await isRetainedAfter(
      () => ({payload: "x".repeat(4096)}),
      (value) => holder.push(value),
    );

    expect(retained).toBe(true);
    expect(holder).toHaveLength(1);
  });

  test("reports a value nothing holds", async () => {
    let touched = 0;
    const retained = await isRetainedAfter(
      () => ({payload: "x".repeat(4096)}),
      () => {
        touched++;
      },
    );

    expect(retained).toBe(false);
    expect(touched).toBe(1);
  });
});

describe.runIf(!gcAvailable)("reachability probe", () => {
  test("is unavailable without --expose-gc, and says so rather than passing", () => {
    // Deliberately not a silent skip: the suite states that this coverage did not run.
    //
    // Under the leak config it is not a statement but a failure. That config exists to put
    // `--expose-gc` in the worker's argv, so arriving here means it stopped doing so — and because
    // every leak suite is `skipIf(!gcAvailable)`, the run would otherwise go green having skipped
    // all of them. This is the assertion that makes that impossible.
    expect(requiresGarbageCollection).toBe(false);
    expect(gcAvailable).toBe(false);
  });
});
