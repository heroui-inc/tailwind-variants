import {appendFileSync} from "node:fs";
import path from "node:path";

import {Bench} from "tinybench";

import {createAdapter, loadImplementations} from "./harness.mjs";
import {assertEquivalentOutputs, hasRetainedResult, scenarios} from "./scenarios.mjs";

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
const stripColor = (value) => String(value).replace(/\u001B\[[0-9;]*m/g, "");

export const parseRunArgs = (argv) => {
  const options = {
    time: 1000,
    warmupTime: 200,
  };

  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];

    if (argument === "--quick") {
      options.time = 100;
      options.warmupTime = 50;
    } else if (argument === "--time" && argv[i + 1]) {
      options.time = Number(argv[++i]);
    } else if (argument === "--warmup" && argv[i + 1]) {
      options.warmupTime = Number(argv[++i]);
    } else {
      throw new TypeError(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (!(options.time > 0) || !(options.warmupTime >= 0)) {
    throw new RangeError("Benchmark time must be positive and warmup must be non-negative.");
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

const formatDelta = (tv, reference) => {
  const delta = ((tv.hz - reference.hz) / reference.hz) * 100;
  const status = Math.abs(delta) <= noiseThreshold ? "noise" : delta > 0 ? "faster" : "slower";

  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% ${status}`;
};

const summarizeReleasedDelta = (results) => {
  const resultsByScenario = new Map();
  const summary = {improved: 0, regressed: 0, noise: 0};

  for (const result of results) {
    const entries = resultsByScenario.get(result.scenarioId) ?? new Map();

    entries.set(result.implementation, result);
    resultsByScenario.set(result.scenarioId, entries);
  }

  for (const entries of resultsByScenario.values()) {
    const tv = entries.get("tv");
    const released = entries.get("released");
    const delta = ((tv.hz - released.hz) / released.hz) * 100;

    if (delta > noiseThreshold) summary.improved++;
    else if (delta < -noiseThreshold) summary.regressed++;
    else summary.noise++;
  }

  return summary;
};

const createRows = (results) => {
  const resultsByScenario = new Map();

  for (const result of results) {
    const entries = resultsByScenario.get(result.scenarioId) ?? new Map();

    entries.set(result.implementation, result);
    resultsByScenario.set(result.scenarioId, entries);
  }

  return scenarios.map((scenario) => {
    const entries = resultsByScenario.get(scenario.id);
    const tv = entries.get("tv");
    const released = entries.get("released");
    const cva = entries.get("cva");

    return {
      Category: scenario.category,
      Scenario: scenario.name,
      tv: formatOps(tv),
      "released ops/s": formatOps(released),
      "tv vs released": formatDelta(tv, released),
      "cva ops/s": formatOps(cva),
      "tv vs cva": cva ? formatDelta(tv, cva) : "—",
    };
  });
};

const colorDelta = (value) => {
  if (value.includes("faster")) return color(value, colors.green);
  if (value.includes("slower")) return color(value, colors.red);
  if (value.includes("noise")) return color(value, colors.yellow);

  return color(value, colors.dim);
};

const renderTerminalTable = (rows) => {
  const headers = Object.keys(rows[0]);
  const widths = headers.map((header) =>
    Math.max(header.length, ...rows.map((row) => stripColor(row[header]).length)),
  );
  const border = (left, separator, right) =>
    `${left}${widths.map((width) => "─".repeat(width + 2)).join(separator)}${right}`;
  const line = (values, styles = []) =>
    `│ ${values
      .map((value, index) => {
        const padded = String(value).padEnd(widths[index]);
        const style = styles[index];

        return style ? style(padded) : padded;
      })
      .join(" │ ")} │`;
  const valueStyles = [
    (value) => color(value, colors.dim),
    undefined,
    (value) => color(value, colors.cyan),
    (value) => color(value, colors.blue),
    colorDelta,
    (value) => color(value, colors.magenta),
    colorDelta,
  ];

  console.log(border("┌", "┬", "┐"));
  console.log(
    line(
      headers,
      headers.map(() => (value) => color(value, colors.bold)),
    ),
  );
  console.log(border("├", "┼", "┤"));
  for (const row of rows) {
    console.log(
      line(
        headers.map((header) => row[header]),
        valueStyles,
      ),
    );
  }
  console.log(border("└", "┴", "┘"));
};

const markdownDelta = (value) => {
  if (value.includes("faster")) return `🟢 ${value}`;
  if (value.includes("slower")) return `🔴 ${value}`;
  if (value.includes("noise")) return `🟡 ${value}`;

  return value;
};

const renderMarkdown = (rows, summary, implementations, options) => {
  const released = implementations.find(({id}) => id === "released");
  const cva = implementations.find(({id}) => id === "cva");
  const lines = [
    "## Runtime benchmarks",
    "",
    `**tv vs released:** 🟢 ${summary.improved} improved · 🔴 ${summary.regressed} regressed · 🟡 ${summary.noise} within ±${noiseThreshold}% noise`,
    "",
    `| Category | Scenario | tv ops/s | released ${released.version} ops/s | tv vs released | cva ${cva.version} ops/s | tv vs cva |`,
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.Category} | ${row.Scenario} | ${row.tv} | ${row["released ops/s"]} | ${markdownDelta(row["tv vs released"])} | ${row["cva ops/s"]} | ${markdownDelta(row["tv vs cva"])} |`,
    );
  }

  lines.push(
    "",
    `<sub>${options.time}ms measure · ${options.warmupTime}ms warmup · higher ops/s is better · ±${noiseThreshold}% is noise</sub>`,
    "",
  );

  return lines.join("\n");
};

const renderResults = (results, implementations, options) => {
  const summary = summarizeReleasedDelta(results);
  const rows = createRows(results);

  console.log("\nBenchmark summary");
  console.log(
    `  ${color("tv", colors.cyan)} vs ${color("released", colors.blue)}: ` +
      `${color(`${summary.improved} improved`, colors.green)} · ` +
      `${color(`${summary.regressed} regressed`, colors.red)} · ` +
      `${color(`${summary.noise} within noise`, colors.yellow)}\n`,
  );
  renderTerminalTable(rows);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      renderMarkdown(rows, summary, implementations, options),
    );
  }
};

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

export const runBenchmarks = async (rawOptions = {}) => {
  const options = {
    time: 1000,
    warmupTime: 200,
    ...rawOptions,
  };
  const implementations = await loadImplementations();
  const adapters = implementations.map(createAdapter);

  assertEquivalentOutputs(adapters);

  const isolatedScenario = scenarios.find((scenario) => scenario.id === "invocation/custom-merge");
  const regularScenarios = scenarios.filter((scenario) => scenario !== isolatedScenario);
  const taskCount = scenarios.reduce(
    (count, scenario) =>
      count + adapters.filter((adapter) => scenario.implementations.includes(adapter.kind)).length,
    0,
  );

  console.log(
    `Running ${taskCount} tasks (${options.time}ms measure, ${options.warmupTime}ms warmup).`,
  );

  const results = await runScenarioGroup(regularScenarios, adapters, options);

  if (isolatedScenario) {
    results.push(...(await runScenarioGroup([isolatedScenario], adapters, options)));
  }
  if (!hasRetainedResult()) {
    throw new Error("Benchmark results were not retained; the workload may have been eliminated.");
  }

  renderResults(results, implementations, options);
  const released = implementations.find(({id}) => id === "released");
  const cva = implementations.find(({id}) => id === "cva");

  console.log(
    `${color("tv current", colors.cyan)} · ` +
      `${color(`tv released v${released.version}`, colors.blue)} · ` +
      `${color(`cva v${cva.version}`, colors.magenta)} · ` +
      `${options.time}ms measure · ${options.warmupTime}ms warmup`,
  );
  console.log("Variant and slots matrix rows are five-call batches.");

  return results;
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  await runBenchmarks(parseRunArgs(process.argv.slice(2)));
}
