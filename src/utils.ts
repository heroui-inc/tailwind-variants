import {type JoinClassValue, joinClassValue} from "./internal/join-class-value.js";
import type {CnOptions, CnReturn} from "./types.js";

const SPACE_REGEX = /\s+/g;
const isArray = Array.isArray;

export const removeExtraSpaces = (str: string): string => {
  if (typeof str !== "string" || !str) return str;

  return str.replace(SPACE_REGEX, " ").trim();
};

/** Dirty leading/trailing/doubled/non-space whitespace on the final joined string. */
const stringNeedsNormalize = (str: string): boolean => {
  const len = str.length;

  if (len === 0) return false;

  const first = str.charCodeAt(0);
  const last = str.charCodeAt(len - 1);

  if (
    first === 32 ||
    last === 32 ||
    (first >= 9 && first <= 13) ||
    first === 160 ||
    (last >= 9 && last <= 13) ||
    last === 160
  ) {
    return true;
  }

  for (let i = 0; i < len; i++) {
    const code = str.charCodeAt(i);

    if ((code >= 9 && code <= 13) || code === 160) return true;
    if (code === 32 && i + 1 < len && str.charCodeAt(i + 1) === 32) return true;
  }

  return false;
};

export const cx = <T extends CnOptions>(...classnames: T): CnReturn => {
  const result = joinClassValue(classnames as JoinClassValue[]);

  if (!result) return undefined;

  return stringNeedsNormalize(result) ? removeExtraSpaces(result) : result;
};

export const falsyToString = <T>(value: T): T | string =>
  value === false ? "false" : value === true ? "true" : value === 0 ? "0" : value;

export const isEmptyObject = (obj: unknown): boolean => {
  if (!obj || typeof obj !== "object") return true;
  for (const _ in obj) return false;

  return true;
};

export const isEqual = (obj1: object, obj2: object): boolean => {
  if (obj1 === obj2) return true;
  if (!obj1 || !obj2) return false;

  const record1 = obj1 as Record<string, unknown>;
  const record2 = obj2 as Record<string, unknown>;
  const keys1 = Object.keys(record1);
  const keys2 = Object.keys(record2);

  if (keys1.length !== keys2.length) return false;

  for (let i = 0; i < keys1.length; i++) {
    const key = keys1[i];

    if (!keys2.includes(key)) return false;
    if (record1[key] !== record2[key]) return false;
  }

  return true;
};

export const isBoolean = (value: unknown): boolean => value === true || value === false;

export const joinObjects = <T extends Record<string, unknown>, U extends Record<string, unknown>>(
  obj1: T,
  obj2: U,
): T & U => {
  const target = obj1 as Record<string, any>;

  for (const key in obj2) {
    if (Object.hasOwn(obj2, key)) {
      const val2 = obj2[key];

      if (key in target) {
        target[key] = cx(target[key], val2 as any);
      } else {
        target[key] = val2;
      }
    }
  }

  return obj1 as T & U;
};

export const flat = <T>(arr: unknown[], target: T[]): void => {
  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];

    if (isArray(el)) flat(el, target);
    else if (el) target.push(el as T);
  }
};

export function flatArray<T>(arr: unknown[]): T[] {
  const flattened: T[] = [];

  flat(arr, flattened);

  return flattened;
}

export const flatMergeArrays = <T>(...arrays: unknown[][]): T[] => {
  const result: T[] = [];

  flat(arrays, result);
  const filtered: T[] = [];

  for (let i = 0; i < result.length; i++) {
    if (result[i]) filtered.push(result[i]);
  }

  return filtered;
};

export const mergeObjects = <T extends object, U extends object>(
  obj1: T,
  obj2: U,
): Record<string, unknown> => {
  const record1 = obj1 as Record<string, any>;
  const record2 = obj2 as Record<string, any>;
  const result: Record<string, any> = {};

  for (const key in record1) {
    const val1 = record1[key];

    if (key in record2) {
      const val2 = record2[key];

      if (isArray(val1) || isArray(val2)) {
        result[key] = flatMergeArrays(val2, val1);
      } else if (typeof val1 === "object" && typeof val2 === "object" && val1 && val2) {
        result[key] = mergeObjects(val1, val2);
      } else {
        result[key] = val2 + " " + val1;
      }
    } else {
      result[key] = val1;
    }
  }

  for (const key in record2) {
    if (!(key in record1)) {
      result[key] = record2[key];
    }
  }

  return result;
};
