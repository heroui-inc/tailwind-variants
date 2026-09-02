import type {TVConfig} from "../config.js";
import type {CnOptions} from "../types.js";

export type AnyRecord = Record<string, any>;

export type CnAdapter = (
  config: TVConfig | undefined,
  ...classnames: CnOptions
) => string | undefined;

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

/**
 * Everything derived from the compounds' condition key SETS, as one immutable value.
 *
 * Replaced wholesale on a change, never refreshed field by field. Consumer code runs during a
 * refresh — rebuilding the per-slot index reads `slots` getters — so a reader that arrives
 * mid-refresh would otherwise match on one derivation and render from another. Holding them in
 * one object means a reader either sees all of the old view or all of the new one.
 *
 * It is also the identity a resolve samples to notice that its own view was superseded while it
 * was computing.
 */
export type CompoundIndex = {
  compoundVariants: CompiledCompoundVariant[];
  compoundSlots: CompiledCompoundSlot[];
  bySlot: Record<string, CompiledCompoundSlot[]>;
};

/**
 * Everything derived from a definition, compiled once.
 *
 * One object rather than independent nullable fields: they are produced together in one pass and
 * are meaningless apart, so the return type of `compileResolvedOptions` IS the proof that all of
 * them are present — no consumer re-asserts it by hand.
 */
export type CompiledState = {
  variants: CompiledVariant[];
  compounds: CompoundIndex;
  slotKeys: string[];
  /**
   * The variant names this component keys on, snapshotted at compile time.
   *
   * `resolved.variantKeys` is the array `attachComponentMetadata` publishes as
   * `component.variantKeys`, so it is consumer-reachable and consumer-mutable. Deriving the
   * dependency set from the live array lets a `pop()` on that public property narrow both the
   * cache key AND the props resolution sees — the variant stops resolving, and two calls that
   * differ only in it collide on one entry. Compiled once here, beside the `CompiledVariant[]`
   * that was built from the same array in the same pass, so the two cannot disagree.
   */
  variantKeys: string[];
};

export type ResolvedOptions = {
  config: TVConfig;
  extend: RuntimeComponent | null;
  base: any;
  variants: AnyRecord;
  defaultVariants: AnyRecord;
  slots: AnyRecord;
  compoundVariants: any[];
  compoundSlots: any[];
  compiled: CompiledState | null;
  deferredError: TypeError | null;
  mode: "plain" | "variants" | "slots";
  variantKeys: string[];
};
