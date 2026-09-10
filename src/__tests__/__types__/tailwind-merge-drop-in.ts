import type {ClassNameValue} from "../../index.js";

import {
  createTailwindMerge,
  extendTailwindMerge,
  fromTheme,
  getDefaultConfig,
  mergeConfigs,
  twJoin,
  twMerge,
  validators,
} from "../../config-entry.js";
import defaultClsx, {
  clsx,
  cn,
  twJoin as defaultTwJoin,
  twMerge as defaultTwMerge,
} from "../../index.js";
import {twJoin as mergeTwJoin, twMerge as mergeTwMerge} from "../../merge-entry.js";

/*
 * Local copies of tailwind-merge's public signatures (3.x). Assigning our
 * exports to them proves an alias of `tailwind-merge` to this package keeps
 * type-checking. Config-typed generics are covered by `TWMergeConfig`, not by
 * tailwind-merge's `ConfigExtension<ClassGroupIds, ThemeGroupIds>` generics
 * (documented as a known limit in the README).
 */
type TwMergeShape = (...classLists: ClassNameValue[]) => string;
type TwJoinShape = (...classLists: ClassNameValue[]) => string;
type ExtendShape = (
  configExtension: Parameters<typeof extendTailwindMerge>[0],
) => (...classLists: ClassNameValue[]) => string;
type ClsxShape = (...inputs: Parameters<typeof clsx>) => string;

const twMergeDropIn: TwMergeShape = twMerge;
const twJoinDropIn: TwJoinShape = twJoin;
const defaultTwMergeDropIn: TwMergeShape = defaultTwMerge;
const defaultTwJoinDropIn: TwJoinShape = defaultTwJoin;
const mergeTwMergeDropIn: TwMergeShape = mergeTwMerge;
const mergeTwJoinDropIn: TwJoinShape = mergeTwJoin;
const extendDropIn: ExtendShape = extendTailwindMerge;
const clsxDropIn: ClsxShape = clsx;
const defaultClsxDropIn: ClsxShape = defaultClsx;

// createTailwindMerge takes config factories like tailwind-merge's.
const created = createTailwindMerge(getDefaultConfig, (config) =>
  mergeConfigs(config, {extend: {classGroups: {custom: ["foo-a", "foo-b"]}}}),
);
const createdOut: string = created("foo-a", ["foo-b", false], null);

// fromTheme and validators are usable inside class group definitions.
const extended = extendTailwindMerge({
  extend: {
    theme: {spacing: ["unit"]},
    classGroups: {custom: [{foo: [fromTheme("spacing"), validators.isArbitraryValue]}]},
  },
});
const extendedOut: string = extended("foo-unit foo-[1px]");

// twMerge rejects clsx object syntax; cn accepts it.
// @ts-expect-error twMerge takes strings and nested arrays only
twMerge("px-2", {"px-4": true});
const objectOut: string = cn("px-2", {"px-4": true});

void twMergeDropIn;
void twJoinDropIn;
void defaultTwMergeDropIn;
void defaultTwJoinDropIn;
void mergeTwMergeDropIn;
void mergeTwJoinDropIn;
void extendDropIn;
void clsxDropIn;
void defaultClsxDropIn;
void createdOut;
void extendedOut;
void objectOut;
