<!-- Thank you for contributing! -->

### Description

<!-- Please insert your description here and provide especially info about the "what" this PR is solving -->

### Additional context

<!-- e.g. is there anything you'd like reviewers to focus on? -->

### What is the purpose of this pull request?

<!-- (put an "X" next to an item) -->

- [ ] Bug fix
- [ ] New Feature
- [ ] Documentation update
- [ ] Other

### Performance impact

<!--
Required for changes to runtime code, benchmark workloads, build output, or runtime dependencies.
Run the full `pnpm benchmark`; `--quick` is only a smoke test.
Treat differences within ±5% as noise. Re-run larger regressions on the same machine and explain
every confirmed regression, including the affected scenario, delta, absolute throughput, and
trade-off. See benchmark/README.md.
-->

- [ ] This change is not performance-sensitive.
- [ ] I ran the full `pnpm benchmark` suite and reviewed the current TV versus released TV results.
- [ ] Any confirmed regression above 5% is documented and intentionally bounded.

<!-- Benchmark summary, confirmed regressions, and rationale (if applicable): -->

### Before submitting the PR, please make sure you do the following

- [ ] Read the [Contributing Guidelines](https://github.com/heroui-inc/tailwind-variants/blob/main/CONTRIBUTING.md).
- [ ] Follow the [Style Guide](https://github.com/heroui-inc/tailwind-variants/blob/main/CONTRIBUTING.md#style-guide).
- [ ] Check that there isn't already a PR that solves the problem the same way to avoid creating a duplicate.
- [ ] Provide a description in this PR that addresses **what** the PR is solving, or reference the issue that it solves (e.g. `fixes #123`).
- [ ] Confirm that performance-sensitive changes follow the [benchmark requirements](https://github.com/heroui-inc/tailwind-variants/blob/main/CONTRIBUTING.md#benchmark-requirements).
