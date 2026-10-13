# Benchmark suite

This suite measures the built package, not source files. It separates one-time component
construction from repeated invocation and from complete create-and-call lifecycle workloads.
The structure follows the useful parts of CVA's benchmark system while adding TV-specific
coverage for slots, `extend` (single and multi-parent), custom Tailwind Merge configuration,
and `cnMerge`.

## Commands

```sh
# Full current TV versus released TV versus CVA run
pnpm benchmark

# Fast smoke run (not suitable for performance claims)
pnpm benchmark --quick

# Write machine-readable results for cross-run comparison
BENCHMARK_RESULTS_PATH=benchmark-results.json pnpm benchmark
```

`--quick` uses 100 ms measure / 50 ms warmup / a single round, drops the faster/slower verdicts
from the delta columns, and flags the run as `[UNRELIABLE]` in the output. Quick runs are for
iteration and CI smoke checks only, never for claims.

Additional flags:

- `--time <ms>` / `--warmup <ms>` override the per-task measure / warmup time.
- `--rounds <n>` overrides the number of measurement rounds per task (default 3); the median
  round is reported.

Each run queries npm for the latest published `tailwind-variants`,
`class-variance-authority`, and `cn` (shadcn-ui/cn), caches those exact packages in the system
temporary directory, and runs two suites in order:

### Suite 1 · variants

- `tv`: the package built from the current checkout.
- `tv(released-{version})`: the latest `tailwind-variants` published to npm.
- `cva({version})`: the latest `class-variance-authority` published to npm.

### Suite 2 · utilities (`cx` / `cn` vs shadcn-ui/cn)

Compares equivalent class-utility APIs:

| Scenario (id)                                          | TV / released                          | shadcn-ui/cn |
| ------------------------------------------------------ | -------------------------------------- | ------------ |
| cx / clsx (mixed) (`utilities/join-mixed`)             | `cx` (normalizing join)                | `clsx`       |
| cx / twJoin (strings) (`utilities/join-tokens`)        | `cx` (normalizing join)                | `twJoin`     |
| twJoin / twJoin (`utilities/tw-join`)                  | `twJoin`                               | `twJoin`     |
| cn / cn (`utilities/merge`)                            | `cn`                                   | `cn`         |
| cn / cn (stable args) (`utilities/cn-stable-args`)     | `cn(base, cond && extra, className)`   | same         |
| cn / cn (new arbitrary) (`utilities/cn-arbitrary-arg`) | `cn(base, cond && extra, "w-[<n>px]")` | same         |
| cnMerge (`utilities/cn-merge`)                         | `cnMerge`                              | —            |
| twMerge / twMerge (`utilities/tw-merge`)               | `twMerge`                              | `twMerge`    |

The two `cx` rows measure a different API shape: `cx` normalizes whitespace, keeps a numeric
`0`, and accepts objects. The `cn` column is the published shadcn-ui/cn package. The `twJoin`
and `twMerge` rows are like-for-like against it.

The npm registry must be reachable even when packages are already cached, so the cache cannot
silently turn a stale release into the baseline.

Results are printed as one comparison table. Throughput uses compact human-readable units such as
`2.5M`, while relative margin of error and current-to-reference deltas remain visible. The summary
counts improvements and regressions against the released TV baseline. Terminal output uses green
for improvements, red for regressions, yellow for noise, and distinct colors for each implementation;
set `NO_COLOR=1` to disable ANSI colors.

## Measurement rules

- Current and released TV are imported from their built `dist/index.js` entry points.
- Current and released TV use the same installed Tailwind Merge version.
- CVA receives equivalent no-slots workloads; Tailwind Merge is applied outside CVA when
  comparing merge-enabled workloads.
- Equivalent workloads must produce identical output before measurement starts.
- Adapter-only configuration normalization happens before timing starts.
- Component construction never occurs inside an invocation-only scenario.
- Lifecycle scenarios deliberately include both construction and invocation.
- Variant-matrix throughput is batches per second, with five calls in each batch.
- "Invoke hot" (`invocation/hot-same-props`) and "Invoke slots hot" (`invocation/slots-hot`)
  call a pre-created component with one stable props object.
- "Invoke hot + new className" (`invocation/hot-fresh-classname`) passes a new `className`
  string with the same text on every call, the React render shape.
- "Invoke SSR (unique className)" (`invocation/unique-classname`) passes a never-repeating
  `className`, so every merge is a first sighting.
- "Invoke compound-heavy" (`invocation/compounds-heavy`) runs a recipe with twelve compound
  variants.
- "Invoke lite + injected twMerge" (`invocation/lite-inject`) runs the lite entry with this
  build's own `twMerge` injected. Builds whose lite entry ignores the function (3.3.1) skip it.
- Every row has a stable `id` (`category/slug`). Names may change, ids and row order do not, so
  JSON output and compare scripts key on `scenarioId`.
- Every run prints the default entry's min+gzip size for the current build and the released
  baseline, and writes it to JSON under `entrySizes`. `src/__tests__/entries.test.ts` fails when
  the entry grows past its budget or pulls in the table compiler.
- Scenarios that pass `twMergeConfig` run through `dist/config-entry.js` when the build has it;
  older builds serve them from `dist/index.js`.
- TV-only features are not presented as direct CVA comparisons.
- The default measurement is 1,000 ms after a 200 ms warmup, repeated for 3 rounds per
  task. The median round is reported, so a single noisy window (GC pause, scheduler jitter)
  cannot dominate the result.
- Each suite runs in its own child process (`--suite variants` / `--suite utilities`). The
  default run spawns both and prints only the tables. JSON is written only with
  `--json-out <path>` or `BENCHMARK_RESULTS_PATH`. Running both suites in one process let the
  variants suite depress the utilities rows through GC pressure.
- Each task runs in a fresh `Bench`, and a garbage collection is forced before every task
  (`node --expose-gc`). This isolates one measurement window from allocations left behind by
  the previous task.
- The timer overhead is calibrated with `calibrateTimerOverhead` and subtracted from each
  task's mean latency (the same correction as tinybench's `subtractTimerOverhead`, applied at
  the aggregate level). Subtracting per sample instead would clamp most samples to zero for
  tasks whose latency is close to the overhead, inflating reported throughput by orders of
  magnitude. The correction is only applied when a task's mean latency is comfortably above
  the overhead.
- Differences within ±5% should be treated as noise and confirmed with repeated runs on the
  same machine.
- Before measurement, every TV module is warmed with the same set of config shapes
  (`equalizeConfigShapeExposure`), using array extend when supported and a single-parent
  extend otherwise. V8 type feedback is process-global, so a module that runs extra
  capability-gated scenarios would otherwise be measured with megamorphic inline caches
  while the other module keeps faster monomorphic ones — an asymmetry that showed up as a
  spurious 25-35% construction "regression" for the current build.
- Custom Tailwind Merge configuration runs in a separate final phase because TV's merger cache
  is process-global.

## Multi-parent `extend`

Multi-extend folds parents at **definition time** only. The per-call / invocation path is the
same flattened recipe as a single-parent or chained `extend`.

| Scenario                    | What it measures                               |
| --------------------------- | ---------------------------------------------- |
| `composition/extend-multi`  | Create three mixins + compose + one call       |
| `construction/extend-multi` | Definition-time compose only                   |
| `invocation/extend-multi`   | Pre-created recipe, five-call batch (hot path) |

These scenarios use `extend: [a, b, c]`, so only implementations that actually support array
extend are measured. Support is probed at load time (`capabilities.mjs`) — never inferred from
version numbers, which cannot be anticipated for future releases — and the probe verifies the
output, because older versions silently ignore an `extend` array instead of throwing.

A released version without array extend is skipped for these scenarios and shows `—` in the
table; it gains a baseline automatically as soon as a released version ships the API. Expect:

- **invocation/\*** (including `extend-multi`): parity with released (noise). Parent folding runs
  only inside `tv({...})`, not on each component call.
- **composition/extend** (single parent): should stay within noise; single-parent still uses the
  parent recipe directly (no fold loop).
- **construction/extend-multi** / **composition/extend-multi**: array compose against a released
  build that supports it, or against current TV alone until then.

## Pull request automation

Pull requests that change runtime sources, benchmark code, build configuration, or dependency
manifests run the full suite. The result table is visible in the workflow log.

Pass `--json-out <path>` (or set `BENCHMARK_RESULTS_PATH` in CI) to emit machine-readable results as
`{timestamp, commit, options, noiseThreshold, versions, variants[], utilities[]}` for cross-run
comparison.
