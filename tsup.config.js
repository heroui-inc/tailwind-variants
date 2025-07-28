import {defineConfig} from "tsup";

export default defineConfig({
  entry: ["src/index.js", "src/utils.js", "src/cn.js"],
  format: ["cjs", "esm"],
  dts: false,
  clean: true,
  minify: true,
  treeshake: true,
  splitting: true,
  external: ["tailwind-merge"],
});
