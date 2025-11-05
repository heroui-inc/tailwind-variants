import {defineConfig} from "tsup";

export default defineConfig({
  entry: ["src/index.js", "src/lite.js", "src/utils.js"],
  format: ["cjs", "esm"],
  dts: false,
  clean: true,
  minify: true,
  treeshake: true,
  splitting: true,
  external: ["tailwind-merge"],
});
