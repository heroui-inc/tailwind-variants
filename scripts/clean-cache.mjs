#!/usr/bin/env node
/**
 * Cross-platform clean for dist / node_modules / lockfile.
 *
 * Usage:
 *   node .config/clean-cache.mjs
 *   node .config/clean-cache.mjs --dry-run
 */

import {readdirSync, rmSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

/** Basenames to delete anywhere under the package root (file or directory). */
export const REMOVE = ["dist", "node_modules", "pnpm-lock.yaml"];

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const ignoreCase = process.platform === "win32";
const removeSet = new Set(REMOVE.map((name) => normalizeName(name)));

function normalizeName(name) {
  return ignoreCase ? name.toLowerCase() : name;
}

function isRemovableName(name) {
  return removeSet.has(normalizeName(name));
}

/** True when `target` is a real descendant of `root` (not root itself, not outside). */
export function isWithinRoot(root, target) {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(target);
  const relative = path.relative(rootPath, targetPath);

  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Collect matching paths. Matched directories are not descended into,
 * so a nested `dist` inside `node_modules` is removed with its parent.
 */
export function collectRemovableTargets(root = packageRoot) {
  const rootPath = path.resolve(root);
  const targets = [];
  const stack = [rootPath];

  while (stack.length > 0) {
    const directory = stack.pop();
    let entries;

    try {
      entries = readdirSync(directory, {withFileTypes: true});
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name === "." || entry.name === "..") continue;

      const absolute = path.join(directory, entry.name);

      if (isRemovableName(entry.name)) {
        targets.push(absolute);
        continue;
      }

      // Never follow symlinks or Windows junctions.
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        stack.push(absolute);
      }
    }
  }

  return targets;
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  let removed = 0;
  let failed = 0;

  for (const target of collectRemovableTargets(packageRoot)) {
    if (!isWithinRoot(packageRoot, target)) {
      process.stderr.write(`refusing to remove outside the package: ${target}\n`);
      failed += 1;
      continue;
    }

    if (dryRun) {
      process.stdout.write(`${path.relative(packageRoot, target)}\n`);
      continue;
    }

    try {
      rmSync(target, {force: true, recursive: true});
      removed += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      process.stderr.write(`failed to remove ${target}: ${reason}\n`);
      failed += 1;
    }
  }

  if (!dryRun) {
    process.stdout.write(`removed ${removed} path(s)\n`);
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main();
}
