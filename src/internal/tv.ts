import type {TVConfig, TVCustomConfig} from "../config.js";
import type {Diagnostics} from "./debug/decorate.js";
import type {MergeAdapterFactory, ResolvedOptions, RuntimeComponent, RuntimeTV} from "./types.js";

import {createClassResolver} from "./class-resolver.js";
import {resolveOptions} from "./resolve-options.js";

// Per-call config wins per key; `twMergeConfig` merges one level deep.
const mergeConfig = (base: TVCustomConfig, override: TVCustomConfig): TVConfig => {
  const merged: TVCustomConfig = {...base, ...override};

  if (base.twMergeConfig && override.twMergeConfig) {
    merged.twMergeConfig = {...base.twMergeConfig, ...override.twMergeConfig};
  }

  return merged;
};

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

export const getTailwindVariants = (
  createMerge: MergeAdapterFactory,
  diagnostics?: Diagnostics,
) => {
  const tv: RuntimeTV = (options, configProp) => {
    const resolved = resolveOptions(options, configProp);
    const component = createClassResolver(resolved, createMerge(resolved.config));

    attachComponentMetadata(component, resolved);

    if (diagnostics) return diagnostics(component, resolved, attachComponentMetadata);

    return component;
  };

  const createTV = (configProp?: TVConfig): RuntimeTV => {
    return (options, config) =>
      tv(options, config && configProp ? mergeConfig(configProp, config) : (config ?? configProp));
  };

  return {
    tv,
    createTV,
  };
};
