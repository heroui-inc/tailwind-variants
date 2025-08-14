import {getTailwindVariants} from "./core.js";
import {cn} from "./tw-merge.js";
import {cn as cnBase} from "./utils.js";
import {defaultConfig} from "./config.js";

export const {createTV, tv} = getTailwindVariants(cn);

export {cn, cnBase, defaultConfig};
