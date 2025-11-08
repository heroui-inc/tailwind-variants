import {cx} from "./utils.js";
import {getTailwindVariants} from "./core.js";
import {defaultConfig} from "./config.js";

export const cnAdapter = (...classnames) => {
  return (_config) => {
    const base = cx(classnames);

    return base || undefined;
  };
};

export const {createTV, tv} = getTailwindVariants(cnAdapter);

export {cnAdapter as cn, cx, defaultConfig};
