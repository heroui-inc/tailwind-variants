import type {TVConfig} from "../config.js";

export type AnyRecord = Record<string, any>;

// Merge layer a recipe resolver talks to. Both methods take class strings the
// resolver already normalized, so the identity cache underneath can hit on
// stable string instances instead of re-joining and re-hashing.
export interface MergeAdapter {
  // Merge the first `count` entries of a gathered list of truthy class
  // strings. The list is read, never retained, so a scratch array is fine.
  parts(list: readonly string[], count: number): string;
  // Merge the resolved core with `class` / `className` overrides (any class value shape).
  override(core: string, classValue: unknown, classNameValue: unknown): string;
}

// Builds the merge adapter for a resolved recipe config.
export type MergeAdapterFactory = (config: TVConfig) => MergeAdapter;

// Slot name → normalized class string.
export type SlotClassMap = Record<string, string>;

// One variant option after normalization. In variants mode this is always a
// string. In slots mode a string applies to the `base` slot only and a map
// carries one string per slot.
export type NormalizedOption = string | SlotClassMap;

export type CompiledVariant = {
  key: string;
  // Live reference to the recipe's option map (in-place edits stay visible).
  values: AnyRecord;
  isEmpty: boolean;
  // Option key → raw value the normalized entry was built from (null until first use).
  normalizedFrom: AnyRecord | null;
  // Option key → normalized classes. Rebuilt when the raw value identity changes.
  normalized: Record<string, NormalizedOption> | null;
};

export type CompiledCompoundVariant = {
  conditionKeys: string[];
  source: AnyRecord;
  // Normalized `class` + `className` (variants mode); null until first match.
  classes: string | null;
  // Normalized `class` + `className` per slot (slots mode); null until first match.
  slotClasses: SlotClassMap | null;
};

export type CompiledCompoundSlot = {
  conditionKeys: string[];
  source: AnyRecord;
  // Normalized `class` + `className`, applied to every listed slot; null until first match.
  classes: string | null;
};

export type RuntimeResult = string | Record<string, (slotProps?: AnyRecord) => string>;

export type RuntimeComponent = {
  (props?: AnyRecord): RuntimeResult;
  variantKeys: string[] | undefined;
  // Original `extend` input (single parent, array, or null).
  extend: RuntimeComponent | RuntimeComponent[] | null;
  base: any;
  slots: AnyRecord;
  variants: AnyRecord;
  defaultVariants: AnyRecord;
  compoundSlots: any[];
  compoundVariants: any[];
};

export type RuntimeExtend = RuntimeComponent | RuntimeComponent[] | null;

export type RuntimeTV = (options: AnyRecord, configProp?: TVConfig) => RuntimeComponent;

export type ResolvedOptions = {
  config: TVConfig;
  // Original `extend` input (single parent, array, or null).
  extend: RuntimeExtend;
  base: any;
  variants: AnyRecord;
  defaultVariants: AnyRecord;
  slots: AnyRecord;
  compoundVariants: any[];
  compoundSlots: any[];
  compiledVariants: CompiledVariant[] | null;
  compiledCompoundVariants: CompiledCompoundVariant[] | null;
  compiledCompoundSlots: CompiledCompoundSlot[] | null;
  compiledCompoundSlotsBySlot: Record<string, CompiledCompoundSlot[]> | null;
  deferredError: TypeError | null;
  mode: "plain" | "variants" | "slots";
  slotKeys: string[] | null;
  variantKeys: string[];
};
