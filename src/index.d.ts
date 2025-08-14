import {TVConfig, TWMConfig} from "./config";
import {CnOptions, CnReturn, TV} from "./types";

export * from "./types";

export declare const cnBase: <T extends CnOptions>(...classes: T) => CnReturn;

export declare const cn: <T extends CnOptions>(...classes: T) => (config?: TWMConfig) => CnReturn;

// main function
export declare const tv: TV;

export declare function createTV(config: TVConfig): TV;
