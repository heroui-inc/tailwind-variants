## Unreleased

### ✨ Features

- compiled merge tables: a single-pass engine replaces the Map-based merger, and the default entry exports `twMerge`, `twJoin`, and `clsx` (also default) so `tailwind-merge` and `clsx` can be aliased to this package
- `tailwind-variants/merge` entry: the merge utilities without the recipe runtime
- `tailwind-variants/config` entry: `twMergeConfig` on `tv`, `createTV`, and `cnMerge`, plus `extendTailwindMerge`, `createTailwindMerge`, `createTwMerge`, `fromTheme`, `validators`, `mergeConfigs`, and `getDefaultConfig`
- `tailwind-variants/lite` exports a strings-only `clsx`, like `clsx/lite`

### ⚡ Performance

- static core per recipe and per slot, and a `class` / `className` cache keyed by text so a new string with the same text still hits
- hot `tv()` runs about 1.6×–2× faster than 3.3.1 and faster than cva; `cn()` is about 3× faster than 3.3.1 on join-and-merge and about 2× on unique arbitrary values
- custom configs compile once per structural key, so a config literal rebuilt on every call compiles once

### 🐛 Fixes

- unlabeled `font-[Inter]` is a font family and `font-[700]` a weight, as in Tailwind v4
- fill Tailwind grammar gaps: custom animation names, composable `contain-*`, legacy `bg-gradient-to-*` and `bg-conic`, `columns-auto`, `max-h-none`, and the container and spacing scales on more families

### 🚨 Breaking Changes

- **twMergeConfig:** only `tailwind-variants/config` accepts it; the default entry throws
- **experimentalParseClassName:** not supported; inject `tailwind-merge`'s `extendTailwindMerge(...)` through `twMerge`
- **cn and 0:** `cn("a", 0)` drops the zero like clsx; `cn(0)` stays `"0"` and `cx` is unchanged
- **twMerge: false:** joins with `cx` semantics; recipe class strings are whitespace-normalized when the recipe compiles
- **one engine per app:** alias `tailwind-merge` and `clsx` here, or use the lite entry with the merger you already ship

### 🛠 Chores

- `pnpm compile-tables` regenerates the default merge tables from the source config
- benchmarks run each suite in its own process and print entry sizes

See `.docs/migrations/v3-to-v4.md`.

## [3.3.1](https://github.com/heroui-inc/tailwind-variants/compare/v3.3.0...v3.3.1) (2026-08-03)

### Bug Fixes

- slots shared-state contamination ([#305](https://github.com/heroui-inc/tailwind-variants/issues/305)) ([8b7f0b6](https://github.com/heroui-inc/tailwind-variants/commit/8b7f0b664026ffadd5542cf509e79424cdacc93c))

# [3.3.0](https://github.com/heroui-inc/tailwind-variants/compare/v3.2.2...v3.3.0) (2026-07-26)

## [3.2.2](https://github.com/heroui-inc/tailwind-variants/compare/v3.2.1...v3.2.2) (2025-11-22)

## [3.2.1](https://github.com/heroui-inc/tailwind-variants/compare/v3.2.0...v3.2.1) (2025-11-22)

### Bug Fixes

- update cn function type and import cx from tailwind-variants/lite ([#285](https://github.com/heroui-inc/tailwind-variants/issues/285)) ([3a3afce](https://github.com/heroui-inc/tailwind-variants/commit/3a3afce7888a5f7594d4b6a206796bf7b5ac0a8d))

# [3.2.0](https://github.com/heroui-inc/tailwind-variants/compare/v3.1.1...v3.2.0) (2025-11-22)

### Bug Fixes

- export defaultConfig as value and remove responsiveVariants ([#284](https://github.com/heroui-inc/tailwind-variants/issues/284)) ([65ee73c](https://github.com/heroui-inc/tailwind-variants/commit/65ee73cc80eb1813d582ede6091f849fa572317e))
- make twMerge default to true in cn function ([#283](https://github.com/heroui-inc/tailwind-variants/issues/283)) ([1659aa7](https://github.com/heroui-inc/tailwind-variants/commit/1659aa7acccdc0a2ccdd4597a54c988866ca1d64))
- no longer minifyng the code ([#282](https://github.com/heroui-inc/tailwind-variants/issues/282)) ([34c62f4](https://github.com/heroui-inc/tailwind-variants/commit/34c62f48a72680b2cde9d06d9e1e64520db0c55b))

### Features

- add cx function and refactor cn to use tailwind-merge ([#278](https://github.com/heroui-inc/tailwind-variants/issues/278)) ([8ec5f6f](https://github.com/heroui-inc/tailwind-variants/commit/8ec5f6fbd0c808675838fb71a6e32e8a570159cf))

## [3.1.1](https://github.com/heroui-inc/tailwind-variants/compare/v3.1.0...v3.1.1) (2025-09-08)

### Bug Fixes

- use 'type' for type-only imports and specify file extensions ([#272](https://github.com/heroui-inc/tailwind-variants/issues/272)) ([58aa71e](https://github.com/heroui-inc/tailwind-variants/commit/58aa71eaf1e9d9cf4954fad786b3b8e9e36775ca))

# [3.1.0](https://github.com/heroui-inc/tailwind-variants/compare/v3.0.0...v3.1.0) (2025-08-25)

### Features

- export config types ([#267](https://github.com/heroui-inc/tailwind-variants/issues/267)) ([5fd06fa](https://github.com/heroui-inc/tailwind-variants/commit/5fd06face1211a63b85b782f8948bb543ef66c9b))

# [3.0.0](https://github.com/heroui-inc/tailwind-variants/compare/v2.1.0...v3.0.0) (2025-08-24)

### Features

- split tv into original and lite versions ([#264](https://github.com/heroui-inc/tailwind-variants/issues/264)) ([0eb65ba](https://github.com/heroui-inc/tailwind-variants/commit/0eb65bab81842f27dc9fc09c04f12eb2b5584cc9))

# [2.1.0](https://github.com/heroui-inc/tailwind-variants/compare/v2.0.1...v2.1.0) (2025-07-31)

### Features

- implement lazy loading for tailwind-merge module ([#257](https://github.com/heroui-inc/tailwind-variants/issues/257)) ([e80c23a](https://github.com/heroui-inc/tailwind-variants/commit/e80c23a4b585936f7b5fca2c5c383b8ddaa7d405))

## [2.0.1](https://github.com/heroui-inc/tailwind-variants/compare/v2.0.0...v2.0.1) (2025-07-28)

# [2.0.0](https://github.com/heroui-inc/tailwind-variants/compare/v1.0.0...v2.0.0) (2025-07-27)

# [2.0.0](https://github.com/heroui-inc/tailwind-variants/compare/v1.0.0...v2.0.0) (2025-07-27)

# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [2.0.0](https://github.com/heroui-inc/tailwind-variants/compare/v1.1.0...v2.0.0) (2025-07-27)

### ⚠ BREAKING CHANGES

- **deps:** tailwind-merge is now an optional peer dependency. Users who want Tailwind CSS conflict resolution must install it separately:
  ```bash
  npm install tailwind-merge
  ```

### Features

- **performance:** Significant performance optimizations (37-62% faster for most operations)
- **bundle:** Reduced bundle size from 5.8KB to 5.2KB (10% smaller)
- **deps:** Made tailwind-merge an optional peer dependency

### Performance Improvements

- Replaced array methods with for loops for better performance
- Optimized object property checks using `in` operator
- Improved `isEmptyObject` implementation
- Better `isEqual` implementation without JSON.stringify
- Reduced object allocations and temporary variables
- Cached regex patterns
- Streamlined string operations

For migration instructions, see the [v2 migration guide](./.docs/migrations/v1-to-v2.md).
