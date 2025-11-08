import type {CnOptions, CnReturn} from "./types.d.ts";

export declare const falsyToString: <T>(value: T) => T | string;

export declare const isEmptyObject: (obj: unknown) => boolean;

export declare const flatArray: <T>(array: unknown[]) => T[];

export declare const flatMergeArrays: <T>(...arrays: unknown[][]) => T[];

export declare const mergeObjects: <T extends object, U extends object>(
  obj1: T,
  obj2: U,
) => Record<string, unknown>;

export declare const removeExtraSpaces: (str: string) => string;

export declare const isEqual: (obj1: object, obj2: object) => boolean;

export declare const isBoolean: (value: unknown) => boolean;

export declare const joinObjects: <
  T extends Record<string, unknown>,
  U extends Record<string, unknown>,
>(
  obj1: T,
  obj2: U,
) => T & U;

export declare const flat: <T>(arr: unknown[], target: T[]) => void;

export declare const cx: <T extends CnOptions>(...classes: T) => CnReturn;
