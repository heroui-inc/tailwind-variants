import {execFileSync} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cacheRoot = path.join(os.tmpdir(), "tailwind-variants-benchmark");
const safeVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const readJson = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));

/** Argument shapes the Windows shell cannot reinterpret: no spaces, quotes or metacharacters. */
const shellSafeArgument = /^[\w@./+:-]+$/;

/**
 * How to invoke pnpm on a given platform.
 *
 * Everywhere but Windows, `pnpm` is an executable and `execFileSync` runs it directly.
 *
 * On Windows it is a `.cmd` shim, and both obvious spellings fail: the bare name is ENOENT
 * because `execFileSync` does not apply `PATHEXT`, and naming the shim is EINVAL because Node
 * refuses to spawn a batch file without a shell (the fix for CVE-2024-27980). A shell is
 * therefore required, and the command is pre-joined into a single string rather than passed as
 * an args array — that combination is what Node deprecates in DEP0190, because it concatenates
 * arguments without escaping them.
 *
 * Concatenation is only safe if nothing needs escaping, so this refuses anything that is not a
 * bare token. Every current call site passes literals plus a package name and a version already
 * matched against `safeVersion`; a future one that passes a path would fail loudly here rather
 * than silently becoming shell syntax.
 *
 * Why a package manager at all, when the rest of this branch's tooling spawns nothing:
 *
 * - The install needs dependency RESOLUTION, not just a download. `class-variance-authority`
 *   depends on `clsx@^2.1.1`, so fetching the named tarball and unpacking it is not equivalent —
 *   matching that range means a semver resolver, which is a package manager.
 * - Resolving versions over the registry API instead would hardcode `registry.npmjs.org` and
 *   ignore the `.npmrc` a mirror or private registry configures, while `pnpm add` below would
 *   still honour it. Reading the version from one registry and the tarball from another is worse
 *   than a shell.
 *
 * pnpm is also guaranteed present here: the entry point is `pnpm build && node benchmark/run.mjs`,
 * so it is the process that started this one.
 */
export const buildPnpmInvocation = (args, platform = process.platform) => {
  if (platform !== "win32") return {file: "pnpm", args, useShell: false};

  for (const argument of args) {
    if (!shellSafeArgument.test(argument)) {
      throw new TypeError(
        `Refusing to pass ${JSON.stringify(argument)} through the Windows shell unescaped.`,
      );
    }
  }

  return {file: `pnpm ${args.join(" ")}`, args: [], useShell: true};
};

const runPnpm = (args, options = {}) => {
  const invocation = buildPnpmInvocation(args);
  const output = execFileSync(invocation.file, invocation.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    shell: invocation.useShell,
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
