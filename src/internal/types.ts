import type {TVConfig} from "../config.js";

export type AnyRecord = Record<string, any>;

export type CnAdapter = (config: TVConfig | undefined, ...classnames: any[]) => string | undefined;

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

export type RuntimeResult =
  | string
  | undefined
  | Record<string, (slotProps?: AnyRecord) => string | undefined>;

export type RuntimeComponent = {
  (props?: AnyRecord): RuntimeResult;
  variantKeys: string[] | undefined;
  extend: RuntimeComponent | null;
  base: any;
  slots: AnyRecord;
  variants: AnyRecord;
  defaultVariants: AnyRecord;
  compoundSlots: any[];
  compoundVariants: any[];
};

export type RuntimeTV = (options: AnyRecord, configProp?: TVConfig) => RuntimeComponent;

export type ResolvedOptions = {
  config: TVConfig;
  extend: RuntimeComponent | null;
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
