import {readFileSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";

import {twMerge} from "tailwind-merge";

import {installReleasedTV} from "./released.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

const readJson = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));

const importDist = async (distPath) => import(pathToFileURL(path.resolve(distPath)).href);
const isTVModule = (module) =>
  typeof module.tv === "function" &&
  typeof module.cx === "function" &&
  typeof module.cnMerge === "function";

export const loadImplementations = async () => {
  const packageJson = readJson(path.join(repoRoot, "package.json"));
  const released = installReleasedTV();
  const tvModule = await importDist(path.join(repoRoot, "dist", "index.js"));
  const releasedModule = await importDist(released.distPath);
  const cvaModule = await import("class-variance-authority");

  if (!isTVModule(tvModule) || !isTVModule(releasedModule)) {
    throw new TypeError("TV benchmark implementations must export tv(), cx(), and cnMerge().");
  }

  return [
    {
      id: "tv",
      kind: "tv",
      label: "tv",
      version: packageJson.version,
      module: tvModule,
    },
    {
      id: "released",
      kind: "tv",
      label: `tv(released-${released.version})`,
      version: released.version,
      module: releasedModule,
    },
    {
      id: "cva",
      kind: "cva",
      label: "cva",
      version: packageJson.devDependencies["class-variance-authority"],
      module: cvaModule,
    },
  ];
};

export const createAdapter = (implementation) => {
  if (implementation.kind === "tv") {
    const {module} = implementation;
    const prepare = (config, options) => () => module.tv(config, options);

    return {
      ...implementation,
      prepare,
      create(config, options) {
        return prepare(config, options)();
      },
      createSlots(config, options) {
        return module.tv(config, options);
      },
      invoke(component, props) {
        return component(props);
      },
      join(inputs) {
        return module.cx(...inputs);
      },
      bindMerge(inputs, config) {
        const merge = module.cnMerge(...inputs);

        return () => merge(config);
      },
    };
  }

  const {cva, cx} = implementation.module;
  const prepare = (config, options = {}) => {
    const {base, ...cvaConfig} = config;

    if (options.twMerge === false) return () => cva(base, cvaConfig);

    return () => {
      const component = cva(base, cvaConfig);

      return (props) => twMerge(component(props));
    };
  };

  return {
    ...implementation,
    prepare,
    create(config, options) {
      return prepare(config, options)();
    },
    invoke(component, props) {
      return component(props);
    },
    join(inputs) {
      return cx(...inputs);
    },
  };
};
