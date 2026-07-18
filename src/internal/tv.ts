import type {TVConfig} from "../config.js";
import {mergeObjects} from "../utils.js";
import {createClassResolver} from "./class-resolver.js";
import {resolveOptions} from "./resolve-options.js";
import type {CnAdapter, ResolvedOptions, RuntimeComponent, RuntimeTV} from "./types.js";

const attachComponentMetadata = (component: RuntimeComponent, resolved: ResolvedOptions): void => {
  component.variantKeys = resolved.variantKeys;
  component.extend = resolved.extend;
  component.base = resolved.base;
  component.slots = resolved.slots;
  component.variants = resolved.variants;
  component.defaultVariants = resolved.defaultVariants;
  component.compoundSlots = resolved.compoundSlots;
  component.compoundVariants = resolved.compoundVariants;
};

export const getTailwindVariants = (cn: CnAdapter) => {
  const tv: RuntimeTV = (options, configProp) => {
    const resolved = resolveOptions(options, configProp);
    const component = createClassResolver(resolved, cn);

    attachComponentMetadata(component, resolved);

    return component;
  };

  const createTV = (configProp?: TVConfig): RuntimeTV => {
    return (options, config) =>
      tv(options, config ? (mergeObjects(configProp as object, config) as TVConfig) : configProp);
  };

  return {
    tv,
    createTV,
  };
};
