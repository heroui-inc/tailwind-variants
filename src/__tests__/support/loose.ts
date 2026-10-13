/**
 * The one boundary where these suites step outside the public types.
 *
 * Several cases deliberately pass values the published types forbid — a bigint or an object where
 * a variant value belongs, a prop the definition never declares, metadata mutated after the fact
 * — because the cache has to be correct for what reaches it at RUNTIME, which is a wider set than
 * the types admit.
 *
 * Crossing that boundary with a type ASSERTION would mean the suites silently keep passing if
 * `tv()` ever returned something else. These narrow with predicates, so the assumption is checked
 * once against the actual value and a violation fails loudly with a message.
 */
export type LooseRecord = Record<string, unknown>;
export type LooseFactory = (definition: LooseRecord) => unknown;

export type LooseMetadata = {
  compoundVariants: LooseRecord[];
  compoundSlots: LooseRecord[];
  defaultVariants: LooseRecord;
  variantKeys: string[];
};

export type LooseVariants = ((props?: LooseRecord | null) => string) & LooseMetadata;
export type LooseSlots = ((
  props?: LooseRecord | null,
) => Record<string, (slotProps?: LooseRecord) => string>) &
  LooseMetadata;

/** A component is a function carrying its definition's metadata; both halves are checked. */
const hasComponentShape = (value: unknown): boolean =>
  typeof value === "function" &&
  "compoundVariants" in value &&
  "defaultVariants" in value &&
  "variantKeys" in value;

const isLooseVariants = (value: unknown): value is LooseVariants => hasComponentShape(value);
const isLooseSlots = (value: unknown): value is LooseSlots => hasComponentShape(value);
const isLooseRecord = (value: unknown): value is LooseRecord =>
  value !== null && typeof value === "object";

const describe = (value: unknown): string => (value === null ? "null" : typeof value);

export const defineVariants = (createTv: LooseFactory, definition: LooseRecord): LooseVariants => {
  const component = createTv(definition);

  if (!isLooseVariants(component)) {
    throw new TypeError(`tv() returned ${describe(component)}, not a component with metadata`);
  }

  return component;
};

export const defineSlots = (createTv: LooseFactory, definition: LooseRecord): LooseSlots => {
  const component = createTv(definition);

  if (!isLooseSlots(component)) {
    throw new TypeError(`tv() returned ${describe(component)}, not a component with metadata`);
  }

  return component;
};

/** Reads a metadata value as a record, failing loudly rather than asserting it is one. */
export const asRecord = (value: unknown): LooseRecord => {
  if (!isLooseRecord(value)) throw new TypeError(`expected an object, received ${describe(value)}`);

  return value;
};

/**
 * Reads one slot function out of a slots result by name.
 *
 * Slot names are consumer strings, so a definition may name a slot `hasOwnProperty` or
 * `toLocaleString`, and at runtime those resolve like any other. In the TYPE system they do not:
 * an apparent member inherited from `Object.prototype` outranks the result's index signature, so
 * `parts.hasOwnProperty` is typed as the method that takes a `PropertyKey` and the call is a
 * compile error. Passing the name as a `string` goes through the index signature instead, which is
 * the accurate type — and the predicate keeps it honest, so a slot that is genuinely missing fails
 * with its name rather than as `undefined is not a function`.
 */
export const readSlot = (
  parts: Record<string, (slotProps?: LooseRecord) => string>,
  name: string,
): ((slotProps?: LooseRecord) => string) => {
  const slot = parts[name];

  if (typeof slot !== "function") {
    throw new TypeError(`slot "${name}" is ${describe(slot)}, not a function`);
  }

  return slot;
};
