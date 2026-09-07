import type {
  TVConfig,
  TVCustomConfig,
  TWMConfig,
  TWMCustomConfig,
  TWMergeConfig,
} from "../../index.js";
import type {IsEqual} from "./test-utils.js";

import {createTV as createCustomTV, tv as customTV} from "../../config-entry.js";
import {cn, cnMerge, createTV, cx, defaultConfig, tv} from "../../index.js";
import {createTV as createLiteTV, cn as liteCn, cx as liteCx, tv as liteTV} from "../../lite.js";
import {cx as utilityCx} from "../../utils.js";

// Case: accept public Tailwind Merge configuration shapes on the config entry.
const twMergeConfig: TWMergeConfig = {
  extend: {
    theme: {
      spacing: ["unit"],
    },
  },
};
const twmCustomConfig: TWMCustomConfig = {twMerge: true, twMergeConfig};
const customConfig: TVCustomConfig = twmCustomConfig;
const twmConfig: TWMConfig = {twMerge: true};
const config: TVConfig = twmConfig;
const configuredTV = createTV(config);
const customConfiguredTV = createCustomTV(customConfig);
const configuredLiteTV = createLiteTV();

// Case: the default entry has no table compiler, so it rejects twMergeConfig.
// @ts-expect-error default tv does not accept twMergeConfig
tv({base: "block"}, {twMergeConfig});
// @ts-expect-error default factory does not accept twMergeConfig
createTV({twMergeConfig});
// @ts-expect-error default cnMerge does not accept twMergeConfig
cnMerge("px-2")({twMergeConfig});

// Case: preserve full, custom, lite, and configured tv return types.
const fullClass: string = tv({base: "px-2"}, config)();
const customClass: string = customTV({base: "px-2"}, customConfig)();
const configuredClass: string = configuredTV({base: "px-2"})();
const customConfiguredClass: string = customConfiguredTV({base: "px-2"})();
const liteClass: string = configuredLiteTV({base: "px-2"})();

// Case: cn, cnMerge, and cx return plain strings across entrypoints. The
// `string` annotations are deliberate: they fail to compile if any entry point
// ever widens back to `string | undefined` (issue #289).
const mergedClass: string = cn("px-2", "px-4");
const configuredMergedClass: string = cnMerge("px-2", "px-4")({twMerge: true});
const liteMergedClass: string = liteCn("px-2", "px-4")();
const joinedClass: string = cx("px-2", {hidden: false});
const liteJoinedClass: string = liteCx("px-2");
const utilityClass: string = utilityCx("px-2");
const defaultConfigContract: TVConfig = defaultConfig;

void customClass;
void customConfiguredClass;
void fullClass;
void configuredClass;
void liteClass;
void mergedClass;
void configuredMergedClass;
void liteMergedClass;
void joinedClass;
void liteJoinedClass;
void utilityClass;
void defaultConfigContract;

// Case: string-typed parameters accept every entry point's result, including
// empty input — the exact consumer pattern from issue #289. Each call errors
// with "Type 'undefined' is not assignable to type 'string'" on regression.
const takesString = (value: string): string => value;

takesString(cn());
takesString(cx());
takesString(utilityCx());
takesString(cnMerge()());
takesString(liteCn()());
takesString(liteCx());
takesString(tv({})());
takesString(tv({slots: {root: "grid"}})().root());

// Case: utility and slot return types are exactly `string`, never a union.
const cnReturnsExactlyString: IsEqual<ReturnType<typeof cn>, string> = true;
const cxReturnsExactlyString: IsEqual<ReturnType<typeof cx>, string> = true;
const utilityCxReturnsExactlyString: IsEqual<ReturnType<typeof utilityCx>, string> = true;
const slotResult = tv({slots: {root: "grid"}})();
const slotReturnsExactlyString: IsEqual<ReturnType<typeof slotResult.root>, string> = true;

void cnReturnsExactlyString;
void cxReturnsExactlyString;
void utilityCxReturnsExactlyString;
void slotReturnsExactlyString;

// Case: reject calls that violate full and lite factory configuration contracts.
// @ts-expect-error full createTV requires a config object
createTV();

createLiteTV({twMerge: false});
createLiteTV({twMerge: (classList) => classList});

liteTV({base: "block"}, {twMerge: false});

// @ts-expect-error lite tv does not accept twMergeConfig
liteTV({base: "block"}, {twMergeConfig: {}});

// @ts-expect-error twMerge must be boolean or a function
const invalidConfig: TVConfig = {twMerge: "yes"};

void invalidConfig;
