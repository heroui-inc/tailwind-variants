import {Bench, calibrateTimerOverhead, hrtimeNowTimestampProvider} from "tinybench";

import {createAdapter, createUtilityAdapter, loadImplementations} from "./harness.mjs";
import {scenarioMetadataById} from "./metadata.mjs";
import {
  assertEquivalentOutputs,
  equalizeConfigShapeExposure,
  hasRetainedResult,
  scenarios,
} from "./scenarios.mjs";
import {renderBoxTable} from "./table.mjs";
import {utilityScenarioMetadataById} from "./utility-metadata.mjs";
import {
  assertEquivalentUtilityOutputs,
  hasRetainedUtilityResult,
  utilityScenarios,
} from "./utility-scenarios.mjs";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";

const noiseThreshold = 5;
const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const forceColor = Boolean(process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0");
const useColor =
  forceColor ||
  (!("NO_COLOR" in process.env) && (process.stdout.isTTY || process.env.GITHUB_ACTIONS === "true"));
const colors = {
  blue: 94,
  bold: 1,
  cyan: 36,
  dim: 2,
  green: 32,
  magenta: 35,
  red: 31,
  yellow: 33,
};
const color = (value, code) => (useColor ? `\u001B[${code}m${value}\u001B[0m` : String(value));

const quickModeNote = (options) =>
  options.quick
    ? ` ${color("[UNRELIABLE] quick mode — not suitable for performance claims", colors.yellow)}`
    : "";

// True when an adapter participates in a scenario: its kind must be listed,
// and every capability the scenario requires must be present. Capabilities are
// probed at load time (see capabilities.mjs), never inferred from version
// numbers, so a released version that gains array-extend support is picked up
// automatically.
const scenarioRunsFor = (scenario, adapter) => {
  if (!scenario.implementations.includes(adapter.kind)) return false;
  // An older build may lack the method a scenario calls (twJoin / twMerge on 3.3.1).
  if (scenario.requiresMethod && typeof adapter[scenario.requiresMethod] !== "function") {
    return false;
  }

  const requires = scenario.requiresCapabilities;

  if (!requires) return true;

  const capabilities = adapter.capabilities ?? {};

  for (let index = 0; index < requires.length; index++) {
    if (!capabilities[requires[index]]) return false;
  }

  return true;
};

const RUN_USAGE = `Usage: node benchmark/run.mjs [options]

Options:
  --quick           Fast smoke run (100ms measure, 50ms warmup, 1 round).
                    Results are flagged [UNRELIABLE] and are not suitable for
                    claims.
  --time <ms>       Measurement time per task (default: 1000).
  --warmup <ms>     Warmup time per task (default: 200).
  --rounds <n>      Measurement rounds per task (default: 3); the median round
                    is reported, so one noisy window cannot dominate.
  --json-out <path> Write machine-readable results to a JSON file (also read
                    from BENCHMARK_RESULTS_PATH in CI).
  --suite <name>    Run only "variants" or "utilities" in this process. Without
                    it, each suite runs in its own child process so the
                    utilities rows are not measured on a heap the variants
                    suite already churned.
  --help            Show this help.`;

const parseRunArgs = (argv) => {
  const options = {
    quick: false,
    time: 1000,
    warmupTime: 200,
    rounds: 3,
  };

  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];

    if (argument === "--quick") {
      options.time = 100;
      options.warmupTime = 50;
      options.rounds = 1;
      options.quick = true;
    } else if (argument === "--time") {
      options.time = Number(argv[++i]);
    } else if (argument === "--warmup") {
      options.warmupTime = Number(argv[++i]);
    } else if (argument === "--rounds") {
      options.rounds = Number(argv[++i]);
    } else if (argument === "--json-out") {
      options.jsonOut = argv[++i];
    } else if (argument === "--suite") {
      options.suite = argv[++i];
    } else if (argument === "--help" || argument === "-h") {
      console.log(RUN_USAGE);
      process.exit(0);
    } else {
      throw new TypeError(`Unknown or incomplete argument: ${argument}\n\n${RUN_USAGE}`);
    }
  }

  if (!Number.isFinite(options.time) || options.time <= 0) {
    throw new RangeError(`--time must be a positive number, received ${options.time}.`);
  }

  if (!Number.isFinite(options.warmupTime) || options.warmupTime < 0) {
    throw new RangeError(`--warmup must be a non-negative number, received ${options.warmupTime}.`);
  }

  if (!Number.isInteger(options.rounds) || options.rounds <= 0) {
    throw new RangeError(`--rounds must be a positive integer, received ${options.rounds}.`);
  }

  if (
    options.suite !== undefined &&
    options.suite !== "variants" &&
    options.suite !== "utilities"
  ) {
    throw new RangeError(`--suite must be "variants" or "utilities", received ${options.suite}.`);
  }

  return options;
};

const toResult = (task, implementationId, timerOverheadMs) => {
  const result = task.result;

  if (result.state !== "completed") {
    const detail = result.state === "errored" ? `: ${result.error.message}` : "";

    throw new Error(`Benchmark task ${task.name} ${result.state}${detail}`);
  }

  let hz = result.throughput.mean;
  let rme = result.throughput.rme;

  // Subtract the calibrated timer overhead from the mean, not per sample
  // (see SUBTRACT_SAFE_RATIO).
  const meanLatencyMs = result.latency.mean;

  if (timerOverheadMs > 0 && meanLatencyMs > SUBTRACT_SAFE_RATIO * timerOverheadMs) {
    const adjustedLatencyMs = Math.max(0, meanLatencyMs - timerOverheadMs);

    hz = 1e3 / adjustedLatencyMs;
    rme = rme * (meanLatencyMs / adjustedLatencyMs);
  }

  return {
    implementation: implementationId,
    hz,
    rme,
  };
};

const formatOps = (result) =>
  result ? `${compactNumber.format(result.hz)} ±${result.rme.toFixed(2)}%` : "—";

const formatDelta = (left, right, quick = false) => {
  if (!left || !right) return "—";

  const delta = ((left.hz - right.hz) / right.hz) * 100;

  // Quick mode is too short to judge reliably, so the faster/slower verdict is
  // dropped and the run is flagged [UNRELIABLE] in the surrounding output.
  if (quick) return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;

  const status = Math.abs(delta) <= noiseThreshold ? "noise" : delta > 0 ? "faster" : "slower";

  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% ${status}`;
};

const summarizeBaselineDelta = (results, leftId, rightId) => {
  const resultsByScenario = new Map();
  const summary = {improved: 0, regressed: 0, noise: 0, compared: 0};

  for (const result of results) {
    const entries = resultsByScenario.get(result.scenarioId) ?? new Map();

    entries.set(result.implementation, result);
    resultsByScenario.set(result.scenarioId, entries);
  }

  for (const entries of resultsByScenario.values()) {
    const left = entries.get(leftId);
    const right = entries.get(rightId);

    if (!left || !right) continue;

    summary.compared++;
    const delta = ((left.hz - right.hz) / right.hz) * 100;

    if (delta > noiseThreshold) summary.improved++;
    else if (delta < -noiseThreshold) summary.regressed++;
    else summary.noise++;
  }

  return summary;
};

const createComparisonRows = (suiteScenarios, results, columns, quick = false) => {
  const resultsByScenario = new Map();

  for (const result of results) {
    const entries = resultsByScenario.get(result.scenarioId) ?? new Map();

    entries.set(result.implementation, result);
    resultsByScenario.set(result.scenarioId, entries);
  }

  return suiteScenarios.map((scenario) => {
    const entries = resultsByScenario.get(scenario.id) ?? new Map();
    const row = {
      Category: scenario.category,
      Scenario: scenario.name,
    };

    for (const column of columns) {
      if (column.type === "ops") {
        row[column.header] = formatOps(entries.get(column.id));
      } else if (column.type === "delta") {
        row[column.header] = formatDelta(
          entries.get(column.left),
          entries.get(column.right),
          quick,
        );
      }
    }

    return row;
  });
};

const colorDelta = (value) => {
  if (value.includes("faster")) return color(value, colors.green);
  if (value.includes("slower")) return color(value, colors.red);
  if (value.includes("noise")) return color(value, colors.yellow);

  return color(value, colors.dim);
};

const deltaStyles = [
  (value) => color(value, colors.dim),
  undefined,
  (value) => color(value, colors.cyan),
  (value) => color(value, colors.blue),
  colorDelta,
  (value) => color(value, colors.magenta),
  colorDelta,
];

// tinybench's `subtractTimerOverhead` clamps per-sample negatives to zero, which
// inflates throughput for tasks near the overhead (construction, cx/twJoin).
// Samples are measured raw and the overhead is subtracted from the mean
// latency in toResult, only when the task is comfortably above it.
const SUBTRACT_SAFE_RATIO = 2;

const runScenarioGroup = async (selectedScenarios, adapters, options) => {
  const taskFns = new Map();
  const taskMetadata = new Map();

  for (const scenario of selectedScenarios) {
    for (const adapter of adapters) {
      if (!scenarioRunsFor(scenario, adapter)) continue;

      const taskName = `${scenario.id}::${adapter.id}`;

      taskMetadata.set(taskName, {scenarioId: scenario.id, implementationId: adapter.id});
      taskFns.set(taskName, scenario.createTask(adapter));
    }
  }

  // Each round gets a fresh Bench: a tinybench task can only be run once. Task
  // functions are shared across rounds, so every round measures the same
  // pre-created components. GC runs before each task so one measurement window
  // is never polluted by allocations left over from a previous task.
  const timerOverheadMs = calibrateTimerOverhead(hrtimeNowTimestampProvider);
  const roundResults = new Map();

  for (let round = 0; round < options.rounds; round++) {
    for (const [taskName, fn] of taskFns) {
      const bench = new Bench({
        iterations: 64,
        retainSamples: false,
        throws: true,
        time: options.time,
        warmupTime: options.warmupTime,
      });

      bench.add(taskName, fn);

      const task = bench.tasks[0];

      await task.warmup();
      globalThis.gc?.();
      await task.run();

      const metadata = taskMetadata.get(task.name);
      const list = roundResults.get(task.name) ?? [];

      list.push(toResult(task, metadata.implementationId, timerOverheadMs));
      roundResults.set(task.name, list);
    }
  }

  // Report the median round so a single noisy window cannot dominate.
  const results = [];

  for (const [taskName, samples] of roundResults) {
    const metadata = taskMetadata.get(taskName);
    const median = [...samples].sort((a, b) => a.hz - b.hz)[Math.floor(samples.length / 2)];

    results.push({
      scenarioId: metadata.scenarioId,
      implementation: median.implementation,
      hz: median.hz,
      rme: median.rme,
    });
  }

  return results;
};

const countTasks = (suiteScenarios, adapters) =>
  suiteScenarios.reduce(
    (count, scenario) =>
      count + adapters.filter((adapter) => scenarioRunsFor(scenario, adapter)).length,
    0,
  );

const formatKb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const printEntrySizes = (implementations) => {
  console.log(`\n${color("Default entry size (min+gzip, bundled from dist)", colors.bold)}`);
  for (const implementation of implementations) {
    if (!implementation.entrySize) continue;

    const {minified, gzip} = implementation.entrySize;

    console.log(
      `  ${implementation.label}: ${color(formatKb(gzip), colors.cyan)} gzip · ${formatKb(minified)} minified`,
    );
  }
};

const runVariantsSuite = async (implementations, options) => {
  const adapters = implementations.map(createAdapter);

  equalizeConfigShapeExposure(adapters);
  assertEquivalentOutputs(adapters);

  const isolatedScenario = scenarios.find((scenario) => scenario.id === "invocation/custom-merge");
  const regularScenarios = scenarios.filter((scenario) => scenario !== isolatedScenario);
  const taskCount = countTasks(scenarios, adapters);

  console.log(`\n${color("Suite 1/2 · variants", colors.bold)}${quickModeNote(options)}`);
  console.log(
    `Running ${taskCount} tasks × ${options.rounds} rounds ` +
      `(${options.time}ms measure, ${options.warmupTime}ms warmup).`,
  );

  const results = await runScenarioGroup(regularScenarios, adapters, options);

  if (isolatedScenario) {
    results.push(...(await runScenarioGroup([isolatedScenario], adapters, options)));
  }
  if (!hasRetainedResult()) {
    throw new Error(
      "Variant benchmark results were not retained; the workload may have been eliminated.",
    );
  }

  const summary = summarizeBaselineDelta(results, "tv", "released");
  const columns = [
    {type: "ops", id: "tv", header: "tv ops/s"},
    {type: "ops", id: "released", header: "released ops/s"},
    {type: "delta", left: "tv", right: "released", header: "tv vs released"},
    {type: "ops", id: "cva", header: "cva ops/s"},
    {type: "delta", left: "tv", right: "cva", header: "tv vs cva"},
  ];
  const rows = createComparisonRows(scenarios, results, columns, options.quick);
  const released = implementations.find(({id}) => id === "released");
  const cva = implementations.find(({id}) => id === "cva");

  console.log(`\nVariants summary${quickModeNote(options)}`);
  console.log(
    `  ${color("tv", colors.cyan)} vs ${color("released", colors.blue)}: ` +
      `${color(`${summary.improved} improved`, colors.green)} · ` +
      `${color(`${summary.regressed} regressed`, colors.red)} · ` +
      `${color(`${summary.noise} within noise`, colors.yellow)}\n`,
  );
  console.log(renderBoxTable(rows, {styles: deltaStyles, boldHeaders: true, color}));
  console.log(
    `${color("tv current", colors.cyan)} · ` +
      `${color(`tv released v${released.version}`, colors.blue)} · ` +
      `${color(`cva v${cva.version}`, colors.magenta)} · ` +
      `${options.time}ms measure · ${options.warmupTime}ms warmup · ${options.rounds} rounds`,
  );

  return results;
};

const runUtilitiesSuite = async (implementations, options) => {
  const adapters = implementations.map(createUtilityAdapter);

  assertEquivalentUtilityOutputs(adapters);

  const taskCount = countTasks(utilityScenarios, adapters);

  console.log(`\n${color("Suite 2/2 · utilities", colors.bold)}${quickModeNote(options)}`);
  console.log(
    `Running ${taskCount} tasks × ${options.rounds} rounds ` +
      `(${options.time}ms measure, ${options.warmupTime}ms warmup).`,
  );

  const results = await runScenarioGroup(utilityScenarios, adapters, options);

  if (!hasRetainedUtilityResult()) {
    throw new Error(
      "Utility benchmark results were not retained; the workload may have been eliminated.",
    );
  }

  const summary = summarizeBaselineDelta(results, "tv", "released");
  const columns = [
    {type: "ops", id: "tv", header: "tv ops/s"},
    {type: "ops", id: "released", header: "released ops/s"},
    {type: "delta", left: "tv", right: "released", header: "tv vs released"},
    {type: "ops", id: "cn", header: "cn ops/s"},
    {type: "delta", left: "tv", right: "cn", header: "tv vs cn"},
  ];
  const rows = createComparisonRows(utilityScenarios, results, columns, options.quick);
  const released = implementations.find(({id}) => id === "released");
  const cn = implementations.find(({id}) => id === "cn");

  console.log(`\nUtilities summary${quickModeNote(options)}`);
  console.log(
    `  ${color("tv", colors.cyan)} vs ${color("released", colors.blue)}: ` +
      `${color(`${summary.improved} improved`, colors.green)} · ` +
      `${color(`${summary.regressed} regressed`, colors.red)} · ` +
      `${color(`${summary.noise} within noise`, colors.yellow)}\n`,
  );
  console.log(renderBoxTable(rows, {styles: deltaStyles, boldHeaders: true, color}));
  console.log(
    `${color("tv current", colors.cyan)} · ` +
      `${color(`tv released v${released.version}`, colors.blue)} · ` +
      `${color(`cn = shadcn-ui/cn@${cn.version}`, colors.magenta)} · ` +
      `${options.time}ms measure · ${options.warmupTime}ms warmup · ${options.rounds} rounds`,
  );

  return results;
};

const validateScenarioRegistry = (scenarios, metadataById, label) => {
  const seen = new Set();

  for (const scenario of scenarios) {
    if (seen.has(scenario.id)) {
      throw new Error(`Duplicate ${label} scenario id: ${scenario.id}`);
    }
    seen.add(scenario.id);

    if (!metadataById.has(scenario.id)) {
      throw new Error(`Missing metadata for ${label} scenario: ${scenario.id}`);
    }
  }

  for (const id of metadataById.keys()) {
    if (!seen.has(id)) {
      throw new Error(`Metadata without a registered ${label} scenario: ${id}`);
    }
  }
};

const validateScenarioRegistries = () => {
  validateScenarioRegistry(scenarios, scenarioMetadataById, "variants");
  validateScenarioRegistry(utilityScenarios, utilityScenarioMetadataById, "utility");
};

// Private channel from a suite child back to the orchestrating parent.
const RESULTS_FILE_ENV = "TAILWIND_VARIANTS_BENCHMARK_RESULTS_FILE";

const writeResultsJson = (
  filePath,
  {variantResults, utilityResults, variants, utilities, options},
  {silent = false} = {},
) => {
  const version = (list, id) => list.find((implementation) => implementation.id === id)?.version;

  const payload = {
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? null,
    options: {
      quick: options.quick,
      time: options.time,
      warmupTime: options.warmupTime,
      rounds: options.rounds,
    },
    noiseThreshold,
    versions: {
      tv: version(variants, "tv"),
      released: version(variants, "released"),
      cva: version(variants, "cva"),
      cn: version(utilities, "cn"),
    },
    entrySizes: Object.fromEntries(
      variants
        .filter((implementation) => implementation.entrySize)
        .map((implementation) => [implementation.id, implementation.entrySize]),
    ),
    variants: variantResults,
    utilities: utilityResults,
  };

  writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n");
  if (!silent) console.log(`${color("Benchmark results written to", colors.dim)} ${filePath}`);
};

const readJson = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));

// Run one suite here, or both suites in separate child processes. A suite
// measured after the other one in the same process sees a churned heap and
// warmed inline caches that the other implementations did not get equally,
// so the default is one process per suite.
const runBenchmarks = async (rawOptions = {}) => {
  const options = {
    quick: false,
    time: 1000,
    warmupTime: 200,
    rounds: 3,
    ...rawOptions,
  };
  const jsonPath = options.jsonOut ?? process.env.BENCHMARK_RESULTS_PATH;

  if (options.suite === undefined) {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "tailwind-variants-benchmark-"));
    const results = {};
    // Children hand their rows back through a private file that is removed
    // before this process exits; the user's --json-out is written once, here.
    const {BENCHMARK_RESULTS_PATH: _ignored, ...childEnv} = process.env;

    try {
      for (const suite of ["variants", "utilities"]) {
        const suiteJson = path.join(tempDir, `${suite}.json`);
        const args = [
          "--expose-gc",
          import.meta.filename,
          "--suite",
          suite,
          "--time",
          String(options.time),
          "--warmup",
          String(options.warmupTime),
          "--rounds",
          String(options.rounds),
        ];

        execFileSync(process.execPath, options.quick ? [...args, "--quick"] : args, {
          stdio: "inherit",
          env: {...childEnv, [RESULTS_FILE_ENV]: suiteJson},
        });
        results[suite] = readJson(suiteJson);
      }
    } finally {
      rmSync(tempDir, {force: true, recursive: true});
    }

    if (jsonPath) {
      const merged = {
        ...results.variants,
        variants: results.variants.variants,
        utilities: results.utilities.utilities,
        versions: {...results.variants.versions, ...results.utilities.versions},
      };

      writeFileSync(jsonPath, `${JSON.stringify(merged, null, 2)}\n`);
      console.log(`${color("Benchmark results written to", colors.dim)} ${jsonPath}`);
    }

    return {variants: results.variants.variants, utilities: results.utilities.utilities};
  }

  const {variants, utilities} = await loadImplementations();

  validateScenarioRegistries();

  let variantResults = [];
  let utilityResults = [];

  if (options.suite === "variants") {
    printEntrySizes(variants);
    variantResults = await runVariantsSuite(variants, options);
  } else {
    utilityResults = await runUtilitiesSuite(utilities, options);
  }

  const payload = {variantResults, utilityResults, variants, utilities, options};
  const resultsFile = process.env[RESULTS_FILE_ENV];

  if (resultsFile) writeResultsJson(resultsFile, payload, {silent: true});
  else if (jsonPath) writeResultsJson(jsonPath, payload);

  return {variants: variantResults, utilities: utilityResults};
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  await runBenchmarks(parseRunArgs(process.argv.slice(2)));
}
