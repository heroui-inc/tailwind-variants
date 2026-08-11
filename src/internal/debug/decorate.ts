/*
 * Diagnostics decorator, injected into `tv` the same way `cn` is. The
 * environment is picked once at module scope so a bundler can fold the
 * `NODE_ENV` ternary and drop the development branch from production builds.
 */

import type {ResolvedOptions, RuntimeComponent} from "../types.js";

import {createDebugComponent} from "./index.js";

export type Diagnostics = (
  component: RuntimeComponent,
  resolved: ResolvedOptions,
  attachMetadata: (component: RuntimeComponent, resolved: ResolvedOptions) => void,
) => RuntimeComponent;

const developmentDiagnostics: Diagnostics = (component, resolved, attachMetadata) => {
  // No debug flag: return the recipe untouched, with zero overhead attached.
  if (!resolved.config.debug) return component;

  const debugged = createDebugComponent(component, resolved);

  if (debugged !== component) attachMetadata(debugged, resolved);

  return debugged;
};

const productionDiagnostics: Diagnostics = (component) => component;

const isDevelopment = (): boolean => {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
};

export const diagnostics: Diagnostics = isDevelopment()
  ? developmentDiagnostics
  : productionDiagnostics;
