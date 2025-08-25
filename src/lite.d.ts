import {CnOptions, CnReturn, TVLite} from "./types";

export * from "./types";

// util function
export declare const cnBase: <T extends CnOptions>(...classes: T) => CnReturn;

export declare const cn: <T extends CnOptions>(...classes: T) => CnReturn;

// main function
export declare const tv: TVLite;

export declare function createTV(): TVLite;
