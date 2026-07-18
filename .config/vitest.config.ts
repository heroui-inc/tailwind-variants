import {fileURLToPath} from "node:url";

import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: [fileURLToPath(new URL("./setup-tests.ts", import.meta.url))],
  },
});
