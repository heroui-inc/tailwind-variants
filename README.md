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
- Composition support
- Fully typed
- Framework agnostic
- Built-in conflict resolution
- Tailwind CSS v4 support

## Installation

```bash
npm i tailwind-variants
# or
yarn add tailwind-variants
# or
pnpm add tailwind-variants
```

**Lite mode:** import from `tailwind-variants/lite` for a smaller bundle without conflict resolution.

**Upgrading?**

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

Conflict resolution is built into the default entry — no extra package is required. It is available
on `tv`, `createTV`, `cn`, and `cnMerge` (`cx` and `/lite` do not merge).

```js
import { tv, cn } from "tailwind-variants";

cn("px-2", "px-4"); // => "px-4"

tv({ base: "px-2", variants: { size: { lg: "px-4" } } })({ size: "lg" }); // => "px-4"
```

### Custom configuration

Pass `twMergeConfig` to teach the resolver about custom utilities. Prefer `{ extend, override }` —
`extend` appends to the defaults, `override` replaces them:

```ts
import { cnMerge, createTV, tv, type TWMergeConfig } from "tailwind-variants";

const twMergeConfig = {
  extend: {
    classGroups: {
      elevation: ["elevation-low", "elevation-high"],
    },
  },
} satisfies TWMergeConfig;

tv({ base: "elevation-low", variants: { raised: { true: "elevation-high" } } }, { twMergeConfig });
createTV({ twMergeConfig });
cnMerge("elevation-low", "elevation-high")({ twMergeConfig }); // => "elevation-high"
```

Disable merging with `{ twMerge: false }` on `tv`, `createTV`, or `cnMerge`.

### Reusing a `tailwind-merge` config

If you already configure `extendTailwindMerge`, reuse the same config object as `twMergeConfig`
(pass the object — not the returned merge function):

```ts
import { extendTailwindMerge } from "tailwind-merge";
import { createTV, type TWMergeConfig } from "tailwind-variants";

const mergeConfig = {
  extend: {
    classGroups: {
      elevation: ["elevation-low", "elevation-high"],
    },
  },
} satisfies TWMergeConfig;

extendTailwindMerge(mergeConfig);
createTV({ twMergeConfig: mergeConfig });
```

For `createTailwindMerge`, move the custom parts of the factory into `{ extend, override }` and pass
that object. Merge functions and full default configs cannot be passed directly.

## Utility Functions

| Function  | Behavior                                             |
| --------- | ---------------------------------------------------- |
| `cx`      | Concatenate class names (no merging)                 |
| `cn`      | Concatenate and merge with the default config        |
| `cnMerge` | Concatenate and merge, with optional per-call config |

```js
import { cx, cn, cnMerge } from "tailwind-variants";

cx("px-2", "px-4"); // => "px-2 px-4"
cn("px-2", "px-4"); // => "px-4"
cnMerge("px-2", "px-4")({ twMerge: false }); // => "px-2 px-4"
```

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

- [**tailwind-merge**](https://github.com/dcastil/tailwind-merge), [**clsx**](https://github.com/lukeed/clsx), and [**cnfast**](https://github.com/aidenybai/cnfast)
  Conflict resolution draws on ideas and MIT-licensed work from these projects.

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

Licensed under the MIT License. See [LICENSE](./LICENSE.md) for more information.
