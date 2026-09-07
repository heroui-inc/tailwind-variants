/*
 * The one default engine of the package: the checked-in compiled tables, the
 * `wrapClsx` argument cache, and the tailwind-merge / clsx shaped exports.
 * Every entry that merges with the default tables imports from here, so an
 * app holds a single engine instance no matter how many entries it uses.
 */

import type {CnFunction, Engine} from "./merge-engine/types.js";

import {clsx, createEngine, twJoin, wrapClsx} from "./merge-engine/engine.js";
import tables from "./merge-engine/tables.generated.js";

// Whole-string cache capacity of the default engine.
export const DEFAULT_CACHE_SIZE = 8192;

export const engine: Engine = /* @__PURE__ */ createEngine(tables, undefined, {
  cacheSize: DEFAULT_CACHE_SIZE,
});

/**
 * Merge Tailwind classes with clsx-style arguments (strings, arrays, objects,
 * conditionals). Repeated calls with the same string instances are answered
 * from an argument-identity cache without joining or merging again.
 */
export const cn: CnFunction = /* @__PURE__ */ wrapClsx(engine.mergeString, engine);

/** tailwind-merge compatible variadic merge (strings and nested arrays). */
export const twMerge = engine.merge;

export {clsx, twJoin};
