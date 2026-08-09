import type {TVConfig} from "./config.js";
import type {CnAdapter} from "./internal/types.js";
import type {CnOptions, CnReturn, TVLite} from "./types.js";

import {defaultConfig as runtimeDefaultConfig} from "./internal/default-config.js";
import {getTailwindVariants} from "./internal/tv.js";
import {cx} from "./utils.js";

export type * from "./types.js";

export const cn = <T extends CnOptions>(...classnames: T): ((config?: any) => CnReturn) => {
  return (_config?: TVConfig) => cx(classnames);
};

/** @internal */
export const cnAdapter = cn;

const classAdapter: CnAdapter = (_config, ...classnames) => cx(classnames);

const runtime = getTailwindVariants(classAdapter);

export const tv = runtime.tv as TVLite;
export const createTV = runtime.createTV as () => TVLite;

/** @internal */
export const defaultConfig = runtimeDefaultConfig;

export {cx};
