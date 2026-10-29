/*
 * Development-only debug wiring. Only reachable from the development branch
 * selected in `./decorate.ts`, so a production build drops this module together
 * with the console reporter it imports.
 */

import type {AnyRecord, ResolvedOptions, RuntimeComponent, RuntimeResult} from "../types.js";

import {IS_BROWSER, logSlotTrace, logTrace} from "./format.js";
import {collectTrace, traceSlot} from "./trace.js";

// Wraps a recipe so each invocation logs how it resolved. The wrapper keeps the
// call signature intact — consumers never change how they render.
//
// Logging is browser-only so SSR passes stay silent. Debug data is collected
// from the actual output of the underlying resolver, so the printed `result` is
// always exactly what the caller received.
export const createDebugComponent = (
  component: RuntimeComponent,
  resolved: ResolvedOptions,
): RuntimeComponent => {
  const shouldLog = IS_BROWSER;

  return ((props?: AnyRecord): RuntimeResult => {
    const output = component(props);

    if (shouldLog) logTrace(collectTrace(resolved, props, output));

    if (typeof output === "string") return output;

    const slots: Record<string, (slotProps?: AnyRecord) => string> = {};

    for (const slotKey in output) {
      const slot = output[slotKey];

      slots[slotKey] = (slotProps) => {
        const value = slot(slotProps);

        // A slot call carrying its own props re-resolves every axis against
        // them, so it gets its own report instead of being folded into the
        // parent's.
        if (slotProps != null && shouldLog) {
          logSlotTrace(traceSlot(resolved, slotKey, props, slotProps, value), slotKey);
        }

        return value;
      };
    }

    return slots;
  }) as RuntimeComponent;
};
