# Migration Guide: v2 to v3

## Breaking Changes

### Introduction of `/lite` entry point (no `tailwind-merge`)

In v3, `tailwind-variants` is now offered in two builds:

- **Original build** – includes `tailwind-merge` (same as before)
- **Lite build** – excludes `tailwind-merge` for a smaller bundle and faster runtime

#### What changed?

- `tailwind-merge` is no longer lazily loaded; it's statically included in the original build only
- Lite build completely removes `tailwind-merge` and its config
- `createTV`, `tv`, and `cn` in the lite build **no longer accept `config` (tailwind-merge config)**

#### Migration Steps

If you use the default configuration with `twMerge: true` (conflict resolution enabled), make sure to install `tailwind-merge` in your project:

```bash
# npm
npm install tailwind-merge

# yarn
yarn add tailwind-merge

# pnpm
pnpm add tailwind-merge
```

If you do not need conflict resolution, switch to the lite build by importing from `tailwind-variants/lite`:

```ts
import {createTV, tv, cn, cnBase} from "tailwind-variants/lite";
```
