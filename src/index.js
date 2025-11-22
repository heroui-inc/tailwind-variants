import {getTailwindVariants} from "./core.js";
import {cn} from "./tw-merge.js";
import {cx} from "./utils.js";
import {defaultConfig} from "./config.js";

export const {createTV, tv} = getTailwindVariants(cn);

export {cn, cx, defaultConfig};
