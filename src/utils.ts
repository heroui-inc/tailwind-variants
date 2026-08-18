import type {JoinClassValue} from "./internal/join-class-value.js";
import type {CnOptions, CnReturn} from "./types.js";

import {joinClassValue} from "./internal/join-class-value.js";

const SPACE_REGEX = /\s+/g;
const isArray = Array.isArray;

export const removeExtraSpaces = (str: string): string => {
  if (typeof str !== "string" || !str) return str;

  return str.replace(SPACE_REGEX, " ").trim();
};

// Doubled spaces, or a tab..carriage-return / NBSP character anywhere.
const NON_NORMAL_WHITESPACE = / {2}|[\t-\r\u00a0]/;

/** True when the joined string has leading, trailing, doubled, or non-space whitespace. */
const stringNeedsNormalize = (str: string): boolean => {
  const len = str.length;

  if (len === 0) return false;

  // The compiled regex scan beats a charCodeAt loop; edge spaces are cheaper
  // to check directly than to fold into the pattern.
  return (
    str.charCodeAt(0) === 32 || str.charCodeAt(len - 1) === 32 || NON_NORMAL_WHITESPACE.test(str)
  );
};

/**
 * Join class values. `function` + `arguments` so V8 does not allocate a rest
 * array. String/falsy args stay on a twJoin-shaped loop; objects and arrays
 * fall through. Normalize once on the joined result.
 */
export const cx = function cx(): CnReturn {
  const length = arguments.length;
  let result = "";
  let index = 0;

  for (; index < length; index++) {
    const item = arguments[index];

    if (!item && item !== 0 && item !== 0n) continue;
    if (typeof item !== "string") break;

    if (result) result += " ";
    result += item;
  }

  for (; index < length; index++) {
    const item = arguments[index] as JoinClassValue;

    if (!item && item !== 0 && item !== 0n) continue;

    const resolved = typeof item === "string" ? item : joinClassValue(item);

    if (resolved) {
      if (result) result += " ";
      result += resolved;
    }
  }

  if (!result) return "";

  return stringNeedsNormalize(result) ? removeExtraSpaces(result) : result;
} as <T extends CnOptions>(...classnames: T) => CnReturn;

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

    if (!Object.hasOwn(record2, key)) return false;
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
  // `flat` already drops falsy elements, so the result needs no second pass.
  const result: T[] = [];

  flat(arrays, result);

  return result;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !isArray(value);

/**
 * Deep-merges variant/slot maps. Call sites pass the child as `obj1` and the
 * parent as `obj2`.
 *
 * When one side is a class string and the other a slot object, the string is
 * folded into `{base: string}` so composing with slots does not produce
 * `"[object Object]"`.
 */
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
      } else if (isPlainObject(val1) && isPlainObject(val2)) {
        result[key] = mergeObjects(val1, val2);
      } else if (isPlainObject(val1) && typeof val2 === "string") {
        // Child is a slot object, parent is a string: fold the parent into base.
        result[key] = mergeObjects(val1, {base: val2});
      } else if (typeof val1 === "string" && isPlainObject(val2)) {
        // Child is a string, parent is a slot object: fold the child into base.
        result[key] = mergeObjects({base: val1}, val2);
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
