# Benchmark suite

This suite measures the built package, not source files. It separates one-time component
construction from repeated invocation and from complete create-and-call lifecycle workloads.
The structure follows the useful parts of CVA's benchmark system while adding TV-specific
coverage for slots, `extend`, custom Tailwind Merge configuration, and `cnMerge`.

## Commands

```sh
# Full current TV versus released TV versus CVA run
pnpm benchmark

# Fast smoke run (not suitable for performance claims)
pnpm benchmark --quick
```

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

## Pull request automation

Pull requests that change runtime sources, benchmark code, build configuration, or dependency
manifests run the full suite. The result table is visible in the workflow log and is also appended
to the GitHub Actions job summary.
