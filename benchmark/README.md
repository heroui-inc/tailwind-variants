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
`class-variance-authority`, and `cnfast`, caches those exact packages in the system temporary
directory, and runs two suites in order:

### Suite 1 · variants

- `tv`: the package built from the current checkout.
- `tv(released-{version})`: the latest `tailwind-variants` published to npm.
- `cva({version})`: the latest `class-variance-authority` published to npm.

### Suite 2 · utilities (`cx` / `cn` vs `cnfast`)

Compares equivalent class-utility APIs:

| Scenario | TV / released | cnfast |
| --- | --- | --- |
| Join mixed values | `cx` | `clsx` |
| Join string tokens | `cx` | `twJoin` |
| Join and merge | `cn` | `cn` |
| Curried merge with config | `cnMerge` | — |
| Direct Tailwind merge | — | `twMerge` |

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
- TV-only features are not presented as direct CVA comparisons.
- The default measurement is 1,000 ms after a 200 ms warmup, repeated for 3 rounds per
  task. The median round is reported, so a single noisy window (GC pause, scheduler jitter)
  cannot dominate the result.
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
- Custom Tailwind Merge configuration runs in a separate final phase because TV's merger cache
  is process-global.

## Multi-parent `extend`

Multi-extend folds parents at **definition time** only. The per-call / invocation path is the
same flattened recipe as a single-parent or chained `extend`.

| Scenario | What it measures |
| --- | --- |
| `composition/extend-multi` | Create three mixins + compose + one call |
| `construction/extend-multi` | Definition-time compose only (array vs chain) |
| `invocation/extend-multi` | Pre-created recipe, five-call batch (hot path) |

Current TV uses `extend: [a, b, c]`. Released TV (no array API) uses an equivalent inheritance
chain so outputs stay comparable. Expect:

- **invocation/*** (including `extend-multi`): parity with released (noise). Parent folding runs
  only inside `tv({...})`, not on each component call.
- **composition/extend** (single parent): should stay within noise; single-parent still uses the
  parent recipe directly (no fold loop).
- **construction/extend-multi** / **composition/extend-multi**: array compose vs a forced chain;
  usually within noise, sometimes slightly faster (one fold pass vs intermediate recipes).

## Pull request automation

Pull requests that change runtime sources, benchmark code, build configuration, or dependency
manifests run the full suite. The result table is visible in the workflow log.

Pass `--json-out <path>` (or set `BENCHMARK_RESULTS_PATH` in CI) to emit machine-readable results as
`{timestamp, commit, options, noiseThreshold, versions, variants[], utilities[]}` for cross-run
comparison.
