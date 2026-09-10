/*
 * Compile a custom merger config into its own engine. This module pulls in the
 * table compiler and the source default config, so it is only reachable from
 * the `tailwind-variants/config` entry.
 */

import type {Engine} from "../merge-engine/types.js";
import type {AnyConfig, ConfigExtension} from "./types.js";

import {DEFAULT_CACHE_SIZE} from "../engine-instance.js";
import {compileToTables} from "../merge-engine/compiler.js";
import {createEngine} from "../merge-engine/engine.js";

import {getDefaultConfig} from "./default-config.js";
import {mergeConfigs} from "./merge-configs.js";

/** `{ extend, override }`, a `(defaultConfig) => config` function, or a complete config. */
export type CreateMergerConfig =
  | ConfigExtension
  | ((defaultConfig: AnyConfig) => AnyConfig)
  | AnyConfig;

export interface CompiledEngine {
  engine: Engine;
  // Effective whole-string cache size; 0 means every call merges uncached.
  cacheSize: number;
}

let compileCount = 0;

/** @internal Number of table compilations so far (tests assert configs compile once). */
export const getCompileCount = (): number => compileCount;

const isFullConfig = (input: object): input is AnyConfig =>
  "classGroups" in input && "theme" in input && "conflictingClassGroups" in input;

// Resolve any accepted config input into a complete merger config.
const resolveMergerConfig = (config: CreateMergerConfig): AnyConfig => {
  if (typeof config === "function") return config(getDefaultConfig());
  if (isFullConfig(config)) return config;

  return mergeConfigs(getDefaultConfig(), config);
};

// Compile tables for a config and wrap them in an engine.
export const createCompiledEngine = (config: CreateMergerConfig): CompiledEngine => {
  const resolved = resolveMergerConfig(config);
  const cacheSize = resolved.cacheSize ?? DEFAULT_CACHE_SIZE;
  const {tables, validatorImpls, prefix} = compileToTables(resolved);

  compileCount++;

  return {engine: createEngine(tables, validatorImpls, {cacheSize, prefix}), cacheSize};
};
