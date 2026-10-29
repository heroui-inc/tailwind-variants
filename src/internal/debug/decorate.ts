/*
 * Diagnostics decorator, injected into `tv` the same way `cn` is. A bundler
 * that replaces `process.env.NODE_ENV` can fold this ternary and drop the
 * development branch from production builds.
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

export const diagnostics: Diagnostics =
  process.env.NODE_ENV !== "production" ? developmentDiagnostics : productionDiagnostics;
