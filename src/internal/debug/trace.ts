/*
 * Internal debug data collection. Constructs the intermediate shape the console
 * reporter prints, so it only ever runs inside the development debug wrapper
 * (`./index.ts`) — a production build drops this module together with the
 * reporter.
 */

import type {AnyRecord, ResolvedOptions} from "../types.js";

import {cx} from "../../utils.js";
import {
  getCompleteProps,
  matchesConditions,
  pushCompoundClassForSlot,
  pushVariantClasses,
  pushVariantClassesBySlot,
} from "../class-resolver.js";
import {compileResolvedOptions} from "../resolve-options.js";

const EMPTY_COMPOUND_SLOTS: never[] = [];
const WHITESPACE = /\s+/;

// What one invocation resolved, per layer. Shaped for the reporter, not for consumers.
export interface DebugTrace {
  // Effective props: `defaultVariants` merged with the props actually passed.
  props: Record<string, any>;
  // Resolved `base` classes (the slot's own classes for a slot trace).
  base: string;
  // Applied classes keyed by variant axis; axes that contributed nothing are omitted.
  variants: Record<string, string>;
  // Classes contributed by matching `compoundVariants` / `compoundSlots`.
  compounds: string[];
  // Classes present in the joined input but dropped by `tailwind-merge`.
  overridden: string[];
  // Final resolved class string.
  result: string;
  // Per-slot breakdown; present only for recipes that declare `slots`.
  slots?: Record<string, DebugTrace>;
}

// Classes that made it into `raw` but not into `result` — what the merger threw
// away. Splitting on whitespace runs absorbs empty and repeated separators, and
// the two sets absorb duplicates, so `""`, `"bg-red-500   p-4"`, and a class
// listed twice all behave.
export const diffOverriddenClasses = (raw: string, result: string): string[] => {
  if (!raw) return [];

  const kept = new Set<string>();

  if (result) {
    const keptTokens = result.split(WHITESPACE);

    for (let i = 0; i < keptTokens.length; i++) {
      if (keptTokens[i]) kept.add(keptTokens[i]);
    }
  }

  const rawTokens = raw.split(WHITESPACE);
  const overridden: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i];

    if (!token || kept.has(token) || seen.has(token)) continue;

    seen.add(token);
    overridden.push(token);
  }

  return overridden;
};

const buildTrace = (
  completeProps: AnyRecord,
  base: string,
  variants: Record<string, string>,
  compounds: string[],
  override: string,
  result: string,
): DebugTrace => {
  const parts: string[] = [];

  if (base) parts.push(base);
  for (const key in variants) parts.push(variants[key]);
  for (let i = 0; i < compounds.length; i++) parts.push(compounds[i]);
  if (override) parts.push(override);

  return {
    props: completeProps,
    base,
    variants,
    compounds,
    overridden: diffOverriddenClasses(parts.join(" "), result),
    result,
  };
};

// Class override carried on props, mirroring what the resolvers merge in last.
const overrideClasses = (props?: AnyRecord): string => cx(props?.class, props?.className);

// Debug data for a `plain` / `variants` recipe, whose result is a single string.
const traceFlat = (
  resolved: ResolvedOptions,
  props: AnyRecord | undefined,
  result: string,
): DebugTrace => {
  const {defaultVariants} = resolved;
  const completeProps = getCompleteProps(defaultVariants, props);
  const variants: Record<string, string> = {};

  pushVariantClasses([], 0, resolved.compiledVariants!, defaultVariants, props, variants);

  for (const key in variants) {
    variants[key] = cx(variants[key]);
    if (!variants[key]) delete variants[key];
  }

  const compounds: string[] = [];
  const compiledCompoundVariants = resolved.compiledCompoundVariants!;

  for (let i = 0; i < compiledCompoundVariants.length; i++) {
    const compound = compiledCompoundVariants[i];

    if (!matchesConditions(compound, defaultVariants, props)) continue;

    const applied = cx(compound.source.class, compound.source.className);

    if (applied) compounds.push(applied);
  }

  return buildTrace(
    completeProps,
    cx(resolved.base),
    variants,
    compounds,
    overrideClasses(props),
    result,
  );
};

// Debug data for one slot. `slotProps` mirrors the runtime rule that a slot
// call may re-resolve every axis with its own props layered over the parent's.
export const traceSlot = (
  resolved: ResolvedOptions,
  slotKey: string,
  props: AnyRecord | undefined,
  slotProps: AnyRecord | undefined,
  result: string,
): DebugTrace => {
  const {defaultVariants} = resolved;
  const completeProps = getCompleteProps(defaultVariants, props, slotProps);
  const variants: Record<string, string> = {};

  pushVariantClassesBySlot(
    [],
    0,
    slotKey,
    resolved.compiledVariants!,
    defaultVariants,
    props,
    slotProps,
    variants,
  );

  for (const key in variants) {
    variants[key] = cx(variants[key]);
    if (!variants[key]) delete variants[key];
  }

  const compounds: string[] = [];
  const compiledCompoundVariants = resolved.compiledCompoundVariants!;
  const collected: any[] = [];

  for (let i = 0; i < compiledCompoundVariants.length; i++) {
    const compound = compiledCompoundVariants[i];

    if (!matchesConditions(compound, defaultVariants, props, slotProps)) continue;

    collected.length = 0;
    pushCompoundClassForSlot(collected, slotKey, compound.source.class);
    pushCompoundClassForSlot(collected, slotKey, compound.source.className);

    const applied = cx(collected);

    if (applied) compounds.push(applied);
  }

  const compoundSlots = resolved.compiledCompoundSlotsBySlot?.[slotKey] ?? EMPTY_COMPOUND_SLOTS;

  for (let i = 0; i < compoundSlots.length; i++) {
    const compoundSlot = compoundSlots[i];

    if (!matchesConditions(compoundSlot, defaultVariants, props, slotProps)) continue;

    const applied = cx(compoundSlot.source.class, compoundSlot.source.className);

    if (applied) compounds.push(applied);
  }

  return buildTrace(
    completeProps,
    cx(resolved.slots?.[slotKey]),
    variants,
    compounds,
    // A slot only ever merges its own `class` / `className`; the parent call's
    // override never reaches it.
    overrideClasses(slotProps),
    result,
  );
};

// Full debug data for one invocation. The root mirrors the `base` slot so the
// reporter can render a single "tv" header with every slot underneath.
export const collectTrace = (
  resolved: ResolvedOptions,
  props: AnyRecord | undefined,
  output: string | Record<string, (slotProps?: AnyRecord) => string>,
): DebugTrace => {
  // The resolver only compiles lazily (plain recipes never do), so make sure
  // the compiled fields the layer collectors read are present.
  compileResolvedOptions(resolved);

  if (typeof output === "string") return traceFlat(resolved, props, output);

  const slots: Record<string, DebugTrace> = {};
  const slotKeys = resolved.slotKeys ?? [];

  for (let i = 0; i < slotKeys.length; i++) {
    const slotKey = slotKeys[i];
    const slot = output[slotKey];

    if (typeof slot !== "function") continue;

    slots[slotKey] = traceSlot(resolved, slotKey, props, undefined, slot());
  }

  const root = slots.base ?? slots[slotKeys[0]];

  if (!root) {
    const empty = buildTrace(getCompleteProps(resolved.defaultVariants, props), "", {}, [], "", "");

    empty.slots = slots;

    return empty;
  }

  return {...root, slots};
};
