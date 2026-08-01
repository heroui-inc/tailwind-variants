import {readdirSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

import {describe, expect, test} from "vitest";

/*
 * `package.json` declares `"sideEffects": false`, which tells every bundler that importing a module
 * of this package purely for its side effect can be dropped. A module that writes at evaluation
 * time contradicts that, and the contradiction is not caught by any type or test — it shows up as a
 * behaviour difference between two builds of the same program.
 *
 * The concrete one this guards: the merge engine owns a memoised merger and an argument cache, and
 * `reset()` has to clear them. Patching `state.reset` from `tw-merge.ts` at import time makes that
 * work only when `tw-merge` is in the bundle. The `lite` entry does not pull it, so a reset there
 * cleared the cached config and left the merger and the argument cache alive — a partial reset that
 * reads as a complete one.
 *
 * The repair is to make the clearing PULL-based: `reset()` bumps a generation, and the engine
 * discards its own state when it notices a newer one. Nothing is written at evaluation time, so the
 * manifest claim is true and both entries get the same reset semantics.
 *
 * Only the source half is asserted here, and the reason is worth stating rather than leaving as a
 * gap. The clearing is a RETENTION property, not a correctness one — the default merger is built
 * with no config, so neither it nor the argument cache can serve a stale answer — so an
 * output-shaped assertion would pass whether or not anything is cleared. Weighing it was tried:
 * against a 1.8 MB fill the reset released 0.8 MB and left 1.0 MB of residue that scales with the
 * payload, so no threshold separates "released" from "not released" without being tuned until it
 * passes. That is a machine measurement wearing an assertion, and the clearing operations
 * themselves are unchanged by this repair — the same two calls, moved from push to pull — while
 * `retention-steady-state.test.ts` already holds the caches' plateau behaviour.
 */

const SOURCE_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Every shipped source file, so a module added later cannot slip past this by not being listed. */
const shippedSources = (directory = SOURCE_ROOT, prefix = ""): {name: string; source: string}[] =>
  readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    if (entry.name === "__tests__") return [];

    const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`;

    if (entry.isDirectory()) return shippedSources(`${directory}/${entry.name}`, name);
    if (!entry.name.endsWith(".ts")) return [];

    return [{name, source: readFileSync(`${directory}/${entry.name}`, "utf8")}];
  });

describe("side-effect freedom", () => {
  test("no module reassigns state.reset at evaluation time", () => {
    // The whole invariant, stated where it can be checked. A runtime identity comparison cannot
    // see this — by the time a test runs, the patch has already been applied and there is no
    // unpatched function left to compare against — so the source is what the assertion reads.
    const offenders = shippedSources()
      .filter(({source}) => /^[^*/\n]*\bstate\.reset\s*=[^=]/mu.test(source))
      .map(({name}) => name);

    expect(offenders).toEqual([]);
  });

  test("the scan reaches the modules it is meant to police", () => {
    // Capability guard: an empty offenders list means nothing if the walk found no files, and a
    // wrong directory would produce exactly that.
    const names = shippedSources().map(({name}) => name);

    expect(names).toContain("internal/tw-merge.ts");
    expect(names).toContain("internal/state.ts");
    expect(names.length).toBeGreaterThan(10);
  });
});
