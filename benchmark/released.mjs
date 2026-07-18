import {execFileSync} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cacheRoot = path.join(os.tmpdir(), "tailwind-variants-benchmark");
const safeVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const readJson = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));

const runPnpm = (args, options = {}) => {
  const output = execFileSync("pnpm", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  });

  return typeof output === "string" ? output.trim() : "";
};

const readLatestVersion = () =>
  JSON.parse(runPnpm(["view", "tailwind-variants", "version", "--json"]));

const readTailwindMergeVersion = () =>
  readJson(path.join(repoRoot, "node_modules", "tailwind-merge", "package.json")).version;

const validateVersion = (version, packageName) => {
  if (typeof version !== "string" || !safeVersion.test(version)) {
    throw new TypeError(`Received an invalid ${packageName} version.`);
  }

  return version;
};

export const installReleasedTV = () => {
  const version = validateVersion(readLatestVersion(), "tailwind-variants");
  const tailwindMergeVersion = validateVersion(readTailwindMergeVersion(), "tailwind-merge");
  const installDir = path.join(cacheRoot, `${version}-tw-merge-${tailwindMergeVersion}`);
  const packageDir = path.join(installDir, "node_modules", "tailwind-variants");
  const distPath = path.join(packageDir, "dist", "index.js");

  if (!existsSync(distPath)) {
    rmSync(installDir, {force: true, recursive: true});
    mkdirSync(installDir, {recursive: true});
    writeFileSync(
      path.join(installDir, "package.json"),
      `${JSON.stringify({name: "tailwind-variants-benchmark-release", private: true}, null, 2)}\n`,
    );
    runPnpm(
      [
        "add",
        "--ignore-workspace",
        "--ignore-scripts",
        "--save-exact",
        `tailwind-variants@${version}`,
        `tailwind-merge@${tailwindMergeVersion}`,
      ],
      {cwd: installDir, stdio: "inherit"},
    );
  }

  const installedPackage = readJson(path.join(packageDir, "package.json"));

  if (installedPackage.version !== version) {
    throw new Error(`Expected tailwind-variants ${version}, received ${installedPackage.version}.`);
  }

  return {
    distPath,
    version,
  };
};
