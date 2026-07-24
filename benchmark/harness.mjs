import {readFileSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";

import {twMerge} from "tailwind-merge";

import {installLatestCnfast, installLatestCVA, installReleasedTV} from "./released.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

const readJson = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));

const importDist = async (distPath) => import(pathToFileURL(path.resolve(distPath)).href);
const isTVModule = (module) =>
  typeof module.tv === "function" &&
  typeof module.cx === "function" &&
  typeof module.cn === "function" &&
  typeof module.cnMerge === "function";
const isCVAModule = (module) => typeof module.cva === "function" && typeof module.cx === "function";
const isCnfastModule = (module) =>
  typeof module.clsx === "function" &&
  typeof module.cn === "function" &&
  typeof module.twJoin === "function" &&
  typeof module.twMerge === "function";

export const loadImplementations = async () => {
  const packageJson = readJson(path.join(repoRoot, "package.json"));
  const released = installReleasedTV();
  const cva = installLatestCVA();
  const cnfast = installLatestCnfast();
  const tvModule = await importDist(path.join(repoRoot, "dist", "index.js"));
  const releasedModule = await importDist(released.distPath);
  const cvaModule = await importDist(cva.entryPath);
  const cnfastModule = await importDist(cnfast.entryPath);

  if (!isTVModule(tvModule) || !isTVModule(releasedModule)) {
    throw new TypeError(
      "TV benchmark implementations must export tv(), cx(), cn(), and cnMerge().",
    );
  }

  if (!isCVAModule(cvaModule)) {
    throw new TypeError("CVA benchmark implementation must export cva() and cx().");
  }

  if (!isCnfastModule(cnfastModule)) {
    throw new TypeError("cnfast must export clsx(), cn(), twJoin(), and twMerge().");
  }

  const variants = [
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
      label: `cva(${cva.version})`,
      version: cva.version,
      module: cvaModule,
    },
  ];

  const utilities = [
    {
      id: "tv",
      kind: "tv-utils",
      label: "tv",
      version: packageJson.version,
      module: tvModule,
    },
    {
      id: "released",
      kind: "tv-utils",
      label: `tv(released-${released.version})`,
      version: released.version,
      module: releasedModule,
    },
    {
      id: "cnfast",
      kind: "cnfast",
      label: `cnfast(${cnfast.version})`,
      version: cnfast.version,
      module: cnfastModule,
    },
  ];

  return {variants, utilities};
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

export const createUtilityAdapter = (implementation) => {
  if (implementation.kind === "tv-utils") {
    const {cx, cn, cnMerge} = implementation.module;

    return {
      ...implementation,
      joinMixed(inputs) {
        return cx(...inputs);
      },
      joinTokens(inputs) {
        return cx(...inputs);
      },
      merge(inputs) {
        return cn(...inputs);
      },
      mergeCurried(inputs, config) {
        const merge = cnMerge(...inputs);

        return () => merge(config);
      },
    };
  }

  const {clsx, cn, twJoin, twMerge: cnfastTwMerge} = implementation.module;

  return {
    ...implementation,
    joinMixed(inputs) {
      return clsx(...inputs);
    },
    joinTokens(inputs) {
      return twJoin(...inputs);
    },
    merge(inputs) {
      return cn(...inputs);
    },
    mergeDirect(inputs) {
      return cnfastTwMerge(...inputs);
    },
  };
};
