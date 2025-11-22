import type {CnOptions, CnReturn, TVLite} from "./types.d.ts";

export type * from "./types.d.ts";

// util function
export declare const cx: <T extends CnOptions>(...classes: T) => CnReturn;

export declare const cn: <T extends CnOptions>(...classes: T) => (config?: any) => CnReturn;

// main function
export declare const tv: TVLite;

export declare function createTV(): TVLite;
