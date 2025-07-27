export const falsyToString = (value) =>
  value === false ? "false" : value === true ? "true" : value === 0 ? "0" : value;

export const isEmptyObject = (obj) => {
  if (!obj || typeof obj !== "object") return true;
  for (const _ in obj) return false;

  return true;
};

export const isEqual = (obj1, obj2) => {
  if (obj1 === obj2) return true;
  if (!obj1 || !obj2) return false;

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (let i = 0; i < keys1.length; i++) {
    const key = keys1[i];

    if (!keys2.includes(key)) return false;
    if (obj1[key] !== obj2[key]) return false;
  }

  return true;
};

export const isBoolean = (value) => value === true || value === false;

function flat(arr, target) {
  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];

    if (Array.isArray(el)) flat(el, target);
    else target.push(el);
  }
}

export function flatArray(arr) {
  const flattened = [];

  flat(arr, flattened);

  return flattened;
}

export const flatMergeArrays = (...arrays) => {
  const result = [];

  flat(arrays, result);
  const filtered = [];

  for (let i = 0; i < result.length; i++) {
    if (result[i]) filtered.push(result[i]);
  }

  return filtered;
};

export const mergeObjects = (obj1, obj2) => {
  const result = {};

  for (const key in obj1) {
    const val1 = obj1[key];

    if (key in obj2) {
      const val2 = obj2[key];

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

  for (const key in obj2) {
    if (!(key in obj1)) {
      result[key] = obj2[key];
    }
  }

  return result;
};

const SPACE_REGEX = /\s+/g;

export const removeExtraSpaces = (str) => {
  if (!str || typeof str !== "string") return str;

  return str.replace(SPACE_REGEX, " ").trim();
};
