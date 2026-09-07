<p align="center">
  <a href="https://tailwind-variants.org">
    <img width="20%" src=".github/assets/isotipo.png" alt="tailwind-variants" />
    <h1 align="center">tailwind-variants</h1>
  </a>
</p>
<p align="center">
  The <em>power</em> of Tailwind combined with a <em>first-class</em> variant API.<br><br>
  <a href="https://www.npmjs.com/package/tailwind-variants">
    <img src="https://img.shields.io/npm/dm/tailwind-variants.svg?style=flat-round" alt="npm downloads">
  </a>
  <a href="https://www.npmjs.com/package/tailwind-variants">
    <img alt="NPM Version" src="https://badgen.net/npm/v/tailwind-variants" />
  </a>
  <a href="https://github.com/heroui-inc/tailwind-variants/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/tailwind-variants?style=flat" alt="License">
  </a>
</p>

## Features

- First-class variant API
- Slots support
- Composition support (including multi-extend)
- Fully typed
- Framework agnostic
- Built-in conflict resolution
- Debugging and tracing (experimental)
- Tailwind CSS v4 support

## Installation

```bash
npm i tailwind-variants
# or
yarn add tailwind-variants
# or
pnpm add tailwind-variants
```

**Lite:** import from `tailwind-variants/lite` for a smaller bundle without conflict resolution.

**Upgrading?**

- v3 → v4: [migration guide](./.docs/migrations/v3-to-v4.md)
- v2 → v3: [migration guide](./.docs/migrations/v2-to-v3.md)
- v1 → v2: [migration guide](./.docs/migrations/v1-to-v2.md)

## Quick Start

```js
import { tv } from "tailwind-variants";

const button = tv({
  base: "font-medium bg-blue-500 text-white rounded-full active:opacity-80",
  variants: {
    color: {
      primary: "bg-blue-500 text-white",
      secondary: "bg-purple-500 text-white",
    },
    size: {
      sm: "text-sm",
      md: "text-base",
      lg: "px-4 py-3 text-lg",
    },
  },
  compoundVariants: [
    {
      size: ["sm", "md"],
      class: "px-3 py-1",
    },
  ],
  defaultVariants: {
    size: "md",
    color: "primary",
  },
});

button({ size: "sm", color: "secondary" });
// => "font-medium rounded-full active:opacity-80 bg-purple-500 text-white text-sm px-3 py-1"
```

> **Note:** Tailwind CSS v4 no longer supports `config.content.transform`, so responsive variants
> were removed. Add responsive classes to your class names manually if needed.

## Conflict Resolution

Conflict resolution is built in. The default entry ships compiled merge tables and a
single-pass engine. One engine serves `tv`, `cn`, and `twMerge`. No extra merge package is
needed.

```js
import { tv, cn, twMerge, twJoin, clsx } from "tailwind-variants";

cn("px-2", "px-4", { "py-1": true }); // => "px-4 py-1"
twMerge("px-2", "px-4"); // => "px-4"
tv({ base: "px-2", variants: { size: { lg: "px-4" } } })({ size: "lg" }); // => "px-4"
```

Repeated work stays off the render path. `cn` answers calls made with the same string instances
from an argument cache. Recipes keep a pre-merged core per variant selection and cache
`class` / `className` overrides by text, so a new string with the same text still hits.

### Performance

Numbers come from `pnpm benchmark` (Node 24, median of three rounds). Use them for direction,
not as absolute figures.

- Against 3.3.1, `cn()` gains about 3× on join-and-merge and about 2× on unique arbitrary values.
  On stable arguments both sit in the same band: 3.3.1 already cached by argument identity.
- Hot `tv()` calls run about 1.6×–2× faster than 3.3.1, and faster than cva on the same recipe.
- Creating a component is slower than cva. `tv()` normalizes and pre-merges at definition so
  every call is cheaper.

### Aliasing `tailwind-merge` and `clsx`

The package exports the same names as `tailwind-merge` (`twMerge`, `twJoin`) and `clsx`
(`clsx`, also the default export). Alias both packages to it and run one engine.

```js
// app that already uses tv
resolve: { alias: { "tailwind-merge": "tailwind-variants", clsx: "tailwind-variants" } }

// merge-only code, without the tv runtime
resolve: { alias: { "tailwind-merge": "tailwind-variants/merge", clsx: "tailwind-variants/merge" } }
```

Code that calls `extendTailwindMerge` or `createTailwindMerge` aliases `tailwind-merge` to
`tailwind-variants/config` instead.

Known limits:

- Unlabeled `font-[…]` follows Tailwind v4: `font-[Inter]` is a font family, `font-[700]` a
  weight. Labeled forms (`family-name:`, `weight:`) and CSS-variable forms are unchanged.
- `cx`, `clsx`, and `twJoin` differ. `cx` normalizes whitespace, keeps a numeric `0`, and
  accepts objects. `twJoin` joins strings and arrays. `clsx` follows clsx.
- `experimentalParseClassName` is not supported (see below).
- `twMerge` takes strings and nested arrays. Object syntax belongs to `cn` and `clsx`.
- Pick one engine per app. Alias everything here, or use the lite entry with the merger you
  already ship.
- `TWMergeConfig` is the plain `{ extend, override, prefix, cacheSize }` shape. It is not
  generic over class-group ids.

### Custom configuration

Custom utilities need the table compiler, which ships only on `tailwind-variants/config`. That
entry exports the same API plus `twMergeConfig` on `tv`, `createTV`, and `cnMerge`, and the
config API: `extendTailwindMerge`, `createTailwindMerge`, `createTwMerge`,
`fromTheme`, `validators`, `mergeConfigs`, `getDefaultConfig`. `extend` appends to the
defaults, `override` replaces them.

```ts
import { createTV, extendTailwindMerge, tv, type TWMergeConfig } from "tailwind-variants/config";

const twMergeConfig = {
  extend: {
    classGroups: {
      elevation: ["elevation-low", "elevation-high"],
    },
  },
} satisfies TWMergeConfig;

tv({ base: "elevation-low", variants: { raised: { true: "elevation-high" } } }, { twMergeConfig });
createTV({ twMergeConfig });
extendTailwindMerge(twMergeConfig)("elevation-low elevation-high"); // => "elevation-high"
```

Each config compiles to its own tables once. Engines are cached by identity and by structure,
so a config literal rebuilt on every call still compiles once. `prefix` and `cacheSize` are
honored. `experimentalParseClassName` is not: inject a merge function that supports it
through `twMerge`.

The default entry throws on `twMergeConfig`, so a missed import fails at definition time.
Disable merging with `{ twMerge: false }` on `tv`, `createTV`, or `cnMerge`.

### Lite build

Import from `tailwind-variants/lite` when the app already has a merger, or needs none. Lite
ships no engine and no tables. It joins, or calls the function you inject.

```ts
import { createCN, createTV } from "tailwind-variants/lite";
import { twMerge } from "tailwind-variants/merge";

export const tv = createTV({ twMerge });
export const cn = createCN({ twMerge });
```

Lite also exports a strings-only `clsx` (named and default), like `clsx/lite`. `createTV` does
not bind `cn`. `debug` is default-entry only. `twMergeConfig` lives on `tailwind-variants/config`.

## Composition

`extend` merges one or more parent recipes into a child. Pass a single `tv()` result, or a **non-empty**
array merged left-to-right (child options win last).

```ts
import { tv } from "tailwind-variants";

const focusable = tv({ base: "focus-visible:ring-2" });
const animated = tv({ base: "transition-all duration-150" });

const button = tv({
  extend: [focusable, animated],
  base: "inline-flex items-center",
});

// Single parent still works:
const iconButton = tv({ extend: button, base: "gap-2" });
```

Variants, slots, defaults, and compounds are deep-merged. If two recipes share a variant key that
should stay separate, call them individually and join with `cx` / `cn` instead.

## Debugging (experimental)

Enable `debug: true` to log how a recipe resolves classes and which ones were overridden by
`tailwind-merge`. Output appears in the browser console only.

```ts
import { tv } from "tailwind-variants";

const button = tv(
  {
    base: "inline-flex rounded bg-red-500 px-2",
    variants: {
      color: { primary: "bg-blue-600 text-white" },
      size: { sm: "text-sm px-2", lg: "text-lg px-6" },
    },
    defaultVariants: { size: "sm" },
  },
  { debug: true },
);

button({ color: "primary", size: "lg" });
```

In production builds the debug path is fully tree-shaken via `process.env.NODE_ENV` — no logging
code, no overhead, and recipe behavior remains identical. The `/lite` entry does not support debug.

## Utility Functions

| Function  | Behavior                                             |
| --------- | ---------------------------------------------------- |
| `cx`      | Concatenate class names (no merging)                 |
| `cn`      | Concatenate and merge with the default config        |
| `cnMerge` | Concatenate and merge, with optional per-call config |

On `/lite`, `cn` only joins. Use `createCN({ twMerge })` to bind a merger.

```js
import { cx, cn, cnMerge } from "tailwind-variants";

cx("px-2", "px-4"); // => "px-2 px-4"
cn("px-2", "px-4"); // => "px-4"
cnMerge("px-2", "px-4")({ twMerge: false }); // => "px-2 px-4"
```

`cn` follows `clsx` for falsy values: `cn("foo", 0)` is `"foo"`, while a lone `cn(0)` is `"0"`.
`cx` keeps `0` in every position. See the [v3 to v4 migration guide](.docs/migrations/v3-to-v4.md).

These utilities — and `tv()` results, including slot functions — always return a `string`; when no
classes remain, the result is an empty string, matching common class name utilities.

## Documentation

For full documentation, visit [tailwind-variants.org](https://tailwind-variants.org).

## Acknowledgements

- [**cva**](https://github.com/joe-bell/cva) ([Joe Bell](https://github.com/joe-bell))
  This project started as an extension of Joe's work on `cva` — a great tool for generating variants
  for a single element with Tailwind CSS. Big shoutout to [Joe Bell](https://github.com/joe-bell) and
  [contributors](https://github.com/joe-bell/cva/graphs/contributors)! If you don't need the
  **Tailwind Variants** features listed
  [here](https://www.tailwind-variants.org/docs/comparison), we recommend `cva`.

- [**Stitches**](https://stitches.dev/) ([Modulz](https://modulz.app))
  The pioneers of the `variants` API movement. Immense thanks to [Modulz](https://modulz.app) for
  their work on Stitches and the community around it.

- [**shadcn-ui/cn**](https://github.com/shadcn-ui/cn) ([shadcn](https://github.com/shadcn)),
  [**tailwind-merge**](https://github.com/dcastil/tailwind-merge) ([Dany Castillo](https://github.com/dcastil)),
  [**cnfast**](https://github.com/aidenybai/cnfast) ([Aiden Bai](https://github.com/aidenybai)), and
  [**clsx**](https://github.com/lukeed/clsx) ([Luke Edwards](https://github.com/lukeed))
  The merge engine is a snapshot of `cn`, with `tailwind-merge`'s conflict rules, `clsx`'s
  argument semantics, and an argument cache in the spirit of `cnfast`. All four are MIT
  licensed. See [LICENSE](./LICENSE) and the linked repositories.

## Community

We're excited to see the community adopt HeroUI, raise issues, and provide feedback. Whether it's a
feature request, bug report, or a project to showcase, please get involved!

- [Discord](https://discord.gg/9b6yyZKmH4)
- [Twitter](https://twitter.com/getnextui)
- [GitHub Discussions](https://github.com/heroui-inc/tailwind-variants/discussions)

## Contributing

Contributions are always welcome!

- [Contributing guidelines](./CONTRIBUTING.md)
- [Code of conduct](./CODE_OF_CONDUCT.md)
- [Security policy](./SECURITY.md)

## Authors

- Junior Garcia ([@jrgarciadev](https://github.com/jrgarciadev))
- Tianen Pang ([@tianenpang](https://github.com/tianenpang))

## License

Licensed under the [MIT License](./LICENSE).
