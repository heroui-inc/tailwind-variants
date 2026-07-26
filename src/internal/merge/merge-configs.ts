/*
 * Merge `{ extend, override }` into a base merger config.
 *
 * @see https://github.com/dcastil/tailwind-merge
 * @see https://github.com/dcastil/tailwind-merge/blob/main/LICENSE.md
 */

import {AnyConfig, ConfigExtension} from "./types.js";

type PropertyObject = Partial<Record<string, readonly unknown[]>>;

/** Merge `{ extend, override }` into `baseConfig` (mutates; pass a fresh default). */
export const mergeConfigs = (
  baseConfig: AnyConfig,
  {extend = {}, override = {}}: ConfigExtension,
): AnyConfig => {
  overrideConfigProperties(baseConfig.theme, override.theme);
  overrideConfigProperties(baseConfig.classGroups, override.classGroups);
  overrideConfigProperties(baseConfig.conflictingClassGroups, override.conflictingClassGroups);
  overrideConfigProperties(
    baseConfig.conflictingClassGroupModifiers,
    override.conflictingClassGroupModifiers,
  );
  overrideProperty(baseConfig, "postfixLookupClassGroups", override.postfixLookupClassGroups);
  overrideProperty(baseConfig, "orderSensitiveModifiers", override.orderSensitiveModifiers);

  mergeConfigProperties(baseConfig.theme, extend.theme);
  mergeConfigProperties(baseConfig.classGroups, extend.classGroups);
  mergeConfigProperties(baseConfig.conflictingClassGroups, extend.conflictingClassGroups);
  mergeConfigProperties(
    baseConfig.conflictingClassGroupModifiers,
    extend.conflictingClassGroupModifiers,
  );
  mergeArrayProperties(baseConfig, extend, "postfixLookupClassGroups");
  mergeArrayProperties(baseConfig, extend, "orderSensitiveModifiers");

  return baseConfig;
};

const overrideProperty = <T extends object, K extends keyof T>(
  baseObject: T,
  overrideKey: K,
  overrideValue: T[K] | undefined,
) => {
  if (overrideValue !== undefined) {
    baseObject[overrideKey] = overrideValue;
  }
};

const overrideConfigProperties = (
  baseObject: PropertyObject,
  overrideObject: PropertyObject | undefined,
) => {
  if (overrideObject) {
    for (const key in overrideObject) {
      overrideProperty(baseObject, key, overrideObject[key]);
    }
  }
};

const mergeConfigProperties = (
  baseObject: PropertyObject,
  mergeObject: PropertyObject | undefined,
) => {
  if (mergeObject) {
    for (const key in mergeObject) {
      mergeArrayProperties(baseObject, mergeObject, key);
    }
  }
};

const mergeArrayProperties = <Key extends string>(
  baseObject: Partial<Record<Key, readonly unknown[]>>,
  mergeObject: Partial<Record<Key, readonly unknown[]>>,
  key: Key,
) => {
  const mergeValue = mergeObject[key];
  if (mergeValue !== undefined) {
    baseObject[key] = baseObject[key] ? baseObject[key].concat(mergeValue) : mergeValue;
  }
};
