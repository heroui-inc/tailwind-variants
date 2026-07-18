import type {CnOptions, CnReturn} from "./types.js";

const SPACE_REGEX = /\s+/g;

export const removeExtraSpaces = (str: string): string => {
  if (typeof str !== "string" || !str) return str;

  return str.replace(SPACE_REGEX, " ").trim();
};

export const cx = <T extends CnOptions>(...classnames: T): CnReturn => {
  const classList: string[] = [];

  const buildClassString = (input: any): void => {
    if (!input && input !== 0 && input !== 0n) return;

    if (Array.isArray(input)) {
      for (let i = 0, len = input.length; i < len; i++) buildClassString(input[i]);

      return;
    }

    const type = typeof input;

    if (type === "string" || type === "number" || type === "bigint") {
      if (type === "number" && input !== input) return;
      classList.push(String(input));
    } else if (type === "object") {
      const keys = Object.keys(input);

      for (let i = 0, len = keys.length; i < len; i++) {
        const key = keys[i];

        if (input[key]) classList.push(key);
      }
    }
  };

  for (let i = 0, len = classnames.length; i < len; i++) {
    const c = classnames[i];

    if (typeof c === "string") {
      if (c) classList.push(c);
    } else if (c !== null && c !== undefined) {
      buildClassString(c);
    }
  }

  return classList.length > 0 ? removeExtraSpaces(classList.join(" ")) : undefined;
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
    if (Object.prototype.hasOwnProperty.call(obj2, key)) {
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

    if (Array.isArray(el)) flat(el, target);
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

      if (Array.isArray(val1) || Array.isArray(val2)) {
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
