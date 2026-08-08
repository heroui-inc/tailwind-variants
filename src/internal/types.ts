import type {TVConfig} from "../config.js";

export type AnyRecord = Record<string, any>;

export type CnAdapter = (config: TVConfig | undefined, ...classnames: any[]) => string;

export type CompiledVariant = {
  key: string;
  values: AnyRecord;
  isEmpty: boolean;
};

export type CompiledCompoundVariant = {
  conditionKeys: string[];
  source: AnyRecord;
};

export type CompiledCompoundSlot = CompiledCompoundVariant;

export type RuntimeResult = string | Record<string, (slotProps?: AnyRecord) => string>;

export type RuntimeComponent = {
  (props?: AnyRecord): RuntimeResult;
  variantKeys: string[] | undefined;
  /** Original `extend` input (single parent, array, or null). */
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
  /** Original `extend` input (single parent, array, or null). */
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
