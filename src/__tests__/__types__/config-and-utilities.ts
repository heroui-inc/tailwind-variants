import {
  cn,
  cnMerge,
  createTV,
  cx,
  defaultConfig,
  type TVConfig,
  type TWMConfig,
  type TWMergeConfig,
  tv,
} from "../../index.js";
import {createTV as createLiteTV, cn as liteCn, cx as liteCx, tv as liteTV} from "../../lite.js";
import {cx as utilityCx} from "../../utils.js";

// Case: accept public Tailwind Merge configuration shapes in TVConfig and TWMConfig.
const twMergeConfig: TWMergeConfig = {
  extend: {
    theme: {
      spacing: ["unit"],
    },
  },
};
const twmConfig: TWMConfig = {twMerge: true, twMergeConfig};
const config: TVConfig = twmConfig;
const configuredTV = createTV(config);
const configuredLiteTV = createLiteTV();

// Case: preserve full, lite, and configured tv return types.
const fullClass: string = tv({base: "px-2"}, config)();
const configuredClass: string = configuredTV({base: "px-2"})();
const liteClass: string = configuredLiteTV({base: "px-2"})();

// Case: preserve public cn, cnMerge, and cx return types across entrypoints.
const mergedClass: string | undefined = cn("px-2", "px-4");
const configuredMergedClass: string | undefined = cnMerge("px-2", "px-4")({twMerge: true});
const liteMergedClass: string | undefined = liteCn("px-2", "px-4")();
const joinedClass: string | undefined = cx("px-2", {hidden: false});
const liteJoinedClass: string | undefined = liteCx("px-2");
const utilityClass: string | undefined = utilityCx("px-2");
const defaultConfigContract: TVConfig = defaultConfig;

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

// Case: reject calls that violate full and lite factory configuration contracts.
// @ts-expect-error full createTV requires a config object
createTV();

// @ts-expect-error lite createTV rejects configuration
createLiteTV({twMerge: false});

// @ts-expect-error lite tv has no per-component config argument
liteTV({base: "block"}, {twMerge: false});

// Case: reject invalid scalar values in TVConfig.
// @ts-expect-error twMerge must be boolean
const invalidConfig: TVConfig = {twMerge: "yes"};

void invalidConfig;
