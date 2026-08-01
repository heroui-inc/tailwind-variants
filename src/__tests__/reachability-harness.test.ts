import {describe, expect, test} from "vitest";

import {gcAvailable, isRetainedAfter} from "./support/reachability.js";

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
    expect(gcAvailable).toBe(false);
  });
});
