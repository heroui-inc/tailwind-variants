/**
 * Removes the build output, the installed tree and the lockfile.
 *
 * A script rather than a package.json one-liner because the shell one it replaces was POSIX-only,
 * and silently so on Windows. `find . \( -name dist -o … \) -prune -exec rm -rf {} +` needs a POSIX
 * `find` and a `rm`, and Windows ships neither: `System32\find.exe` is a string search that answers
 * "FIND: Parameter format not correct" to those arguments, and there is no `rm` at all. It appeared
 * to work only where Git for Windows' `usr/bin` happened to precede `System32` on PATH, which is
 * not the default — so the failure was per-machine rather than per-platform, which is the kind that
 * gets reported as "works for me".
 *
 * TypeScript, run by node's own type stripping — no loader and no dependency. The repo pins node
 * v24 in `.nvmrc` and every supported version strips types unflagged, so the tooling is checked by
 * `tsc` like the rest of the repo instead of being the one corner that is not.
 *
 * Directories are matched by name and never descended into once matched, so a `dist` inside
 * `node_modules` is removed with its parent rather than walked to. `collectRemovableTargets` is
 * exported and the entry point guarded, so a test can drive the decision — which paths would go —
 * against a fixture without a destructive script ever being pointed at one.
 *
 * Usage: `node .config/clean-cache.ts [--dry-run]`
 */
import {readdirSync, rmSync, statSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

/** Directory names removed wherever they are found, and never descended into. */
const REMOVED_DIRECTORIES = new Set(["dist", "node_modules"]);

/** File names removed only at the package root. */
const REMOVED_ROOT_FILES = new Set(["pnpm-lock.yaml"]);

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

/** Every path a clean rooted at `root` would remove. Parents are not descended, so order is free. */
export const collectRemovableTargets = (root: string, directory: string = root): string[] => {
  const targets: string[] = [];

  let entries;

  try {
    entries = readdirSync(directory, {withFileTypes: true});
  } catch {
    // A directory that vanished under us, or one this process cannot read. Nothing to remove.
    return targets;
  }

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);

    if (entry.isDirectory() && REMOVED_DIRECTORIES.has(entry.name)) {
      targets.push(absolute);
      continue;
    }

    if (directory === root && entry.isFile() && REMOVED_ROOT_FILES.has(entry.name)) {
      targets.push(absolute);
      continue;
    }

    // Symlinks are never followed: a link into a tree outside the package would put that tree in
    // range of a recursive delete, which is the one way a cleaner becomes dangerous. A Windows
    // junction reports the same way a POSIX symlink does, so one guard covers both.
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      targets.push(...collectRemovableTargets(root, absolute));
    }
  }

  return targets;
};

/** Whether `target` resolves strictly inside `root`. The root itself is not inside itself. */
export const isWithinRoot = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);

  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const main = (): void => {
  const dryRun = process.argv.includes("--dry-run");
  let removed = 0;

  for (const target of collectRemovableTargets(packageRoot)) {
    if (!isWithinRoot(packageRoot, target)) {
      process.stderr.write(`refusing to remove outside the package: ${target}\n`);
      process.exitCode = 1;
      continue;
    }

    if (dryRun) {
      process.stdout.write(`${path.relative(packageRoot, target)}\n`);
      continue;
    }

    try {
      statSync(target);
    } catch {
      // Already gone — a parent in this list removed it.
      continue;
    }

    rmSync(target, {force: true, recursive: true});
    removed++;
  }

  if (!dryRun) {
    process.stdout.write(`removed ${removed} path(s)\n`);
  }
};

// Importing this module must remove nothing; only running it does.
//
// `import.meta.main` rather than comparing this module's path against `process.argv[1]`. That
// comparison is the usual idiom and it is wrong on Windows: the two spellings can differ in drive
// letter case, in separator, or by one being an 8.3 short path, and any of those makes the guard
// silently false — so the script would import cleanly and do nothing when run. The flag asks the
// loader instead of reconstructing its answer.
if ((import.meta as {main?: boolean}).main === true) {
  main();
}
