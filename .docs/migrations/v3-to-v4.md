# Migration Guide: v3 to v4

## Breaking Changes

### `twMergeConfig` moved to `tailwind-variants/config`

The default entry ships the compiled default tables only. `twMergeConfig` on `tv`, `createTV`,
or `cnMerge` needs the table compiler, which lives on the config entry. That entry exports the
same API plus `extendTailwindMerge`, `createTailwindMerge`, `createTwMerge`, `fromTheme`,
`validators`, `mergeConfigs`, and `getDefaultConfig`.

```ts
// Before
import { createTV } from "tailwind-variants";

export const tv = createTV({ twMergeConfig });

// After
import { createTV } from "tailwind-variants/config";

export const tv = createTV({ twMergeConfig });
```

The default entry throws on `twMergeConfig`, so a missed import fails at definition time. The
config entry exports `TVCustomConfig` and `TWMCustomConfig`; type a wrapper around its `tv` as
`TV<TVCustomConfig>`.

To keep the default or lite import, inject a compiled config instead:

```ts
import { createTwMerge } from "tailwind-variants/config";
import { createTV } from "tailwind-variants/lite";

export const tv = createTV({ twMerge: createTwMerge(twMergeConfig) });
```

### `experimentalParseClassName` is not supported

Compiled tables cannot run a per-class parse hook. Keep `tailwind-merge` and inject it:

```ts
import { extendTailwindMerge } from "tailwind-merge";
import { createTV } from "tailwind-variants";

export const tv = createTV({ twMerge: extendTailwindMerge({ experimentalParseClassName }) });
```

### `cn` drops a numeric `0` among other arguments

`cn` follows `clsx` on every engine. A lone `0` still stringifies, and `cx` keeps `0` everywhere.

```ts
cn("foo", 0); // "foo"  (3.3.1: "foo 0")
cn(0); // "0"
cx("foo", 0); // "foo 0"
```

### Empty lists return `""`

`tv()`, `cn()`, `cnMerge()`, and `cx()` return `""` instead of `undefined`. `CnReturn` is `string`.
Check with a falsy test, not `=== undefined`.

### Stricter types

Unknown keys on `variants`, `compoundVariants`, `defaultVariants`, and unknown slot names fail
at compile time.

### Peers

`tailwind-merge` and `tailwindcss` are no longer peer dependencies. Conflict resolution ships in
the default entry.

### Lite

Factory and per-call config only accept `twMerge`. A function passed as `twMerge` is invoked.
3.3.1 treated a function as `true` and used the built-in table.

```ts
import { createTV, createCN } from "tailwind-variants/lite";
import { twMerge } from "tailwind-merge";

export const tv = createTV({ twMerge });
export const cn = createCN({ twMerge });
```

### `twMerge: false` joins with `cx` semantics

Base, slot, variant, and compound class strings are whitespace-normalized once, when a recipe
is first used. `"px-2  px-4"` becomes `"px-2 px-4"`.

### Pick one engine

Do not ship a second merger next to this package's default tables. Alias everything here, or
keep the merger you have and inject it through the lite entry.

| Entry                      | Ships                                                   | min+gzip      |
| -------------------------- | ------------------------------------------------------- | ------------- |
| `tailwind-variants`        | engine + default tables + `tv` runtime                  | about 16.6 KB |
| `tailwind-variants/merge`  | engine + default tables, no `tv`                        | about 10.8 KB |
| `tailwind-variants/config` | default entry + table compiler                          | about 26.6 KB |
| `tailwind-variants/lite`   | `tv` runtime only, joins or calls an injected `twMerge` | about 5.3 KB  |

## New entries and aliases

`tailwind-variants` exports `twMerge`, `twJoin`, and `clsx` (also as the default export).
`tailwind-variants/merge` exports the same merge utilities without the recipe runtime.

```js
// app that already uses tv
resolve: {alias: {"tailwind-merge": "tailwind-variants", clsx: "tailwind-variants"}}

// merge-only code, without the tv runtime
resolve: {alias: {"tailwind-merge": "tailwind-variants/merge", clsx: "tailwind-variants/merge"}}
```

Code that calls `extendTailwindMerge` aliases `tailwind-merge` to `tailwind-variants/config`.

## Behavior notes

- Unlabeled `font-[…]` follows Tailwind v4: `font-[Inter]` is a font family, `font-[700]` a
  weight. Labeled and CSS-variable forms match tailwind-merge 3.6.0.
- `cx`, `clsx`, and `twJoin` differ. `cx` normalizes whitespace, keeps a numeric `0`, and
  accepts objects. `twJoin` joins strings and arrays. `clsx` follows clsx.
- `extend: [a, b, c]` merges parents left to right at definition time.
- Array compound and variant classes apply to the base slot.
- `debug: true` logs resolution in development browsers only.
