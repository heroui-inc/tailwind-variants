import {TVConfig, TWMConfig, TWMergeConfig} from "./config";
import {CnOptions, CnReturn, TV} from "./types";

export * from "./types";

// util function
export declare const cnBase: <T extends CnOptions>(...classes: T) => CnReturn;

export declare const cn: <T extends CnOptions>(...classes: T) => (config?: TWMConfig) => CnReturn;

// main function
export declare const tv: TV;

export declare function createTV(config: TVConfig): TV;

// types
export type {TVConfig, TWMConfig, TWMergeConfig};
