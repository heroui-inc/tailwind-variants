/*
 * Console reporter for `{debug: true}`. Only ever reached from a
 * `process.env.NODE_ENV !== "production"` branch, so a bundled production build
 * drops this module — and with it every diagnostic string and color table below.
 *
 * The layout leans on the native console instead of drawing a tree by hand:
 * `groupCollapsed` for the recipe and for each slot, one `log` per value.
 * Structured values are passed as live objects so DevTools renders them
 * inspectable; class values stay plain strings.
 *
 * Globals are read off `globalThis` rather than referenced directly: it keeps
 * the module usable in Node, browsers, and edge runtimes, and keeps the public
 * types free of any DOM or Node lib dependency.
 */

import type {DebugTrace} from "./trace.js";

type ConsoleLike = {
  log: (...args: any[]) => void;
  group?: (...args: any[]) => void;
  groupCollapsed?: (...args: any[]) => void;
  groupEnd?: () => void;
};

type NodeLike = {
  stdout?: {isTTY?: boolean};
  env?: Record<string, string | undefined>;
};

const globals = globalThis as {
  console?: ConsoleLike;
  document?: unknown;
  process?: NodeLike;
  window?: unknown;
};

// Probing globals reads properties, which a bundler must assume can have side
// effects; the `@__PURE__` annotations let it drop these constants along with
// the rest of the module in a production build.
export const IS_BROWSER = /* @__PURE__ */ (() =>
  globals.window !== undefined && globals.document !== undefined)();
const SUPPORTS_ANSI = /* @__PURE__ */ (() =>
  !IS_BROWSER && Boolean(globals.process?.stdout?.isTTY) && !globals.process?.env?.NO_COLOR)();

const ANSI_RESET = "\u001B[0m";
const ANSI_BOLD = "\u001B[1m";

/**
 * Minimal semantic palette: `props` blue, `result` green (slightly stronger
 * than the muted `base`), overrides amber, everything else muted.
 */
type Tone = "muted" | "props" | "result" | "warn";

const ANSI_TONES: Record<Tone, string> = {
  muted: "\u001B[90m",
  props: "\u001B[34m",
  result: "\u001B[32m",
  warn: "\u001B[33m",
};
const CSS_TONES: Record<Tone, string> = {
  muted: "color:#8a8a8a",
  props: "color:#2563eb",
  result: "color:#16a34a;font-weight:600",
  warn: "color:#d97706",
};

// One column wider than "overridden", the longest label, so values align.
const LABEL_WIDTH = 11;

const pad = (label: string): string =>
  label.length >= LABEL_WIDTH ? label + " " : label + " ".repeat(LABEL_WIDTH - label.length);

/** `%` is a format specifier for the devtools console. */
const escapeFormat = (text: string): string => text.replace(/%/g, "%%");

const statusOf = (count: number): string =>
  count === 0 ? "✓ no overrides" : "⚠ " + count + (count === 1 ? " override" : " overrides");

/**
 * Total overrides across the whole trace tree. The root of a slot recipe
 * mirrors its `base` slot, so when `slots` is present they are the single
 * source of truth; counting the root as well would double-count `base`.
 */
export const countTreeOverrides = (trace: DebugTrace): number => {
  const slots = trace.slots;

  if (!slots) return trace.overridden.length;

  let total = 0;

  for (const slotKey in slots) total += countTreeOverrides(slots[slotKey]);

  return total;
};

/** `tv  ⚠ 2 overrides` — the clickable line of a collapsed group. */
const header = (title: string, count: number): any[] => {
  const status = statusOf(count);
  const tone: Tone = count > 0 ? "warn" : "muted";

  if (IS_BROWSER) {
    return ["%c" + escapeFormat(title) + "%c  " + status, "font-weight:600", CSS_TONES[tone]];
  }

  if (SUPPORTS_ANSI) {
    return [ANSI_BOLD + title + ANSI_RESET + "  " + ANSI_TONES[tone] + status + ANSI_RESET];
  }

  return [title + "  " + status];
};

/** One `label value` line. The value is a trailing argument, never stringified. */
const row = (out: ConsoleLike, label: string, tone: Tone, value: unknown): void => {
  if (IS_BROWSER) out.log("%c" + pad(label), CSS_TONES[tone], value);
  else if (SUPPORTS_ANSI) out.log(ANSI_TONES[tone] + pad(label) + ANSI_RESET, value);
  else out.log(pad(label), value);
};

const writeBody = (out: ConsoleLike, trace: DebugTrace): void => {
  row(out, "props", "props", trace.props);

  if (trace.base) row(out, "base", "muted", trace.base);
  if (Object.keys(trace.variants).length > 0) row(out, "variants", "muted", trace.variants);
  if (trace.compounds.length > 0) row(out, "compounds", "muted", trace.compounds);
  if (trace.overridden.length > 0) row(out, "overridden", "warn", trace.overridden);

  row(out, "result", "result", trace.result);
};

const group = (out: ConsoleLike, segments: any[], body: () => void): void => {
  const open = out.groupCollapsed ?? out.group;

  if (!open || !out.groupEnd) {
    out.log(...segments);
    body();

    return;
  }

  open.call(out, ...segments);

  try {
    body();
  } finally {
    out.groupEnd();
  }
};

const getConsole = (): ConsoleLike | undefined => globals.console;

/** Prints one invocation, expanding each slot of a multi-part recipe. */
export const logTrace = (trace: DebugTrace): void => {
  const out = getConsole();

  if (!out) return;

  const slots = trace.slots;

  group(out, header("tv", countTreeOverrides(trace)), () => {
    if (!slots) {
      writeBody(out, trace);

      return;
    }

    row(out, "props", "props", trace.props);

    for (const slotKey in slots) {
      const slotTrace = slots[slotKey];

      group(out, header("slot · " + slotKey, countTreeOverrides(slotTrace)), () => {
        writeBody(out, slotTrace);
      });
    }
  });
};

/** Prints a single slot call that carried its own props. */
export const logSlotTrace = (trace: DebugTrace, slotKey: string): void => {
  const out = getConsole();

  if (!out) return;

  group(out, header("slot · " + slotKey, countTreeOverrides(trace)), () => {
    writeBody(out, trace);
  });
};
