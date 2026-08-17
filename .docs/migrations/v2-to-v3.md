# Migration Guide: v2 to v3

## Breaking Changes

### Two builds

```ts
// Default. Conflict resolution included.
import {tv, cn, cx} from "tailwind-variants";

// Lite. No built-in merge, smaller bundle.
import {tv, cx} from "tailwind-variants/lite";
```

Conflict resolution ships in the default build. You do not need `tailwind-merge` unless your app calls it directly.

`{twMerge: false}` turns merging off at runtime. It does not remove the table from the bundle. Use `/lite` for that.

### Lite with an existing merger

If you already have `twMerge`, inject it:

```ts
import {createCN, createTV} from "tailwind-variants/lite";
import {twMerge} from "tailwind-merge";

export const tv = createTV({twMerge});
export const cn = createCN({twMerge});
```

`createTV` does not bind `cn`. Configure that function in `tailwind-merge`, not with `twMergeConfig`.
