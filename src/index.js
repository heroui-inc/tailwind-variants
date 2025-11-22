import {getTailwindVariants} from "./core.js";
import {cn, cnMerge} from "./tw-merge.js";
import {cx} from "./utils.js";
import {defaultConfig} from "./config.js";

export const {createTV, tv} = getTailwindVariants(cnMerge);

export {cn, cnMerge, cx, defaultConfig};
