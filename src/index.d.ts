import type {TVConfig, TWMConfig, TWMergeConfig} from "./config.d.ts";
import type {CnOptions, CnReturn, TV} from "./types.d.ts";

export type * from "./types.d.ts";

// util function
export declare const cnBase: <T extends CnOptions>(...classes: T) => CnReturn;

export declare const cn: <T extends CnOptions>(...classes: T) => (config?: TWMConfig) => CnReturn;

// main function
export declare const tv: TV;

export declare function createTV(config: TVConfig): TV;

// types
export type {TVConfig, TWMConfig, TWMergeConfig};
