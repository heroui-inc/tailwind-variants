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

`--quick` uses 100 ms measure / 50 ms warmup, drops the faster/slower verdicts from the delta
columns, and flags the run as `[UNRELIABLE]` in the output. Quick runs are for iteration and CI
smoke checks only, never for claims.

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
- The default measurement is 1,000 ms after a 200 ms warmup. Differences within ±5% should
  be treated as noise and confirmed with repeated runs on the same machine.
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
manifests run the full suite. The result table is visible in the workflow log, is appended to the
GitHub Actions job summary, and is posted to the pull request as a **single comment**.

### PR comment report

Every benchmark trigger updates the same comment in place — identified by an HTML marker — so the
comment thread never gets polluted with a new comment per push:

| Status | When | Body |
| --- | --- | --- |
| 🔄 **Benchmark running…** | posted before the benchmark starts | commit, branch, workflow link |
| ✅ **Completed** | benchmark succeeded | full cross-run comparison + versions |
| ⚠️ **Completed — regressions detected** | succeeded but ≥1 regression vs baseline | same report, warning header |
| ❌ **Benchmark failed** | benchmark step failed | failure notice + workflow link |
| ⏹️ **Benchmark cancelled** | superseded by a newer run | cancellation notice |

The report compares the current run against the **previous run on the same PR**. The raw results of
the latest successful run are embedded in an HTML comment at the end of the report comment, so no
extra branch or storage is needed — the next run parses that payload and marks each scenario as:

- 🟢 **improved** — more than +5% vs baseline
- 🔴 **regressed** — more than −5% vs baseline
- 🟡 **within noise** — inside ±5%

The first run on a PR has no baseline yet, so it just records the numbers and becomes the baseline
for the next run. Statuses that need the pull request API (`running`, `results`, `failed`,
`cancelled`) only post comments for same-repository PRs; fork PRs keep the benchmark but skip the
comment because the default token cannot write to them.

The workflow sets `GH_TOKEN: ${{ github.token }}` at the job level. This is required: the `gh`
CLI does not use the auto-injected `GITHUB_TOKEN` in Actions, so without `GH_TOKEN` every comment
step fails (the error is logged as `benchmark comment skipped: ...`).

The raw results the report consumes are written by the benchmark itself: set
`BENCHMARK_RESULTS_PATH` (CI) or pass `--json-out <path>` to emit
`{timestamp, commit, options, noiseThreshold, versions, variants[], utilities[]}`.
