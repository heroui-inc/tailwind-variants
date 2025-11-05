import {cn as cnBase} from "./utils.js";
import {getTailwindVariants} from "./core.js";
import {defaultConfig} from "./config.js";

export const cnAdapter = (...classnames) => {
  return (_config) => {
    const base = cnBase(classnames);

    return base || undefined;
  };
};

export const {createTV, tv} = getTailwindVariants(cnAdapter);

export {cnBase as cn, cnBase, defaultConfig};
