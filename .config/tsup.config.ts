import {defineConfig} from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/lite.ts", "src/utils.ts", "src/types.ts", "src/config.ts"],
  format: ["cjs", "esm"],
  target: "node16",
  dts: true,
  tsconfig: "tsconfig.json",
  clean: true,
  minify: false,
  treeshake: true,
  splitting: true,
  external: ["tailwind-merge"],
});
