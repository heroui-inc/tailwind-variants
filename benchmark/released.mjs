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

const validateVersion = (version, packageName) => {
  if (typeof version !== "string" || !safeVersion.test(version)) {
    throw new TypeError(`Received an invalid ${packageName} version.`);
  }

  return version;
};

const readLatestVersion = (packageName) =>
  validateVersion(JSON.parse(runPnpm(["view", packageName, "version", "--json"])), packageName);

const readTailwindMergeVersion = () =>
  validateVersion(
    readJson(path.join(repoRoot, "node_modules", "tailwind-merge", "package.json")).version,
    "tailwind-merge",
  );

const installExactPackage = ({
  cacheKey,
  packageName,
  version,
  extraPackages = [],
  entryRelativePath,
}) => {
  const installDir = path.join(cacheRoot, cacheKey);
  const packageDir = path.join(installDir, "node_modules", packageName);
  const entryPath = path.join(packageDir, entryRelativePath);

  if (!existsSync(entryPath)) {
    rmSync(installDir, {force: true, recursive: true});
    mkdirSync(installDir, {recursive: true});
    writeFileSync(
      path.join(installDir, "package.json"),
      `${JSON.stringify({name: `tailwind-variants-benchmark-${packageName}`, private: true}, null, 2)}\n`,
    );
    runPnpm(
      [
        "add",
        "--ignore-workspace",
        "--ignore-scripts",
        "--save-exact",
        `${packageName}@${version}`,
        ...extraPackages,
      ],
      {cwd: installDir, stdio: "inherit"},
    );
  }

  const installedPackage = readJson(path.join(packageDir, "package.json"));

  if (installedPackage.version !== version) {
    throw new Error(`Expected ${packageName} ${version}, received ${installedPackage.version}.`);
  }

  return {
    entryPath,
    version,
  };
};

export const installReleasedTV = () => {
  const version = readLatestVersion("tailwind-variants");
  const tailwindMergeVersion = readTailwindMergeVersion();
  const {entryPath, version: installedVersion} = installExactPackage({
    cacheKey: `tv-${version}-tw-merge-${tailwindMergeVersion}`,
    packageName: "tailwind-variants",
    version,
    extraPackages: [`tailwind-merge@${tailwindMergeVersion}`],
    entryRelativePath: path.join("dist", "index.js"),
  });

  return {
    distPath: entryPath,
    version: installedVersion,
  };
};

export const installLatestCVA = () => {
  const version = readLatestVersion("class-variance-authority");
  const {entryPath, version: installedVersion} = installExactPackage({
    cacheKey: `cva-${version}`,
    packageName: "class-variance-authority",
    version,
    entryRelativePath: path.join("dist", "index.mjs"),
  });

  return {
    entryPath,
    version: installedVersion,
  };
};

export const installLatestCnfast = () => {
  const version = readLatestVersion("cnfast");
  const {entryPath, version: installedVersion} = installExactPackage({
    cacheKey: `cnfast-${version}`,
    packageName: "cnfast",
    version,
    entryRelativePath: path.join("dist", "index.mjs"),
  });

  return {
    entryPath,
    version: installedVersion,
  };
};
