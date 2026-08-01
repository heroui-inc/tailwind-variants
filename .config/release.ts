/**
 * Cuts a release: bumps the version, regenerates the changelog, tags and commits.
 *
 * A script rather than `bumpp --execute='pnpm run changelog' --all`, because those single quotes
 * are POSIX shell syntax. `cmd.exe` treats a quote as an ordinary character, so on Windows the
 * option arrives split at the first space — measured: `node --execute='pnpm run changelog'` reports
 * `bad option: --execute='pnpm`. The release script simply could not be run there.
 *
 * Passing the command as its own argv entry removes the quoting question entirely: the value
 * reaches bumpp intact on both platforms because no shell ever parses it.
 *
 * bumpp is invoked through its own module entry rather than the `.bin` shim. A shim on Windows is a
 * `.cmd`, and spawning one needs `shell: true`, which would put a shell back in the path this
 * script exists to remove.
 */
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const bumppEntry = fileURLToPath(new URL("../node_modules/bumpp/bin/bumpp.mjs", import.meta.url));

const child = spawn(
  process.execPath,
  [bumppEntry, "--execute", "pnpm run changelog", "--all", ...process.argv.slice(2)],
  {stdio: "inherit"},
);

child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
  process.exit(signal === null ? (code ?? 1) : 1);
});
