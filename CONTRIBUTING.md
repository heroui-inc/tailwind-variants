# Contributing

Welcome, and thanks for your interest in contributing! Please take a moment to review the following:

## Style Guide

- **Commits** follow the ["Conventional Commits" specification](https://www.conventionalcommits.org/en/v1.0.0/). This allows for changelogs to be generated automatically upon release.
- **Code** is formatted and linted with [Biome](https://biomejs.dev/).
- **JavaScript** is written as [TypeScript](https://www.typescriptlang.org/) where possible.

## Getting Started

### Setup

1. [Fork the repo](https://docs.github.com/en/github/getting-started-with-github/fork-a-repo) and clone to your machine.
2. Create a new branch with your contribution.
3. Install [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) on your machine.
4. In the repo, install dependencies via:
   ```sh
   pnpm i
   ```
5. Voilà, you're ready to go!

### Scripts

- `pnpm build` – production build
- `pnpm typecheck` – type checks
- `pnpm lint` – checks formatting and lint rules
- `pnpm lint:fix` – applies safe formatting and lint fixes
- `pnpm test` – runs the Vitest unit test suite
- `pnpm test:watch` – runs Vitest in watch mode
- `pnpm benchmark` – compares runtime performance with the latest released version and CVA

### Benchmark Requirements

Changes to runtime code, benchmark workloads, build output, or runtime dependencies must run the
full `pnpm benchmark` suite. The `--quick` option is only for smoke testing and must not be used to
support performance claims.

Benchmarks must remain comparable and performance changes must be controlled:

- Use the latest released `tailwind-variants` package reported by the suite as the primary baseline.
- Keep workload behavior equivalent across implementations; correctness assertions must pass
  before measurements are considered valid.
- Treat differences within ±5% as noise. Re-run larger differences on the same machine before
  classifying them as improvements or regressions.
- Do not change workloads, setup boundaries, iteration units, or merge behavior solely to improve
  reported numbers.
- Avoid confirmed regressions above 5%. When a regression is an intentional trade-off, keep it
  bounded and document the affected scenario, relative delta, absolute throughput, reason, and
  expected real-world impact in the pull request.
- Include the benchmark summary in the pull request and confirm that no regression is unexplained.

See the [benchmark methodology](./benchmark/README.md) for scenario definitions and measurement
rules.

### Commit Convention

Before you create a Pull Request, please check whether your commits comply with
the commit conventions used in this repository.

When you create a commit we kindly ask you to follow the convention
`category(scope or module): message` in your commit message while using one of
the following categories:

- `feat / feature`: all changes that introduce completely new code or new
  features
- `fix`: changes that fix a bug (ideally you will additionally reference an
  issue if present)
- `refactor`: any code related change that is not a fix nor a feature
- `build`: all changes regarding the build of the software, changes to
  dependencies or the addition of new dependencies
- `test`: all changes regarding tests (adding new tests or changing existing
  ones)
- `ci`: all changes regarding the configuration of continuous integration (i.e.
  github actions, ci system)
- `chore`: all changes to the repository that do not fit into any of the above
  categories

  e.g. `feat(components): add new prop to the avatar component`

If you are interested in the detailed specification you can visit
https://www.conventionalcommits.org/ or check out the
[Angular Commit Message Guidelines](https://github.com/angular/angular/blob/22b96b9/CONTRIBUTING.md#-commit-message-guidelines).

## Releases

A trade-off with using a personal repo is that permissions are fairly locked-down. In the mean-time releases will be made manually by the project owner.
