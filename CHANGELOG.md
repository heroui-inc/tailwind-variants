# [3.2.0](https://github.com/heroui-inc/tailwind-variants/compare/v3.1.1...v3.2.0) (2025-11-22)


### Bug Fixes

* export defaultConfig as value and remove responsiveVariants ([#284](https://github.com/heroui-inc/tailwind-variants/issues/284)) ([65ee73c](https://github.com/heroui-inc/tailwind-variants/commit/65ee73cc80eb1813d582ede6091f849fa572317e))
* make twMerge default to true in cn function ([#283](https://github.com/heroui-inc/tailwind-variants/issues/283)) ([1659aa7](https://github.com/heroui-inc/tailwind-variants/commit/1659aa7acccdc0a2ccdd4597a54c988866ca1d64))
* no longer minifyng the code ([#282](https://github.com/heroui-inc/tailwind-variants/issues/282)) ([34c62f4](https://github.com/heroui-inc/tailwind-variants/commit/34c62f48a72680b2cde9d06d9e1e64520db0c55b))


### Features

* add cx function and refactor cn to use tailwind-merge ([#278](https://github.com/heroui-inc/tailwind-variants/issues/278)) ([8ec5f6f](https://github.com/heroui-inc/tailwind-variants/commit/8ec5f6fbd0c808675838fb71a6e32e8a570159cf))



## [3.1.1](https://github.com/heroui-inc/tailwind-variants/compare/v3.1.0...v3.1.1) (2025-09-08)


### Bug Fixes

* use 'type' for type-only imports and specify file extensions ([#272](https://github.com/heroui-inc/tailwind-variants/issues/272)) ([58aa71e](https://github.com/heroui-inc/tailwind-variants/commit/58aa71eaf1e9d9cf4954fad786b3b8e9e36775ca))



# [3.1.0](https://github.com/heroui-inc/tailwind-variants/compare/v3.0.0...v3.1.0) (2025-08-25)


### Features

* export config types ([#267](https://github.com/heroui-inc/tailwind-variants/issues/267)) ([5fd06fa](https://github.com/heroui-inc/tailwind-variants/commit/5fd06face1211a63b85b782f8948bb543ef66c9b))



# [3.0.0](https://github.com/heroui-inc/tailwind-variants/compare/v2.1.0...v3.0.0) (2025-08-24)


### Features

* split tv into original and lite versions  ([#264](https://github.com/heroui-inc/tailwind-variants/issues/264)) ([0eb65ba](https://github.com/heroui-inc/tailwind-variants/commit/0eb65bab81842f27dc9fc09c04f12eb2b5584cc9))



# [2.1.0](https://github.com/heroui-inc/tailwind-variants/compare/v2.0.1...v2.1.0) (2025-07-31)


### Features

* implement lazy loading for tailwind-merge module ([#257](https://github.com/heroui-inc/tailwind-variants/issues/257)) ([e80c23a](https://github.com/heroui-inc/tailwind-variants/commit/e80c23a4b585936f7b5fca2c5c383b8ddaa7d405))



## [2.0.1](https://github.com/heroui-inc/tailwind-variants/compare/v2.0.0...v2.0.1) (2025-07-28)



# [2.0.0](https://github.com/heroui-inc/tailwind-variants/compare/v1.0.0...v2.0.0) (2025-07-27)



# [2.0.0](https://github.com/heroui-inc/tailwind-variants/compare/v1.0.0...v2.0.0) (2025-07-27)



# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [2.0.0](https://github.com/heroui-inc/tailwind-variants/compare/v1.1.0...v2.0.0) (2025-07-27)

### ⚠ BREAKING CHANGES

* **deps:** tailwind-merge is now an optional peer dependency. Users who want Tailwind CSS conflict resolution must install it separately:
  ```bash
  npm install tailwind-merge
  ```

### Features

* **performance:** Significant performance optimizations (37-62% faster for most operations)
* **bundle:** Reduced bundle size from 5.8KB to 5.2KB (10% smaller)
* **deps:** Made tailwind-merge an optional peer dependency

### Performance Improvements

* Replaced array methods with for loops for better performance
* Optimized object property checks using `in` operator
* Improved `isEmptyObject` implementation
* Better `isEqual` implementation without JSON.stringify
* Reduced object allocations and temporary variables
* Cached regex patterns
* Streamlined string operations

For migration instructions, see [MIGRATION-V2.md](./MIGRATION-V2.md)