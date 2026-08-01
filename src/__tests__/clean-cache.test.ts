import {existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";

import {afterAll, beforeAll, describe, expect, test} from "vitest";

// A computed specifier, because a literal path ending in `.ts` needs `allowImportingTsExtensions`
// and loosening that repo-wide for one test is a worse trade than resolving the URL here.
// `security-tooling.test.ts` already reaches `benchmark/released.mjs` this way, so the shape is the
// established one in this suite even though a `.mjs` specifier reaches it for a different reason.
const cleanCacheUrl = new URL("../../.config/clean-cache.ts", import.meta.url).href;

const {collectRemovableTargets, isWithinRoot} = (await import(
  /* @vite-ignore */ cleanCacheUrl
)) as {
  collectRemovableTargets: (root: string, directory?: string) => string[];
  isWithinRoot: (root: string, target: string) => boolean;
};

/*
 * `.config/clean-cache.ts` replaces a package.json one-liner that only ran on POSIX:
 * `find . \( -name dist -o … \) -prune -exec rm -rf {} +`.
 *
 * Windows ships neither half. `System32\find.exe` is a string search and answers "FIND: Parameter
 * format not correct" to those arguments, and there is no `rm` at all — `rm.exe` exists only inside
 * Git for Windows. So the script appeared to work on a machine where Git's `usr/bin` sits ahead of
 * `System32` on PATH and failed on one where it does not: a per-machine failure rather than a
 * per-platform one, which is the kind that gets reported as "works for me".
 *
 * Driven against a fixture rather than by running the cleaner. It deletes trees, and a test that
 * points a destructive script anywhere is one bad default away from pointing it at the wrong tree.
 * The module exports its decision and guards its entry point, so what is asserted here is exactly
 * the set a run would remove.
 */

let fixtureRoot: string;

beforeAll(() => {
  fixtureRoot = mkdtempSync(path.join(tmpdir(), "tv-clean-cache-"));

  const make = (...segments: string[]): void => {
    mkdirSync(path.join(fixtureRoot, ...segments), {recursive: true});
  };

  make("dist");
  make("node_modules", "some-package", "dist");
  make("src", "dist");
  make("src", "nested", "node_modules");
  writeFileSync(path.join(fixtureRoot, "pnpm-lock.yaml"), "lockfile\n");
  writeFileSync(path.join(fixtureRoot, "keep.txt"), "keep\n");
  writeFileSync(path.join(fixtureRoot, "src", "keep.ts"), "export const keep = 1;\n");
  // A nested lockfile: only the root one is removed, so this must survive.
  writeFileSync(path.join(fixtureRoot, "src", "pnpm-lock.yaml"), "nested\n");
});

afterAll(() => {
  rmSync(fixtureRoot, {force: true, recursive: true});
});

const relativeTargets = (root: string): string[] =>
  collectRemovableTargets(root)
    .map((target) => path.relative(root, target).split(path.sep).join("/"))
    .sort();

describe("clean-cache target selection", () => {
  test("selects the build output, every installed tree, and the root lockfile", () => {
    // `node_modules/some-package/dist` is deliberately absent: a matched directory is not descended
    // into, so it goes with its parent rather than being named twice. Listing it separately would
    // be harmless to remove and wrong to assert, because it would mean the walk enters trees it is
    // about to delete.
    expect(relativeTargets(fixtureRoot)).toEqual([
      "dist",
      "node_modules",
      "pnpm-lock.yaml",
      "src/dist",
      "src/nested/node_modules",
    ]);
  });

  test("leaves source, unrelated files and a nested lockfile alone", () => {
    const targets = relativeTargets(fixtureRoot);

    expect(targets).not.toContain("keep.txt");
    expect(targets).not.toContain("src");
    expect(targets).not.toContain("src/keep.ts");
    // Only the ROOT lockfile is a target; the same name deeper in the tree is a consumer's file.
    expect(targets).not.toContain("src/pnpm-lock.yaml");
  });

  test("never walks a directory symlink out of the tree", () => {
    // The one way a cleaner becomes dangerous. A link is never descended into, so nothing outside
    // the root can be reached through one.
    const outside = mkdtempSync(path.join(tmpdir(), "tv-clean-outside-"));

    try {
      mkdirSync(path.join(outside, "dist"));
      writeFileSync(path.join(outside, "dist", "precious.txt"), "do not delete\n");

      const linkPath = path.join(fixtureRoot, "src", "linked");

      try {
        symlinkSync(outside, linkPath, "junction");
      } catch {
        // Creating a link can need a privilege this process lacks. Returning is honest; asserting
        // nothing while looking like coverage would not be.
        return;
      }

      const targets = relativeTargets(fixtureRoot);

      expect(targets.some((target) => target.includes("linked"))).toBe(false);

      // Removing the link must take the link and not what it points at. `recursive` is required
      // even for a link to a directory — without it this throws EISDIR on Linux, where the
      // non-recursive remove resolves the target — and recursive removal unlinks rather than
      // descends, which the surviving file below is the proof of.
      rmSync(linkPath, {force: true, recursive: true});

      expect(existsSync(path.join(outside, "dist", "precious.txt"))).toBe(true);
    } finally {
      rmSync(outside, {force: true, recursive: true});
    }
  });

  test("refuses a path outside the root", () => {
    // The guard the removal loop applies before deleting anything.
    expect(isWithinRoot(fixtureRoot, path.join(fixtureRoot, "dist"))).toBe(true);
    expect(isWithinRoot(fixtureRoot, path.join(fixtureRoot, "..", "elsewhere"))).toBe(false);
    expect(isWithinRoot(fixtureRoot, fixtureRoot)).toBe(false);
  });
});
