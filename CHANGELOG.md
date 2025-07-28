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