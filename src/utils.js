import {createDefu} from "defu";

export const falsyToString = (value) =>
  typeof value === "boolean" ? `${value}` : value === 0 ? "0" : value;

export const isEmptyObject = (obj) =>
  !obj || typeof obj !== "object" || Object.keys(obj).length === 0;

export const isEqual = (obj1, obj2) => JSON.stringify(obj1) === JSON.stringify(obj2);

export const isBoolean = (value) => typeof value === "boolean";

function flat(arr, target) {
  arr.forEach(function (el) {
    if (Array.isArray(el)) flat(el, target);
    else target.push(el);
  });
}

export function flatArray(arr) {
  const flattened = [];

  flat(arr, flattened);

  return flattened;
}

export const flatMergeArrays = (...arrays) => flatArray(arrays).filter(Boolean);

export const mergeObjects = createDefu((obj, key, value) => {
  if (typeof obj[key] === "string" && typeof value === "string") {
    obj[key] += " " + value;

    return true;
  }

  if (Array.isArray(obj[key]) || Array.isArray(value)) {
    obj[key] = flatMergeArrays(obj[key], value);

    return true;
  }

  if (typeof obj[key] === "object" && typeof value === "object") {
    obj[key] = mergeObjects(obj[key], value);

    return true;
  }
});

export const mergeOptions = createDefu((obj, key, value) => {
  if (
    ["compoundSlots", "compoundVariants"].includes(key) &&
    Array.isArray(value) &&
    Array.isArray(obj[key])
  ) {
    obj[key] = value;

    return true;
  }
});

export const removeExtraSpaces = (str) => {
  if (!str || typeof str !== "string") {
    return str;
  }

  return str.replace(/\s+/g, " ").trim();
};
