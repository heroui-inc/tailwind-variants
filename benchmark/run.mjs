import {Bench} from "tinybench";

import {createAdapter, createUtilityAdapter, loadImplementations} from "./harness.mjs";
import {scenarioMetadataById} from "./metadata.mjs";
import {assertEquivalentOutputs, hasRetainedResult, scenarios} from "./scenarios.mjs";
import {renderBoxTable} from "./table.mjs";
import {utilityScenarioMetadataById} from "./utility-metadata.mjs";
import {
  assertEquivalentUtilityOutputs,
  hasRetainedUtilityResult,
  utilityScenarios,
} from "./utility-scenarios.mjs";
import {writeFileSync} from "node:fs";
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

const RUN_USAGE = `Usage: node benchmark/run.mjs [options]

Options:
  --quick           Fast smoke run (100ms measure, 50ms warmup). Results are
                    flagged [UNRELIABLE] and are not suitable for claims.
  --time <ms>       Measurement time per task (default: 1000).
  --warmup <ms>     Warmup time per task (default: 200).
  --json-out <path> Write machine-readable results to a JSON file (also read
                    from BENCHMARK_RESULTS_PATH in CI).
  --help            Show this help.`;

export const parseRunArgs = (argv) => {
  const options = {
    quick: false,
    time: 1000,
    warmupTime: 200,
  };

  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];

    if (argument === "--quick") {
      options.time = 100;
      options.warmupTime = 50;
      options.quick = true;
    } else if (argument === "--time") {
      options.time = Number(argv[++i]);
    } else if (argument === "--warmup") {
      options.warmupTime = Number(argv[++i]);
    } else if (argument === "--json-out") {
      options.jsonOut = argv[++i];
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

  return options;
};

const toResult = (task, implementationId) => {
  const result = task.result;

  if (result.state !== "completed") {
    const detail = result.state === "errored" ? `: ${result.error.message}` : "";

    throw new Error(`Benchmark task ${task.name} ${result.state}${detail}`);
  }

  return {
    implementation: implementationId,
    hz: result.throughput.mean,
    rme: result.throughput.rme,
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

const runScenarioGroup = async (selectedScenarios, adapters, options) => {
  const bench = new Bench({
    iterations: 64,
    retainSamples: false,
    throws: true,
    time: options.time,
    warmupTime: options.warmupTime,
  });
  const taskMetadata = new Map();

  for (const scenario of selectedScenarios) {
    for (const adapter of adapters) {
      if (!scenario.implementations.includes(adapter.kind)) continue;

      const taskName = `${scenario.id}::${adapter.id}`;

      taskMetadata.set(taskName, {scenarioId: scenario.id, implementationId: adapter.id});
      bench.add(taskName, scenario.createTask(adapter));
    }
  }

  await bench.run();

  return bench.tasks.map((task) => {
    const metadata = taskMetadata.get(task.name);

    return {
      scenarioId: metadata.scenarioId,
      ...toResult(task, metadata.implementationId),
    };
  });
};

const countTasks = (suiteScenarios, adapters) =>
  suiteScenarios.reduce(
    (count, scenario) =>
      count + adapters.filter((adapter) => scenario.implementations.includes(adapter.kind)).length,
    0,
  );

const runVariantsSuite = async (implementations, options) => {
  const adapters = implementations.map(createAdapter);

  assertEquivalentOutputs(adapters);

  const isolatedScenario = scenarios.find((scenario) => scenario.id === "invocation/custom-merge");
  const regularScenarios = scenarios.filter((scenario) => scenario !== isolatedScenario);
  const taskCount = countTasks(scenarios, adapters);

  console.log(`\n${color("Suite 1/2 · variants", colors.bold)}${quickModeNote(options)}`);
  console.log(
    `Running ${taskCount} tasks (${options.time}ms measure, ${options.warmupTime}ms warmup).`,
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
      `${options.time}ms measure · ${options.warmupTime}ms warmup`,
  );

  return results;
};

const runUtilitiesSuite = async (implementations, options) => {
  const adapters = implementations.map(createUtilityAdapter);

  assertEquivalentUtilityOutputs(adapters);

  const taskCount = countTasks(utilityScenarios, adapters);

  console.log(`\n${color("Suite 2/2 · utilities", colors.bold)}${quickModeNote(options)}`);
  console.log(
    `Running ${taskCount} tasks (${options.time}ms measure, ${options.warmupTime}ms warmup).`,
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
    {type: "ops", id: "cnfast", header: "cnfast ops/s"},
    {type: "delta", left: "tv", right: "cnfast", header: "tv vs cnfast"},
  ];
  const rows = createComparisonRows(utilityScenarios, results, columns, options.quick);
  const released = implementations.find(({id}) => id === "released");
  const cnfast = implementations.find(({id}) => id === "cnfast");

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
      `${color(`cnfast v${cnfast.version}`, colors.magenta)} · ` +
      `${options.time}ms measure · ${options.warmupTime}ms warmup`,
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

const writeResultsJson = (
  filePath,
  {variantResults, utilityResults, variants, utilities, options},
) => {
  const version = (list, id) => list.find((implementation) => implementation.id === id)?.version;

  const payload = {
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? null,
    options: {
      quick: options.quick,
      time: options.time,
      warmupTime: options.warmupTime,
    },
    noiseThreshold,
    versions: {
      tv: version(variants, "tv"),
      released: version(variants, "released"),
      cva: version(variants, "cva"),
      cnfast: version(utilities, "cnfast"),
    },
    variants: variantResults,
    utilities: utilityResults,
  };

  writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`${color("Benchmark results written to", colors.dim)} ${filePath}`);
};

export const runBenchmarks = async (rawOptions = {}) => {
  const options = {
    quick: false,
    time: 1000,
    warmupTime: 200,
    ...rawOptions,
  };
  const {variants, utilities} = await loadImplementations();

  validateScenarioRegistries();

  const variantResults = await runVariantsSuite(variants, options);
  const utilityResults = await runUtilitiesSuite(utilities, options);

  const jsonPath = options.jsonOut ?? process.env.BENCHMARK_RESULTS_PATH;

  if (jsonPath)
    writeResultsJson(jsonPath, {variantResults, utilityResults, variants, utilities, options});

  return {variants: variantResults, utilities: utilityResults};
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  await runBenchmarks(parseRunArgs(process.argv.slice(2)));
}
