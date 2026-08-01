import {describe, expect, test} from "vitest";

import {buildPnpmInvocation} from "./released.mjs";

const VIEW_ARGS = ["view", "tailwind-variants", "version", "--json"];
const ADD_ARGS = [
  "add",
  "--ignore-workspace",
  "--ignore-scripts",
  "--save-exact",
  "tailwind-variants@3.3.0",
];

describe("pnpm invocation", () => {
  test("runs pnpm directly where it is an executable", () => {
    expect(buildPnpmInvocation(VIEW_ARGS, "linux")).toEqual({
      file: "pnpm",
      args: VIEW_ARGS,
      useShell: false,
    });
    expect(buildPnpmInvocation(VIEW_ARGS, "darwin").useShell).toBe(false);
  });

  test("goes through the shell on Windows, with no args array", () => {
    // pnpm is a `.cmd` shim there: the bare name is ENOENT because execFileSync does not apply
    // PATHEXT, and the shim itself is EINVAL because Node will not spawn a batch file without a
    // shell. Passing the command pre-joined avoids DEP0190, which fires on shell + args array.
    const invocation = buildPnpmInvocation(VIEW_ARGS, "win32");

    expect(invocation.useShell).toBe(true);
    expect(invocation.args).toEqual([]);
    expect(invocation.file).toBe("pnpm view tailwind-variants version --json");
  });

  test("carries every real call site's arguments unchanged", () => {
    expect(buildPnpmInvocation(ADD_ARGS, "win32").file).toBe(
      "pnpm add --ignore-workspace --ignore-scripts --save-exact tailwind-variants@3.3.0",
    );
  });

  test("refuses arguments the shell could reinterpret", () => {
    // Pre-joining is only safe while nothing needs escaping. A path, a quote or an operator has
    // to fail loudly rather than become shell syntax.
    for (const unsafe of [
      "C:\\Users\\Some One\\tmp",
      "--dir=/tmp/a b",
      'name" && whoami',
      "a|b",
      "a&b",
      "$(id)",
      "",
    ]) {
      expect(() => buildPnpmInvocation(["add", unsafe], "win32")).toThrow(/Refusing to pass/);
    }
  });

  test("does not restrict arguments off Windows, where they are not concatenated", () => {
    expect(buildPnpmInvocation(["add", "/tmp/a b"], "linux").args).toEqual(["add", "/tmp/a b"]);
  });
});
