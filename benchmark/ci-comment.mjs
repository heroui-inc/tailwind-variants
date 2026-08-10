/*
 * Posts and updates the benchmark report comment on a pull request.
 *
 * The report lives as a single comment per PR (identified by a marker), so
 * every run updates it in place instead of appending a new comment. The raw
 * results of the latest successful run are embedded in an HTML comment at the
 * end of the same comment; the next run parses that payload as its baseline and
 * compares against it, highlighting improvements and regressions. No extra
 * branch or storage is needed.
 *
 * Usage:
 *   node benchmark/ci-comment.mjs status running    # 🔄 update in progress
 *   node benchmark/ci-comment.mjs status results    # ✅ full report + save baseline
 *   node benchmark/ci-comment.mjs status failed     # ❌ failure notice
 *   node benchmark/ci-comment.mjs status cancelled  # ⏹️ cancelled notice
 *
 * Requires an authenticated `gh` (set `GH_TOKEN` in the workflow — gh does not
 * pick up GITHUB_TOKEN in Actions) and these env vars:
 *   GITHUB_REPOSITORY, PR_NUMBER, GITHUB_SHA, GITHUB_REF_NAME, GITHUB_RUN_ID
 *   BENCHMARK_RESULTS_PATH (only for `status results`)
 */

import {scenarioMetadataById} from "./metadata.mjs";
import {renderBoxTable} from "./table.mjs";
import {utilityScenarioMetadataById} from "./utility-metadata.mjs";
import {execFileSync} from "node:child_process";
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";

const MARKER = "<!-- tv-benchmark:report -->";
const BASELINE_START = "<!-- tv-benchmark:baseline:";
const BASELINE_END = " -->";
const NOISE_THRESHOLD = 5;

const repo = process.env.GITHUB_REPOSITORY;
const pr = process.env.PR_NUMBER;
const runId = process.env.GITHUB_RUN_ID ?? "";
const runUrl = runId ? `https://github.com/${repo}/actions/runs/${runId}` : "#";

const compact = new Intl.NumberFormat("en-US", {notation: "compact", maximumFractionDigits: 2});

const run = (command, args, options = {}) => {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
};

const writeTempFile = (contents) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tv-benchmark-"));
  const file = path.join(dir, "body");
  writeFileSync(file, contents);
  return file;
};

const removeTempFile = (file) => {
  try {
    rmSync(path.dirname(file), {recursive: true, force: true});
  } catch {
    // Best effort; the OS temp dir is cleaned on its own schedule.
  }
};

const findReportComment = () => {
  try {
    const marker = JSON.stringify(MARKER);
    const raw = run("gh", [
      "api",
      `repos/${repo}/issues/${pr}/comments`,
      "--paginate",
      "--jq",
      `[.[] | select(.body | contains(${marker}))] | .[-1]`,
    ]);

    return raw && raw !== "null" ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const upsertComment = (body) => {
  const existing = findReportComment();

  if (existing) {
    const payload = writeTempFile(JSON.stringify({body}));
    run("gh", [
      "api",
      `repos/${repo}/issues/comments/${existing.id}`,
      "-X",
      "PATCH",
      "--input",
      payload,
    ]);
    removeTempFile(payload);
    return existing.id;
  }

  const bodyFile = writeTempFile(body);
  const created = run("gh", ["pr", "comment", pr, "--repo", repo, "--body-file", bodyFile]);
  removeTempFile(bodyFile);

  return created;
};

export const serializeBaseline = (data) =>
  `${BASELINE_START}${Buffer.from(JSON.stringify(data), "utf8").toString("base64url")}${BASELINE_END}`;

export const extractBaseline = (body) => {
  const start = body.indexOf(BASELINE_START);
  if (start === -1) return null;

  const end = body.indexOf(BASELINE_END, start);
  if (end === -1) return null;

  try {
    const payload = body.slice(start + BASELINE_START.length, end);

    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

const formatOps = (hz, rme) => `${compact.format(hz)} ±${rme.toFixed(2)}%`;

export const compareRows = (current, previous, metadataById) => {
  const byScenario = new Map(
    (previous ?? [])
      .filter((row) => row.implementation === "tv")
      .map((row) => [row.scenarioId, row]),
  );

  return current
    .filter((row) => row.implementation === "tv")
    .map((row) => {
      const baselineRow = byScenario.get(row.scenarioId);
      const meta = metadataById.get(row.scenarioId);

      if (!baselineRow) return {meta, current: row, baseline: null, delta: null};

      const delta = ((row.hz - baselineRow.hz) / baselineRow.hz) * 100;

      return {meta, current: row, baseline: baselineRow, delta};
    });
};

const deltaStatus = (delta) => {
  if (Math.abs(delta) <= NOISE_THRESHOLD) return "noise";
  return delta > 0 ? "improved" : "regressed";
};

export const deltaCell = (delta) => {
  if (delta === null) return "—";

  const sign = delta >= 0 ? "+" : "";

  return `${sign}${delta.toFixed(1)}% ${deltaStatus(delta)}`;
};

const renderTable = (rows) =>
  renderBoxTable(
    rows.map((row) => ({
      Scenario: row.meta?.name ?? row.current.scenarioId,
      "tv ops/s": formatOps(row.current.hz, row.current.rme),
      "baseline ops/s": row.baseline ? formatOps(row.baseline.hz, row.baseline.rme) : "—",
      "Δ vs baseline": deltaCell(row.delta),
    })),
  );

export const summarize = (rows) => {
  const summary = {compared: 0, improved: 0, regressed: 0, noise: 0, firstRun: 0};

  for (const row of rows) {
    if (row.delta === null) {
      summary.firstRun++;
      continue;
    }
    summary.compared++;
    summary[deltaStatus(row.delta)]++;
  }

  return summary;
};

const statusLine = (statusEmoji, statusLabel) => `${statusEmoji} **${statusLabel}**`;

const buildRunningBody = () => `${MARKER}

## ⚡ Benchmark report

${statusLine("🔄", "Benchmark running…")}

The benchmark started and is measuring right now. This comment is updated in place
when the run finishes — no new comments are posted.

[Workflow run](${runUrl})`;

const buildFailedBody = () => `${MARKER}

## ⚡ Benchmark report

${statusLine("❌", "Benchmark failed")}

The benchmark did not complete. Check the [workflow run](${runUrl}) log for the error.`;

const buildCancelledBody = () => `${MARKER}

## ⚡ Benchmark report

${statusLine("⏹️", "Benchmark cancelled")}

The benchmark was superseded by a newer run and cancelled.

[Workflow run](${runUrl})`;

export const buildResultsBody = ({variants, utilities, options, baseline, embeddedBaseline}) => {
  const variantRows = compareRows(variants, baseline?.variants ?? [], scenarioMetadataById);
  const utilityRows = compareRows(
    utilities,
    baseline?.utilities ?? [],
    utilityScenarioMetadataById,
  );
  const variantSummary = summarize(variantRows);
  const utilitySummary = summarize(utilityRows);

  const regressed = variantSummary.regressed + utilitySummary.regressed;
  const statusEmoji = regressed > 0 ? "⚠️" : "✅";
  const statusLabel = regressed > 0 ? "Completed — regressions detected" : "Completed";

  const quickNote = options?.quick
    ? "> ⚠️ **Quick mode — results are not suitable for performance claims.**\n"
    : "";

  return `${MARKER}

## ⚡ Benchmark report

${statusLine(statusEmoji, statusLabel)}

${quickNote}### Variants

\`\`\`
${renderTable(variantRows)}
\`\`\`

### Utilities (cx / cn / cnMerge)

\`\`\`
${renderTable(utilityRows)}
\`\`\`

${options?.time ?? 1000}ms measure · ${options?.warmupTime ?? 200}ms warmup · higher ops/s is better · ±${NOISE_THRESHOLD}% is noise · [Workflow run](${runUrl})
${serializeBaseline(embeddedBaseline ?? {variants, utilities, options})}
`;
};

const safe = (fn) => {
  try {
    fn();
  } catch (error) {
    console.error(`benchmark comment skipped: ${error.message}`);
  }
};

const main = async () => {
  if (!repo || !pr) {
    console.error("benchmark comment skipped: GITHUB_REPOSITORY and PR_NUMBER are required.");
    return;
  }

  const status = process.argv[2];
  const phase = process.argv[3];

  if (status !== "status" || !["running", "results", "failed", "cancelled"].includes(phase)) {
    throw new Error(
      "Usage: node benchmark/ci-comment.mjs status <running|results|failed|cancelled>",
    );
  }

  if (phase === "running") {
    safe(() => upsertComment(buildRunningBody()));
    return;
  }

  if (phase === "failed") {
    safe(() => upsertComment(buildFailedBody()));
    return;
  }

  if (phase === "cancelled") {
    safe(() => upsertComment(buildCancelledBody()));
    return;
  }

  const resultsPath = process.env.BENCHMARK_RESULTS_PATH;

  if (!resultsPath || !existsSync(resultsPath)) {
    throw new Error(`BENCHMARK_RESULTS_PATH is missing or unreadable: ${resultsPath ?? "unset"}`);
  }

  const results = JSON.parse(readFileSync(resultsPath, "utf8"));
  const existingComment = findReportComment();
  const baseline = existingComment ? extractBaseline(existingComment.body) : null;

  safe(() => upsertComment(buildResultsBody({...results, baseline, embeddedBaseline: results})));
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  await main();
}
