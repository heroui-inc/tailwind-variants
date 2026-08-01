/**
 * Security properties of the benchmark's package-manager spawn and of the tooling scripts.
 *
 * `benchmark/released.mjs` spawns `pnpm` through a shell on Windows and pre-joins the command
 * into a single string, which concatenates arguments without escaping them. What keeps that safe
 * is a guard regex, so these tests hold the guard to the claim its own comment makes: that
 * nothing it admits can be reinterpreted by `cmd.exe` or by POSIX `sh`.
 *
 * The pure assertions are backed by differential ones — the same argument list is spawned through
 * both shapes and the argv the program actually receives is compared — so the guard is measured
 * against a real shell rather than against a reading of one. Windows reaches `pnpm` through a
 * shell either way, with Node doing the same unescaped concatenation internally, so one of those
 * differentials pins that the pre-joining relocates the concatenation without changing it.
 */
import {execFileSync} from "node:child_process";
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {afterAll, beforeAll, describe, expect, test} from "vitest";

interface PnpmInvocation {
  readonly file: string;
  readonly args: readonly string[];
  readonly useShell: boolean;
}

type BuildPnpmInvocation = (args: readonly string[], platform?: string) => PnpmInvocation;

// A computed specifier rather than a static one: `benchmark/` sits outside tsconfig's `include`
// and the project sets `allowJs: false`, so a literal `../../benchmark/released.mjs` would not
// resolve under `tsc --noEmit`.
const releasedModuleUrl = new URL("../../benchmark/released.mjs", import.meta.url).href;
const releasedModulePath = fileURLToPath(releasedModuleUrl);
const releasedSource = readFileSync(releasedModulePath, "utf8");

const {buildPnpmInvocation} = (await import(/* @vite-ignore */ releasedModuleUrl)) as {
  buildPnpmInvocation: BuildPnpmInvocation;
};

/**
 * Both validators are module-private, so they are lifted out of the source rather than restated
 * here. A restated copy would keep passing after the real one changed; an extraction fails loudly
 * instead, and the agreement test below pins the extraction to the exported behaviour.
 */
const extractRegExp = (name: string): RegExp => {
  const found = new RegExp(`const ${name} = /(.+?)/;`).exec(releasedSource);

  if (found === null) {
    throw new Error(`benchmark/released.mjs no longer declares a \`${name}\` regex literal.`);
  }

  return new RegExp(found[1]);
};

const shellSafeArgument = extractRegExp("shellSafeArgument");
const safeVersion = extractRegExp("safeVersion");

/** Everything `cmd.exe` treats as syntax rather than as text. */
const CMD_METACHARACTERS = [
  "&",
  "|",
  "<",
  ">",
  "^",
  "%",
  '"',
  "(",
  ")",
  "!",
  " ",
  "\t",
  "\n",
  "\r",
];

/** Everything POSIX `sh` treats as syntax, expansion, or a glob. */
const SH_METACHARACTERS = [
  ";",
  "&",
  "|",
  "<",
  ">",
  "$",
  "`",
  "(",
  ")",
  "\\",
  '"',
  "'",
  " ",
  "\t",
  "\n",
  "*",
  "?",
  "[",
  "]",
  "#",
  "~",
  "{",
  "}",
  "=",
  "\0",
];

const ADMITTED_ALPHABET = "+-./0123456789:@ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";

/** The two argument arrays every real call site in `benchmark/released.mjs` builds. */
const BENCHMARKED_PACKAGES = ["tailwind-variants", "class-variance-authority", "cnfast"];
const viewArguments = (packageName: string): string[] => ["view", packageName, "version", "--json"];
const addArguments = (packageName: string, version: string, extras: string[]): string[] => [
  "add",
  "--ignore-workspace",
  "--ignore-scripts",
  "--save-exact",
  `${packageName}@${version}`,
  ...extras,
];

const admits = (argument: string): boolean => {
  try {
    buildPnpmInvocation(["add", argument], "win32");

    return true;
  } catch {
    return false;
  }
};

let scratchDirectory = "";
let echoArgvScript = "";
let argsArrayShellScript = "";

/** A child environment with the named variable replaced, whatever case the parent spelled it in. */
const environmentWith = (name: string, value: string): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};

  for (const [key, existing] of Object.entries(process.env)) {
    if (key.toUpperCase() !== name.toUpperCase()) environment[key] = existing;
  }

  environment[name] = value;

  return environment;
};

const environmentWithPathPrefix = (prefix: string): NodeJS.ProcessEnv =>
  environmentWith("PATH", `${prefix}${path.delimiter}${process.env.PATH ?? ""}`);

beforeAll(() => {
  scratchDirectory = mkdtempSync(path.join(tmpdir(), "tv-security-tooling-"));
  echoArgvScript = path.join(scratchDirectory, "echo-argv.mjs");
  argsArrayShellScript = path.join(scratchDirectory, "args-array-shell.mjs");
  writeFileSync(echoArgvScript, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
  // The shape `benchmark/released.mjs` had before it pre-joined: a program plus an args array,
  // both handed to a shell, which is Node's own unescaped `[file, ...args].join(" ")`. It runs
  // out of process so its DEP0190 warning — the very thing that motivated the change — stays out
  // of the suite's output rather than reading as a finding against the library.
  writeFileSync(
    argsArrayShellScript,
    [
      'import {execFileSync} from "node:child_process";',
      "const [program, ...args] = process.argv.slice(2);",
      'process.stdout.write(execFileSync(program, args, {encoding: "utf8", shell: true}));',
      "",
    ].join("\n"),
  );
});

interface ArgsArrayShellOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/** Runs the program-plus-args-array shape out of process, so DEP0190 stays out of the suite. */
const runThroughShellWithArgsArray = (
  program: string,
  args: readonly string[],
  options: ArgsArrayShellOptions = {},
): string => {
  const baseEnvironment = options.env ?? process.env;
  const environment: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(baseEnvironment)) {
    if (key.toUpperCase() !== "NODE_OPTIONS") environment[key] = value;
  }

  environment.NODE_OPTIONS = `${baseEnvironment.NODE_OPTIONS ?? ""} --no-deprecation`.trim();

  return execFileSync(process.execPath, [argsArrayShellScript, program, ...args], {
    encoding: "utf8",
    env: environment,
    ...(options.cwd === undefined ? {} : {cwd: options.cwd}),
  });
};

afterAll(() => {
  if (scratchDirectory !== "") rmSync(scratchDirectory, {force: true, recursive: true});
});

describe("the Windows shell guard's alphabet", () => {
  test("admits only characters no shell reinterprets, and nothing outside ASCII", () => {
    const admitted: string[] = [];

    for (let code = 0; code <= 0xffff; code++) {
      const character = String.fromCharCode(code);

      if (shellSafeArgument.test(character)) admitted.push(character);
    }

    // Exactly the 69 characters below: no whitespace, no quote, no operator, and — because `\w`
    // is ASCII-only without the `u` flag — no fullwidth or homoglyph lookalike either.
    expect(admitted.join("")).toBe(ADMITTED_ALPHABET);
    expect(admitted.filter((character) => character.charCodeAt(0) > 127)).toEqual([]);

    for (const metacharacter of [...CMD_METACHARACTERS, ...SH_METACHARACTERS]) {
      expect(ADMITTED_ALPHABET.includes(metacharacter)).toBe(false);
      expect(shellSafeArgument.test(`pkg${metacharacter}name`)).toBe(false);
    }
  });

  test("the exported guard agrees with the extracted one on every character it classifies", () => {
    const corpus = [
      ...ADMITTED_ALPHABET,
      ...CMD_METACHARACTERS,
      ...SH_METACHARACTERS,
      "é",
      "＆",
      "①",
      "\u202e",
    ];

    for (const character of corpus) {
      expect(admits(character)).toBe(shellSafeArgument.test(character));
      expect(admits(`pkg${character}name`)).toBe(shellSafeArgument.test(`pkg${character}name`));
    }
  });
});

describe("what the guard deliberately does not bound", () => {
  test("dash-leading and dot-segment tokens pass, because they are pnpm's grammar and not the shell's", () => {
    // These reach pnpm identically whether they are concatenated or passed in an args array, so
    // admitting them is not something the shell introduces. It does mean the guard is not an
    // argument-injection defence — the version validator below is what covers that.
    for (const argument of ["--registry", "-C", "--", "../../etc/passwd", "@scope/name", "."]) {
      expect(admits(argument)).toBe(true);
    }
  });

  test("every argument array the module actually builds is guard-clean", () => {
    for (const packageName of BENCHMARKED_PACKAGES) {
      expect(() => buildPnpmInvocation(viewArguments(packageName), "win32")).not.toThrow();
      expect(() =>
        buildPnpmInvocation(addArguments(packageName, "3.3.0", ["tailwind-merge@3.6.0"]), "win32"),
      ).not.toThrow();
    }
  });
});

describe("the version validator as the shell's input filter", () => {
  // `readLatestVersion` parses whatever `pnpm view <pkg> version --json` prints, so the version
  // is registry-controlled before `safeVersion` sees it, and `readTailwindMergeVersion` takes it
  // from an installed package's manifest. Both then flow into a `name@version` token that is
  // concatenated into the Windows command string.
  const acceptedVersions = [
    "3.3.0",
    "0.0.0",
    "10.20.30",
    "1.2.3-beta.1",
    "1.2.3-rc.0+build.5",
    "1.2.3+20260801",
  ];

  test("every character an accepted version can contain is one the shell guard admits", () => {
    for (let code = 0; code <= 0xffff; code++) {
      const character = String.fromCharCode(code);
      const candidates = [
        `1.2.3${character}`,
        `1.2.3-${character}`,
        `1.2.3+${character}`,
        `${character}.2.3`,
        `1.2.3-a${character}b`,
        `1.2.3+a${character}b`,
      ];

      for (const candidate of candidates) {
        if (safeVersion.test(candidate)) expect(shellSafeArgument.test(candidate)).toBe(true);
      }
    }
  });

  test("an accepted version always begins with a digit, so it can never arrive as a pnpm flag", () => {
    for (let code = 0; code <= 0xffff; code++) {
      const character = String.fromCharCode(code);

      if (safeVersion.test(`${character}.2.3`)) expect(/^\d$/.test(character)).toBe(true);
      if (safeVersion.test(`${character}1.2.3`)) expect(/^\d$/.test(character)).toBe(true);
    }
  });

  test("refuses the shapes an unexpected or hostile registry response would produce", () => {
    for (const rejected of [
      "",
      "latest",
      "v3.3.0",
      "^3.3.0",
      "3.3",
      "3.3.0 --registry",
      "3.3.0;id",
      "3.3.0\n--registry",
      "-3.3.0",
      "../evil",
      "3.3.0 && whoami",
      "$(id)",
    ]) {
      expect(safeVersion.test(rejected)).toBe(false);
    }
  });

  test("an accepted version cannot steer the cache directory out of the cache root", () => {
    // The version reaches more than the command line: `installExactPackage` interpolates it into
    // a cache key, joins that onto the cache root, and calls `rmSync(installDir, {recursive})`.
    // A separator or a dot segment there would aim a recursive delete somewhere else — and the
    // shell guard would not catch it, since `/` and `.` are both characters it admits.
    const cacheRoot = path.join(tmpdir(), "tailwind-variants-benchmark");

    for (let code = 0; code <= 0xffff; code++) {
      const character = String.fromCharCode(code);

      for (const candidate of [
        `1.2.3${character}`,
        `1.2.3-${character}`,
        `1.2.3+${character}`,
        `1.2.3-a${character}b`,
      ]) {
        if (!safeVersion.test(candidate)) continue;

        const installDirectory = path.join(cacheRoot, `tv-${candidate}-tw-merge-3.6.0`);

        expect(path.dirname(installDirectory)).toBe(cacheRoot);
      }
    }
  });

  test("the composed name@version specifier stays guard-clean for every accepted version", () => {
    for (const packageName of BENCHMARKED_PACKAGES) {
      for (const version of acceptedVersions) {
        expect(safeVersion.test(version)).toBe(true);
        expect(admits(`${packageName}@${version}`)).toBe(true);
      }
    }
  });
});

describe("regular-expression complexity", () => {
  // Each is a single character class under one `+`, anchored at both ends: one quantifier, no
  // nesting, no alternation, so there is no ambiguous split for a backtracking engine to explore.
  // These assertions return rather than time out, which is what linearity looks like from outside.
  test("neither validator backtracks catastrophically on a long adversarial input", () => {
    const long = "a".repeat(200_000);

    expect(shellSafeArgument.test(`${long}!`)).toBe(false);
    expect(shellSafeArgument.test(long)).toBe(true);
    expect(safeVersion.test(`1.2.3-${long}!`)).toBe(false);
    expect(safeVersion.test(`${"1".repeat(200_000)}.2.3`)).toBe(true);
    expect(safeVersion.test("1".repeat(200_000))).toBe(false);
  });
});

describe("what a real shell does with the joined command", () => {
  const runDirectly = (args: readonly string[]): string[] =>
    JSON.parse(execFileSync(process.execPath, [echoArgvScript, ...args], {encoding: "utf8"}));

  const runThroughShell = (args: readonly string[]): string[] =>
    JSON.parse(
      execFileSync(`"${process.execPath}" "${echoArgvScript}" ${args.join(" ")}`, [], {
        encoding: "utf8",
        shell: true,
      }),
    );

  test("every argument the guard admits reaches the program with its argv unchanged", () => {
    const admitted = [
      ...viewArguments("tailwind-variants"),
      ...addArguments("class-variance-authority", "1.2.3-rc.0+build.5", ["tailwind-merge@3.6.0"]),
      "../../etc/passwd",
      "@scope/name",
      "a:b",
      "a+b",
      "C:/x/y",
      "--",
      "-",
      ".",
      "_",
    ];

    for (const argument of admitted) expect(admits(argument)).toBe(true);

    // The property the pre-joining depends on: the shell tokenises the joined string back into
    // exactly the arguments the array form would have delivered.
    expect(runDirectly(admitted)).toEqual(admitted);
    expect(runThroughShell(admitted)).toEqual(admitted);
  });

  test("the arguments the guard refuses are the ones the join would corrupt", () => {
    // The sabotage half: without the guard these reach the same `join(" ")`, and the shell hands
    // the program a different argv than the array form does. An empty argument disappears
    // entirely and an argument holding a space splits in two.
    const refused = ["alpha", "", "beta gamma"];

    expect(admits("")).toBe(false);
    expect(admits("beta gamma")).toBe(false);

    expect(runDirectly(refused)).toEqual(["alpha", "", "beta gamma"]);
    expect(runThroughShell(refused)).toEqual(["alpha", "beta", "gamma"]);
    expect(runThroughShell(refused)).not.toEqual(runDirectly(refused));
  });

  test("pre-joining changes nothing a shell was not already doing to the arguments", () => {
    // `execFileSync(file, args, {shell: true})` joins `[file, ...args]` with spaces inside Node
    // and warns about it (DEP0190). Pre-joining performs that same concatenation in the module's
    // own code instead. The two deliver the same argv even for arguments that need escaping,
    // which is why the guard — and not the pre-joining — is the security-relevant half.
    const refused = ["alpha", "", "beta gamma"];
    const shellWithArgsArray: string[] = JSON.parse(
      runThroughShellWithArgsArray(`"${process.execPath}"`, [`"${echoArgvScript}"`, ...refused]),
    );

    expect(shellWithArgsArray).toEqual(runThroughShell(refused));
    expect(shellWithArgsArray).not.toEqual(runDirectly(refused));
  });
});

describe.runIf(process.platform === "win32")("Windows command resolution", () => {
  // Git Bash and MSYS2 export `NoDefaultCurrentDirectoryInExePath=1`, which suppresses the
  // current-directory search. A plain Windows shell — PowerShell, `cmd`, a CI runner — does not,
  // so it is dropped here to measure default Windows behaviour rather than this terminal's.
  const defaultWindowsEnvironment = (): NodeJS.ProcessEnv => {
    const environment: NodeJS.ProcessEnv = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (key.toUpperCase() !== "NODEFAULTCURRENTDIRECTORYINEXEPATH") environment[key] = value;
    }

    return environment;
  };

  test("the non-shell spellings really do fail, which is why a shell is in the picture at all", () => {
    // The premise, verified rather than taken from the comment: the bare name is ENOENT because
    // execFileSync does not apply PATHEXT, and naming the shim is EINVAL because Node refuses to
    // spawn a batch file without a shell.
    const workingDirectory = mkdtempSync(path.join(tmpdir(), "tv-security-resolve-"));

    writeFileSync(path.join(workingDirectory, "pnpm.cmd"), "@echo off\r\necho SHIM\r\n");

    try {
      expect(() =>
        execFileSync("pnpm", ["--version"], {
          cwd: workingDirectory,
          encoding: "utf8",
          env: defaultWindowsEnvironment(),
        }),
      ).toThrow(/ENOENT/);

      expect(() =>
        execFileSync("pnpm.cmd", ["--version"], {
          cwd: workingDirectory,
          encoding: "utf8",
          env: defaultWindowsEnvironment(),
        }),
      ).toThrow(/EINVAL/);
    } finally {
      rmSync(workingDirectory, {force: true, recursive: true});
    }
  });

  test("the shell resolves the command name from the working directory before PATH", () => {
    // A property of `shell: true` rather than of the pre-joining, so both the pre-joined shape
    // and the args-array shape it replaces let a `pnpm.cmd` sitting in the working directory win
    // over the one on PATH. `runPnpm(..., {cwd: installDir})` reaches it, and so does the repo
    // root for the calls that pass no cwd. Passing `NoDefaultCurrentDirectoryInExePath: "1"` in
    // the child environment closes it for both; if that lands, these flip to the PATH copy.
    const workingDirectory = mkdtempSync(path.join(tmpdir(), "tv-security-resolve-"));

    writeFileSync(path.join(workingDirectory, "pnpm.cmd"), "@echo off\r\necho SHIM-FROM-CWD\r\n");

    try {
      const invocation = buildPnpmInvocation(["--version"], "win32");
      const preJoined = execFileSync(invocation.file, [...invocation.args], {
        cwd: workingDirectory,
        encoding: "utf8",
        env: defaultWindowsEnvironment(),
        shell: invocation.useShell,
      });
      const argsArray = runThroughShellWithArgsArray("pnpm", ["--version"], {
        cwd: workingDirectory,
        env: defaultWindowsEnvironment(),
      });

      expect(preJoined.trim()).toBe("SHIM-FROM-CWD");
      expect(argsArray.trim()).toBe("SHIM-FROM-CWD");
    } finally {
      rmSync(workingDirectory, {force: true, recursive: true});
    }
  });
});

describe("importing the benchmark module", () => {
  test("runs no pnpm, so pulling benchmark tests into the suite adds no network step", () => {
    // `.config/vitest.config.ts` now includes `benchmark/**/*.test.mjs`, which means CI imports
    // `benchmark/released.mjs` on every pull request. Nothing in it may install or fetch at
    // module scope; a `pnpm` shim first on PATH would record it if it did.
    const shimDirectory = mkdtempSync(path.join(tmpdir(), "tv-security-import-"));
    const marker = path.join(shimDirectory, "pnpm-was-called.txt");
    const importer = path.join(shimDirectory, "import-only.mjs");

    writeFileSync(
      path.join(shimDirectory, "pnpm.cmd"),
      `@echo off\r\necho called > "${marker}"\r\n`,
    );
    writeFileSync(path.join(shimDirectory, "pnpm"), `#!/bin/sh\necho called > "${marker}"\n`, {
      mode: 0o755,
    });
    writeFileSync(importer, `await import(${JSON.stringify(releasedModuleUrl)});\n`);

    try {
      execFileSync(process.execPath, [importer], {
        encoding: "utf8",
        env: environmentWithPathPrefix(shimDirectory),
      });

      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(shimDirectory, {force: true, recursive: true});
    }
  });
});
