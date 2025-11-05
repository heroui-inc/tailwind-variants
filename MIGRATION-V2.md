# Migration Guide: v1 to v2

## Breaking Changes

### tailwind-merge is now an optional peer dependency

In v2, we've made `tailwind-merge` an optional peer dependency to reduce bundle size for users who don't need Tailwind CSS conflict resolution.

#### What changed?

- `tailwind-merge` is no longer bundled with tailwind-variants
- Users who want conflict resolution must install it separately
- Users who don't need conflict resolution can save ~3KB in bundle size

#### Migration Steps

If you use the default configuration with `twMerge: true` (conflict resolution enabled):

```bash
# npm
npm install tailwind-merge

# yarn
yarn add tailwind-merge

# pnpm
pnpm add tailwind-merge
```

If you don't need conflict resolution, disable it in your config:

```js
const button = tv(
  {
    base: "px-4 py-2 rounded",
    variants: {
      color: {
        primary: "bg-blue-500 text-white",
        secondary: "bg-gray-500 text-white",
      },
    },
  },
  {
    twMerge: false, // Disable conflict resolution
  },
);
```

## Performance Improvements

v2 also includes significant performance optimizations:

- **37-62% faster** for most operations
- Optimized object creation and array operations
- Reduced function call overhead
- Better memory usage

All existing APIs remain the same, so no code changes are required beyond the tailwind-merge installation.
