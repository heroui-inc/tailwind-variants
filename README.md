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
- Automatic conflict resolution
- Tailwindcss V4 support

## Documentation

For full documentation, visit [tailwind-variants.org](https://tailwind-variants.org)

> ❕ Note: `Tailwindcss V4` no longer supports the `config.content.transform` so we remove the `responsive variants` feature
>
> If you want to use `responsive variants`, you need to add it manually to your classname.

## Quick Start

1. Installation:
   To use Tailwind Variants in your project, you can install it as a dependency:

```bash
yarn add tailwind-variants
# or
npm i tailwind-variants
# or
pnpm add tailwind-variants
```

**Optional:** If you want automatic conflict resolution, also install `tailwind-merge`:

```bash
yarn add tailwind-merge
# or
npm i tailwind-merge
# or
pnpm add tailwind-merge
```

> **⚠️ Compatibility Note:** Supports Tailwind CSS v4.x (requires `tailwind-merge` v3.x). If you use Tailwind CSS v3.x, use tailwind-variants v0.x with [tailwind-merge v2.6.0](https://github.com/dcastil/tailwind-merge/tree/v2.6.0).

> **💡 Lite mode (v3):** For smaller bundle size and faster runtime without conflict resolution, use the `/lite` import:
>
> ```js
> import {tv} from "tailwind-variants/lite";
> ```

> **⚠️ Upgrading?**
>
> - From v2 to v3: See the [v3 migration guide](./MIGRATION-V3.md)
> - From v1 to v2: See the [v2 migration guide](./MIGRATION-V2.md)

2. Usage:

```js
import {tv} from "tailwind-variants";

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

return <button className={button({size: "sm", color: "secondary"})}>Click me</button>;
```

## Utility Functions

Tailwind Variants provides several utility functions for combining and merging class names:

### `cx` - Simple Concatenation

Combines class names without merging conflicting classes (similar to `clsx`):

```js
import {cx} from "tailwind-variants";

cx("text-xl", "font-bold"); // => "text-xl font-bold"
cx("px-2", "px-4"); // => "px-2 px-4" (no merging)
```

### `cn` - Merge with Default Config

> **Updated in v3.2.2** - Now returns a string directly (no function call needed)

Combines class names and merges conflicting Tailwind CSS classes using the default `tailwind-merge` config. Returns a string directly:

```js
import {cn} from "tailwind-variants";

cn("bg-red-500", "bg-blue-500"); // => "bg-blue-500"
cn("px-2", "px-4", "py-2"); // => "px-4 py-2"
```

### `cnMerge` - Merge with Custom Config

> **Available from v3.2.2**

Combines class names and merges conflicting Tailwind CSS classes with support for custom `twMerge` configuration via a second function call:

```js
import {cnMerge} from "tailwind-variants";

// Disable merging
cnMerge("px-2", "px-4")({twMerge: false}) // => "px-2 px-4"

// Enable merging explicitly
cnMerge("bg-red-500", "bg-blue-500")({twMerge: true}) // => "bg-blue-500"

// Use custom twMergeConfig
cnMerge("px-2", "px-4")({twMergeConfig: {...}}) // => merged with custom config
```

**When to use which:**

- Use `cx` when you want simple concatenation without any merging
- Use `cn` for most cases when you want automatic conflict resolution with default settings
- Use `cnMerge` when you need to customize the merge behavior (disable merging, custom config, etc.)

## Acknowledgements

- [**cva**](https://github.com/joe-bell/cva) ([Joe Bell](https://github.com/joe-bell))
  This project as started as an extension of Joe's work on `cva` – a great tool for generating variants for a single element with Tailwind CSS. Big shoutout to [Joe Bell](https://github.com/joe-bell) and [contributors](https://github.com/joe-bell/cva/graphs/contributors) you guys rock! 🤘 - we recommend to use `cva` if don't need any of the **Tailwind Variants** features listed [here](https://www.tailwind-variants.org/docs/comparison).

- [**Stitches**](https://stitches.dev/) ([Modulz](https://modulz.app))  
  The pioneers of the `variants` API movement. Inmense thanks to [Modulz](https://modulz.app) for their work on Stitches and the community around it. 🙏

## Community

We're excited to see the community adopt HeroUI, raise issues, and provide feedback. Whether it's a feature request, bug report, or a project to showcase, please get involved!

- [Discord](https://discord.gg/9b6yyZKmH4)
- [Twitter](https://twitter.com/getnextui)
- [GitHub Discussions](https://github.com/heroui-inc/tailwind-variants/discussions)

## Contributing

Contributions are always welcome!

Please follow our [contributing guidelines](./CONTRIBUTING.md).

Please adhere to this project's [CODE_OF_CONDUCT](./CODE_OF_CONDUCT.md).

## Authors

- Junior garcia ([@jrgarciadev](https://github.com/jrgaciadev))
- Tianen Pang ([@tianenpang](https://github.com/tianenpang))

## License

Licensed under the MIT License.

See [LICENSE](./LICENSE.md) for more information.
