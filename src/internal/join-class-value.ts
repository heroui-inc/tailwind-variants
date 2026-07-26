/*
 * Class-value join (clsx-style). No merge dependencies.
 *
 * @see https://github.com/lukeed/clsx
 * @see https://github.com/lukeed/clsx/blob/master/license
 */

export interface ClassDictionary {
  [className: string]: any;
}

export type JoinClassValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | JoinClassValue[]
  | ClassDictionary;

const isArray = Array.isArray;

/** Join class values into a single space-separated string. */
export const joinClassValue = (value: JoinClassValue): string => {
  if (!value && value !== 0 && value !== 0n) return "";

  if (typeof value === "string") return value;

  if (typeof value === "number") {
    if (value !== value) return "";

    return "" + value;
  }

  if (typeof value === "bigint") return "" + value;

  let result = "";

  if (isArray(value)) {
    const length = value.length;

    for (let index = 0; index < length; index++) {
      const item = value[index];

      if (!item && item !== 0 && item !== 0n) continue;

      const resolved = typeof item === "string" ? item : joinClassValue(item);

      if (resolved) {
        if (result) result += " ";
        result += resolved;
      }
    }

    return result;
  }

  if (typeof value === "object") {
    for (const key in value) {
      if (value[key]) {
        if (result) result += " ";
        result += key;
      }
    }
  }

  return result;
};
