import {buildSync} from "esbuild";
import {twMerge} from "tailwind-merge";

import {probeTvCapabilities} from "./capabilities.mjs";
import {installLatestCn, installLatestCVA, installReleasedTV} from "./released.mjs";
import {existsSync, readFileSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {gzipSync} from "node:zlib";

const repoRoot = path.resolve(import.meta.dirname, "..");

const readJson = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));

const importDist = async (distPath) => import(pathToFileURL(path.resolve(distPath)).href);
const isTVModule = (module) =>
  typeof module.tv === "function" &&
  typeof module.cx === "function" &&
  typeof module.cn === "function" &&
  typeof module.cnMerge === "function";
const isCVAModule = (module) => typeof module.cva === "function" && typeof module.cx === "function";
const isCnModule = (module) =>
  typeof module.clsx === "function" &&
  typeof module.cn === "function" &&
  typeof module.twJoin === "function" &&
  typeof module.twMerge === "function";

// min+gzip size of a built entry, bundled the way an app bundler would see it.
// Printed with every run so the default entry cannot grow back unnoticed.
const measureEntrySize = (entryPath) => {
  const {contents} = buildSync({
    entryPoints: [entryPath],
    bundle: true,
    minify: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2020",
    define: {"process.env.NODE_ENV": '"production"'},
    logLevel: "silent",
  }).outputFiles[0];

  return {minified: contents.length, gzip: gzipSync(contents).length};
};

// Import the custom-config entry when the build has one (released 3.3.1 does not).
const importOptionalDist = async (distPath) =>
  existsSync(distPath) ? importDist(distPath) : undefined;

export const loadImplementations = async () => {
  const packageJson = readJson(path.join(repoRoot, "package.json"));
  const released = installReleasedTV();
  const cva = installLatestCVA();
  const cn = installLatestCn();
  const tvDistPath = path.join(repoRoot, "dist", "index.js");
  const tvModule = await importDist(tvDistPath);
  const tvConfigModule = await importOptionalDist(path.join(repoRoot, "dist", "config-entry.js"));
  const tvLiteModule = await importOptionalDist(path.join(repoRoot, "dist", "lite.js"));
  const tvMergeModule = await importOptionalDist(path.join(repoRoot, "dist", "merge-entry.js"));
  const releasedModule = await importDist(released.distPath);
  const releasedConfigModule = await importOptionalDist(
    path.join(path.dirname(released.distPath), "config-entry.js"),
  );
  const releasedLiteModule = await importOptionalDist(
    path.join(path.dirname(released.distPath), "lite.js"),
  );
  const cvaModule = await importDist(cva.entryPath);
  const cnModule = await importDist(cn.entryPath);

  if (!isTVModule(tvModule) || !isTVModule(releasedModule)) {
    throw new TypeError(
      "TV benchmark implementations must export tv(), cx(), cn(), and cnMerge().",
    );
  }

  if (!isCVAModule(cvaModule)) {
    throw new TypeError("CVA benchmark implementation must export cva() and cx().");
  }

  if (!isCnModule(cnModule)) {
    throw new TypeError("cn must export clsx(), cn(), twJoin(), and twMerge().");
  }

  const variants = [
    {
      id: "tv",
      kind: "tv",
      label: "tv",
      version: packageJson.version,
      capabilities: probeTvCapabilities(tvModule, tvLiteModule),
      module: tvModule,
      configModule: tvConfigModule,
      liteModule: tvLiteModule,
      mergeModule: tvMergeModule,
      entrySize: measureEntrySize(tvDistPath),
    },
    {
      id: "released",
      kind: "tv",
      label: `tv(released-${released.version})`,
      version: released.version,
      capabilities: probeTvCapabilities(releasedModule, releasedLiteModule),
      module: releasedModule,
      configModule: releasedConfigModule,
      liteModule: releasedLiteModule,
      mergeModule: undefined,
      entrySize: measureEntrySize(released.distPath),
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
      id: "cn",
      kind: "cn",
      label: `cn(${cn.version})`,
      version: cn.version,
      module: cnModule,
    },
  ];

  return {variants, utilities};
};

export const createAdapter = (implementation) => {
  if (implementation.kind === "tv") {
    const {module, configModule, liteModule, mergeModule} = implementation;
    // A twMergeConfig needs the table compiler, which lives on the config
    // entry when the build has one; older builds serve it from the default entry.
    const tvFor = (options) =>
      options?.twMergeConfig && configModule?.tv ? configModule.tv : module.tv;
    const prepare = (config, options) => () => tvFor(options)(config, options);
    // Lite recipe with this build's own twMerge injected; only builds whose
    // lite entry calls the function get a value here (see capabilities.mjs).
    const liteTV =
      implementation.capabilities?.liteInject && liteModule && mergeModule
        ? liteModule.createTV({twMerge: mergeModule.twMerge})
        : undefined;

    return {
      ...implementation,
      prepare,
      create(config, options) {
        return prepare(config, options)();
      },
      createSlots(config, options) {
        return tvFor(options)(config, options);
      },
      createLite: liteTV ? (config) => liteTV(config) : undefined,
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
    const {cx, cn, cnMerge, twJoin, twMerge: tvTwMerge} = implementation.module;

    return {
      ...implementation,
      joinMixed(inputs) {
        return cx(...inputs);
      },
      joinTokens(inputs) {
        return cx(...inputs);
      },
      // Released 3.3.1 has no twJoin / twMerge; those rows show "—" for it.
      joinDirect: twJoin ? (inputs) => twJoin(...inputs) : undefined,
      mergeDirect: tvTwMerge ? (inputs) => tvTwMerge(...inputs) : undefined,
      merge(inputs) {
        return cn(...inputs);
      },
      mergeArgs(first, second, third) {
        return cn(first, second, third);
      },
      mergeCurried(inputs, config) {
        const merge = cnMerge(...inputs);

        return () => merge(config);
      },
    };
  }

  const {clsx, cn, twJoin, twMerge: cnTwMerge} = implementation.module;

  return {
    ...implementation,
    joinMixed(inputs) {
      return clsx(...inputs);
    },
    joinTokens(inputs) {
      return twJoin(...inputs);
    },
    joinDirect(inputs) {
      return twJoin(...inputs);
    },
    merge(inputs) {
      return cn(...inputs);
    },
    mergeArgs(first, second, third) {
      return cn(first, second, third);
    },
    mergeDirect(inputs) {
      return cnTwMerge(...inputs);
    },
  };
};
