/*
 * `tailwind-variants/merge`: the merge utilities without the recipe runtime.
 *
 * This is the alias target for `tailwind-merge` and `clsx` in apps that do
 * not use `tv()`: it ships the compiled default tables, the engine, and the
 * argument cache, nothing else. Everything here is the same instance the
 * default entry uses, so mixing the two entries never creates a second engine.
 */

export type {
  ClassArray,
  ClassDictionary,
  ClassNameArray,
  ClassNameValue,
  CnFunction,
} from "./internal/merge-engine/types.js";
export type {CnOptions, CnReturn} from "./types.js";

export {clsx, clsx as default, cn, twJoin, twMerge} from "./internal/engine-instance.js";
export {cx} from "./utils.js";
