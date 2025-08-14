const config = {
  rootDir: "src",
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.json",
    },
  },
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
  setupFilesAfterEnv: ["<rootDir>/../setupTests.ts"],
  extensionsToTreatAsEsm: [".ts"],
};

export default config;
