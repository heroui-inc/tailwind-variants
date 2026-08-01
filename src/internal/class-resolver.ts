import type {CnOptions} from "../types.js";
import {falsyToString} from "../utils.js";
import {
  type BoundedCache,
  CACHE_MISS,
  type CacheValue,
  capturePropsSnapshot,
  createBoundedCache,
  createLazyOverrideMerge,
  readDependencyValues,
  sameDependencyValues,
} from "./cache.js";
import {type CompoundsTracker, createCompoundsTracker} from "./compounds-tracker.js";
import {
  collectDependencyKeys,
  compileResolvedOptions,
  EMPTY_SLOT_INDEX,
  refreshCompoundIndex,
} from "./resolve-options.js";
import type {
  AnyRecord,
  CnAdapter,
  CompiledCompoundSlot,
  CompiledCompoundVariant,
  CompiledState,
  CompiledVariant,
  CompoundIndex,
  ResolvedOptions,
  RuntimeComponent,
  RuntimeResult,
} from "./types.js";

const EMPTY_ARRAY: never[] = [];

// Stands in until `prepare()` runs, so the index a resolve samples is never null and the identity
// comparison that guards a cache write has something real to compare against from the first call.
//
// `bySlot` is the SHARED null-prototype empty, not a fresh `{}`: every other slot-keyed record in
// the library is null-prototype because slot names are consumer strings, and a plain object here
// would answer `bySlot.constructor` with `Object` — a compound array that is really a function.
// `prepare()` replaces this before any computer can read it, so it is unreachable today; a
// placeholder that is only safe because nothing reaches it is one refactor from being neither.
const EMPTY_COMPOUND_INDEX: CompoundIndex = {
  compoundVariants: EMPTY_ARRAY,
  compoundSlots: EMPTY_ARRAY,
  bySlot: EMPTY_SLOT_INDEX,
};

/**
 * Whether a freshly derived dependency set is the same set as the one in hand.
 *
 * Callers keep the previous array when it is, so a CHANGED identity means the set genuinely moved.
 * That matters because the only remedy for a moved set is to read the caller's props again, which
 * runs their getters — and an ordinary mutation of a compound's VALUES re-derives the key set as
 * well, coming back equal nearly every time.
 */
const sameDependencyKeys = (previous: string[] | null, next: string[]): boolean => {
  if (previous === null || previous.length !== next.length) return false;

  for (let i = 0; i < next.length; i++) {
    if (previous[i] !== next[i]) return false;
  }

  return true;
};

/**
 * Class lists are assembled into reused arrays so a resolve allocates nothing, but a single
 * shared array is only sound while exactly one resolve is in flight. A definition's variant map
 * and compound conditions are consumer-supplied, so any value on them can be a getter — a Vue
 * `reactive()` proxy, a Solid prop, a MobX observable — and a getter can resolve ANOTHER
 * component part-way through assembling this one. That nested resolve would clear and refill the
 * array the outer one is still building, so the outer loses the classes it had already pushed
 * and gains the inner component's.
 *
 * Indexing by resolve depth keeps each nesting level on its own array. The depth is raised for
 * the whole resolve — assembly AND the merge that consumes the result — so nothing can take an
 * array that is still being read.
 */
let resolveDepth = 0;

/**
 * The four accumulators one resolve can hold at once, as one object per nesting level.
 *
 * Four, because each of them can be LIVE while another is: they are all handed to the same `cn`
 * call, so none may be recycled before it runs. The widest frame is a slot computer, which holds
 * three. (`compoundClasses` and `compoundVariantBySlot` are the exception — the variants path uses
 * the first and the slots path the second, and a frame is one resolve of one component, so they
 * are never live together. They stay separate because merging them saves one array and makes a
 * future third caller silently alias an accumulator that is still being read.)
 *
 * Grouped per level rather than four parallel pools indexed per acquire: this is the hottest
 * allocation-free path in the library, and one array lookup per FRAME plus four field reads beat
 * four lookups plus four calls. Measured at 11.5% of a create-and-call profile.
 */
type ResolveFrame = {
  variantClasses: CnOptions;
  compoundClasses: CnOptions;
  compoundVariantBySlot: CnOptions;
  compoundSlotClasses: CnOptions;
};

const createFrame = (): ResolveFrame => ({
  variantClasses: [],
  compoundClasses: [],
  compoundVariantBySlot: [],
  compoundSlotClasses: [],
});

// Index 0 is a placeholder so `frame` is never undefined; the resolvers always enter a frame
// before taking an accumulator, so nothing reads it.
const frames: ResolveFrame[] = [createFrame()];
let frame: ResolveFrame = frames[0];

/**
 * Raises the depth for one whole resolve, so nested resolves never share an accumulator.
 *
 * A bare pair called around a `try`/`finally`, rather than the tidier `withFrame(() => …)` shape:
 * a callback wrapper reads better but allocates a closure on every resolve, and a resolve is the
 * hottest operation here. Measured at 6.8% of the same profile.
 */
const enterResolveFrame = (): void => {
  resolveDepth++;
  frame = frames[resolveDepth] ?? (frames[resolveDepth] = createFrame());
};

/**
 * Empties this frame's accumulators, lowers the depth and restores the outer frame. Must be called
 * from a `finally`.
 *
 * Clearing on the way OUT rather than only on the next acquire is what stops these arrays pinning
 * the last resolve's class values at module level for the life of the process — values that belong
 * to a component the caller may already have dropped. Restoring `frame` is what lets the outer
 * resolve keep taking its OWN accumulators after a nested one returns.
 */
const releaseResolveFrame = (): void => {
  // Guarded, because most resolves fill ONE of these four: a slots computer with no compounds only
  // ever touches `variantClasses`, and the variants path never touches `compoundVariantBySlot` or
  // `compoundSlotClasses` at all. Truncating an already-empty array is not free — four
  // unconditional writes measured 80.7 ns against 34.5 ns for four guarded ones, and this is the
  // hottest function on the cold profile at 14% of its self time.
  //
  // Retention is unaffected by construction: an array that is already empty holds nothing, so the
  // only case the guard skips is the one where there was nothing to release.
  if (frame.variantClasses.length !== 0) frame.variantClasses.length = 0;
  if (frame.compoundClasses.length !== 0) frame.compoundClasses.length = 0;
  if (frame.compoundVariantBySlot.length !== 0) frame.compoundVariantBySlot.length = 0;
  if (frame.compoundSlotClasses.length !== 0) frame.compoundSlotClasses.length = 0;
  resolveDepth--;
  frame = frames[resolveDepth];
};

const getCompleteProps = (
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  slotProps?: AnyRecord,
): AnyRecord => {
  // NO prototype, which is what makes `undefined` mean "the caller did not supply this" for EVERY
  // key. On a plain record the eight `Object.prototype` member names read back as inherited
  // functions for a key nobody passed, so a compound conditioned on `toString: undefined` compares
  // against `Object.prototype.toString` and silently never matches, while the identical condition
  // on any other name matches correctly (contribution 111).
  //
  // It is only safe because both invoke paths now resolve from a dependency capture. While the
  // variants resolver's cold path handed the caller's own object through here, the prototype was
  // load-bearing for a second reason: it hid a disagreement between the two paths about inherited
  // members, since a capture reads BY NAME and the `for...in` below does not see non-enumerable
  // ones. Removing it without that symmetry makes a warmed component and a freshly built one
  // resolve differently under a polluted prototype — the invariant
  // `security-prototype-pollution.test.ts` pins.
  //
  // It also removes the `__proto__` write hazard at its source rather than guarding it: with no
  // prototype there is no inherited setter, so `result[key] = value` stores an own property like
  // any other key instead of re-parenting the record onto whatever the caller supplied. The
  // explicit skips below are kept anyway — they cost one comparison and they keep the copy loops
  // correct on their own terms, rather than depending on the record's shape from a distance.
  const result: AnyRecord = {__proto__: null};

  for (const key in defaultVariants) {
    if (key === "__proto__") continue;

    result[key] = defaultVariants[key];
  }

  if (props) {
    for (const key in props) {
      if (key === "__proto__") continue;

      if (props[key] !== undefined) result[key] = props[key];
    }
  }

  if (slotProps) {
    for (const key in slotProps) {
      if (key === "__proto__") continue;

      if (slotProps[key] !== undefined) result[key] = slotProps[key];
    }
  }

  return result;
};

const isNullishOrFalse = (value: any): boolean => value == null || value === false;

const matchesCompoundValue = (expected: any, actual: any): boolean => {
  if (!Array.isArray(expected)) {
    return expected === actual || (isNullishOrFalse(expected) && isNullishOrFalse(actual));
  }

  for (let i = 0; i < expected.length; i++) {
    const expectedValue = expected[i];

    if (expectedValue === actual || (isNullishOrFalse(expectedValue) && isNullishOrFalse(actual))) {
      return true;
    }
  }

  return false;
};

const getVariantValue = (
  variant: CompiledVariant,
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  slotProps?: AnyRecord,
): any => {
  if (variant.isEmpty) return null;

  const variantProp = slotProps?.[variant.key] ?? props?.[variant.key];

  if (variantProp === null) return null;

  const variantKey = falsyToString(variantProp);

  if (typeof variantKey === "object") return null;

  const defaultVariantProp = defaultVariants?.[variant.key];
  const key = variantKey != null ? variantKey : falsyToString(defaultVariantProp);

  return variant.values[key || "false"];
};

const matchesConditions = (
  compound: CompiledCompoundVariant,
  completeProps: AnyRecord,
): boolean => {
  const {conditionKeys, source} = compound;

  for (let i = 0; i < conditionKeys.length; i++) {
    const key = conditionKeys[i];

    if (!matchesCompoundValue(source[key], completeProps[key])) return false;
  }

  return true;
};

/** A compound's `class` is either one class value or a per-slot map of them. */
type SlotClassMap = Readonly<Record<string, CnOptions[number]>>;
type CompoundClassValue = CnOptions[number] | SlotClassMap;

const isAddressable = (value: CompoundClassValue): value is SlotClassMap | CnOptions =>
  value !== null && typeof value === "object";

const pushCompoundClassForSlot = (
  result: CnOptions,
  slotKey: string,
  classValue: CompoundClassValue,
): void => {
  // A bare string belongs to the base slot only; a map names the slots it applies to.
  if (typeof classValue === "string") {
    if (slotKey === "base") result.push(classValue);

    return;
  }

  if (!isAddressable(classValue)) return;

  // An ARRAY is addressed by index, not by property name: a slot called `length` must not reach
  // the array's own length and emit it as a class. `Number` gives NaN for any non-index name,
  // and no element answers to that.
  const forSlot = Array.isArray(classValue) ? classValue[Number(slotKey)] : classValue[slotKey];

  if (forSlot) result.push(forSlot);
};

const getVariantClassNames = (
  variants: CompiledVariant[],
  defaultVariants: AnyRecord,
  props?: AnyRecord,
): CnOptions => {
  const result = frame.variantClasses;

  result.length = 0;

  for (let i = 0; i < variants.length; i++) {
    const value = getVariantValue(variants[i], defaultVariants, props);

    if (value) result.push(value);
  }

  return result;
};

const getVariantClassNamesBySlot = (
  slotKey: string,
  variants: CompiledVariant[],
  defaultVariants: AnyRecord,
  props?: AnyRecord,
  slotProps?: AnyRecord,
): CnOptions => {
  const result = frame.variantClasses;

  result.length = 0;

  for (let i = 0; i < variants.length; i++) {
    const variantValue = getVariantValue(variants[i], defaultVariants, props, slotProps);
    const value =
      slotKey === "base" && typeof variantValue === "string"
        ? variantValue
        : variantValue && variantValue[slotKey];

    if (value) result.push(value);
  }

  return result;
};

const getCompoundVariantClasses = (
  compoundVariants: CompiledCompoundVariant[],
  completeProps: AnyRecord,
): CnOptions => {
  const result = frame.compoundClasses;

  result.length = 0;

  for (let i = 0; i < compoundVariants.length; i++) {
    const compoundVariant = compoundVariants[i];

    if (!matchesConditions(compoundVariant, completeProps)) continue;
    if (compoundVariant.source.class) result.push(compoundVariant.source.class);
    if (compoundVariant.source.className) result.push(compoundVariant.source.className);
  }

  return result;
};

const getCompoundVariantClassesBySlot = (
  slotKey: string,
  compoundVariants: CompiledCompoundVariant[],
  completeProps: AnyRecord,
): CnOptions => {
  const result = frame.compoundVariantBySlot;

  result.length = 0;

  for (let i = 0; i < compoundVariants.length; i++) {
    const compoundVariant = compoundVariants[i];

    if (!matchesConditions(compoundVariant, completeProps)) continue;

    pushCompoundClassForSlot(result, slotKey, compoundVariant.source.class);
    pushCompoundClassForSlot(result, slotKey, compoundVariant.source.className);
  }

  return result;
};

const getCompoundSlotClasses = (
  compoundSlotsForKey: CompiledCompoundSlot[],
  completeProps: AnyRecord,
): CnOptions => {
  const result = frame.compoundSlotClasses;

  result.length = 0;

  for (let i = 0; i < compoundSlotsForKey.length; i++) {
    const compoundSlot = compoundSlotsForKey[i];

    if (!matchesConditions(compoundSlot, completeProps)) continue;

    if (compoundSlot.source.class) result.push(compoundSlot.source.class);
    if (compoundSlot.source.className) result.push(compoundSlot.source.className);
  }

  return result;
};

const createPlainResolver = (resolved: ResolvedOptions, cn: CnAdapter): RuntimeComponent => {
  const {base, config} = resolved;
  let core: string | undefined | typeof CACHE_MISS = CACHE_MISS;
  const overrideMerge = createLazyOverrideMerge(cn, config);

  return ((props?: AnyRecord): RuntimeResult => {
    if (core === CACHE_MISS) {
      core = cn(config, base);
    }

    return overrideMerge(core, props);
  }) as RuntimeComponent;
};

const createVariantResolver = (resolved: ResolvedOptions, cn: CnAdapter): RuntimeComponent => {
  const {base, config, defaultVariants, deferredError} = resolved;
  let compiled: CompiledState | null = null;
  let compounds: CompoundIndex = EMPTY_COMPOUND_INDEX;
  let cache: BoundedCache<CacheValue> | null = null;
  let tracker: CompoundsTracker | null = null;
  let dependencyKeys: string[] | null = null;
  // Taken from the COMPILED state, never from `resolved` — the latter is the array published as
  // `component.variantKeys`, and a consumer mutating it in place would re-key every later result.
  let variantKeys: string[] = EMPTY_ARRAY;
  // The last call's dependency VALUES and the core they resolved to — an L1 in front of the keyed
  // cache. The dominant shape in a React app is a re-render with the same values, and that call
  // currently pays a full key build plus a Map hash only to discover it already has the answer.
  // Comparing the values it just read is a few pointer compares and no allocation.
  //
  // Two arrays, swapped rather than copied, so the steady state allocates nothing at all.
  let currentValues: unknown[] = [];
  let previousValues: unknown[] = [];
  let hasPreviousValues = false;
  let previousCore: CacheValue;
  const overrideMerge = createLazyOverrideMerge(cn, config);
  // First invoke skips cache.
  let coldInvokesRemaining = 1;

  const prepare = (): CompiledState => {
    if (compiled !== null) return compiled;

    const state = compileResolvedOptions(resolved);

    compiled = state;
    compounds = state.compounds;
    variantKeys = state.variantKeys;

    return state;
  };

  /**
   * Whether this call needs change detection, asked PER CALL rather than fixed at compile time.
   *
   * A definition built with an empty `compoundVariants` used to decide once that it would never
   * need a tracker, so a compound pushed onto that array afterwards could not be seen however many
   * calls followed. Two property reads answer it instead.
   *
   * Sticky once a tracker exists, so a list that shrinks back to empty still reports the shrink —
   * otherwise the last compound could be removed and the cache would go on serving it.
   */
  const needsChangeDetection = (): boolean =>
    tracker !== null || resolved.compoundVariants.length > 0;

  // `dependencyKeys` is derived on first USE rather than in `prepare()`, so a definition that is
  // built and never called does not pay for a key nobody asks for. Both invoke paths need it —
  // the cold one captures too — so in practice it is derived on the first call either way.
  const trackerFor = (): CompoundsTracker =>
    (tracker ??= createCompoundsTracker(resolved.compoundVariants, EMPTY_ARRAY, () => {
      // Both derivations computed BEFORE either is published, then assigned with nothing between
      // them: consumer code runs during the rebuild, so a reader must never find one moved and
      // the other not.
      const next = refreshCompoundIndex(resolved.compoundVariants, resolved.compoundSlots);
      const nextKeys = collectDependencyKeys(variantKeys, next.compoundVariants, EMPTY_ARRAY);

      compounds = next;
      if (!sameDependencyKeys(dependencyKeys, nextKeys)) dependencyKeys = nextKeys;
      // Dropping the cache beats re-keying it — the metadata is identical for every entry, so
      // folding it into each key leaves the superseded ones occupying the cache, unreachable.
      cache?.clear();
      // The L1 needs no clearing here: `takeChange()` returns "changed" on this path and the fast
      // path is gated on "unchanged", so it cannot be consulted before the recompute republishes
      // it. Verified by deleting this line and watching nothing change.
    }));

  const computeCore = (
    state: CompiledState,
    index: CompoundIndex,
    props?: AnyRecord,
  ): string | undefined => {
    enterResolveFrame();

    try {
      const compoundClasses =
        index.compoundVariants.length > 0
          ? getCompoundVariantClasses(
              index.compoundVariants,
              getCompleteProps(defaultVariants, props),
            )
          : undefined;

      return cn(
        config,
        base,
        getVariantClassNames(state.variants, defaultVariants, props),
        compoundClasses,
      );
    } finally {
      releaseResolveFrame();
    }
  };

  return ((props?: AnyRecord): RuntimeResult => {
    if (deferredError) throw deferredError;

    const state = prepare();

    let core: string | undefined;

    if (coldInvokesRemaining > 0) {
      coldInvokesRemaining--;
      // Captured, exactly as the slots resolver's cold path already does, so BOTH invoke paths
      // resolve from the same shape. Handing the raw object through here instead is cheaper — it
      // skips a `collectDependencyKeys` on the one call with no key to build — and it is what made
      // the two paths disagree about inherited props: a capture reads each dependency key BY NAME
      // and so sees an inherited member whether or not it is enumerable, while `getCompleteProps`'
      // `for...in` over the caller's own object sees only the enumerable ones. The same definition
      // and the same props then resolved differently on the first call than on every later one.
      //
      // Symmetry here is what lets that record carry no prototype, which is the whole of
      // contribution 111: with the misses no longer read off `Object.prototype`, `undefined` means
      // "not supplied" for `toString` and its seven siblings as it already did for every other name.
      dependencyKeys ??= collectDependencyKeys(
        variantKeys,
        compounds.compoundVariants,
        EMPTY_ARRAY,
      );

      readDependencyValues(dependencyKeys, defaultVariants, currentValues, props);

      core = computeCore(
        state,
        compounds,
        capturePropsSnapshot(dependencyKeys, currentValues).captured,
      );
    } else {
      cache ??= createBoundedCache<CacheValue>();
      dependencyKeys ??= collectDependencyKeys(
        variantKeys,
        compounds.compoundVariants,
        EMPTY_ARRAY,
      );

      // One read per dependency prop, feeding the comparison, the key AND the resolve.
      const keysBefore = dependencyKeys;

      readDependencyValues(dependencyKeys, defaultVariants, currentValues, props);

      // `indeterminate` means a getter in the metadata re-entered this component, so detection
      // could not run. Recomputing without touching the cache is the only answer that is neither
      // stale nor destructive: dropping the cache on every such call would stop results ever
      // stabilising, and trusting it could serve output the mutation invalidated.
      const change = needsChangeDetection() ? trackerFor().takeChange() : "unchanged";

      // L1: the same values as last time, and nothing moved underneath them. Answer from the last
      // core without building a key or touching the Map — the shape a React re-render actually is.
      // Checked AFTER detection, because a metadata change invalidates this exactly as it does the
      // keyed cache, and after the key-set check below cannot apply, because a widened set means
      // `currentValues` is short and the comparison would read past it.
      if (
        change === "unchanged" &&
        hasPreviousValues &&
        dependencyKeys === keysBefore &&
        sameDependencyValues(previousValues, currentValues, dependencyKeys.length)
      ) {
        return overrideMerge(previousCore, props);
      }

      // Detection can WIDEN the dependency set: a compound that gained a condition key conditions
      // on a prop the read above never looked at. Re-read whole rather than patched, so the key
      // and the values it labels still come from one pass over the props.
      if (dependencyKeys !== keysBefore) {
        readDependencyValues(dependencyKeys, defaultVariants, currentValues, props);
        hasPreviousValues = false;
      }

      const {captured, fingerprint} = capturePropsSnapshot(dependencyKeys, currentValues);

      if (fingerprint !== null && change !== "indeterminate") {
        const cached = cache.get(fingerprint);

        if (cached !== CACHE_MISS) {
          core = cached;
        } else {
          // Sampled here, checked before the write. Resolving runs consumer code, and a nested
          // resolve it triggers can accept a metadata change, clear the cache and store the
          // correct answer. This call's classes were collected against the view above, so writing
          // them would land a superseded value on top of that correct one — permanently, because
          // the change has been accepted and is never reported again.
          const resolvedAgainst = compounds;

          core = computeCore(state, resolvedAgainst, captured);

          if (compounds === resolvedAgainst) cache.set(fingerprint, core);
        }

        // Publish to the L1 only on the keyable path. An unkeyable call is a deliberate cache
        // BYPASS — its value compares by identity and the next call with an equal-looking object
        // is a different value to resolution — so remembering it would answer a later call from a
        // result that was never filed under anything.
        const swap = previousValues;

        previousValues = currentValues;
        currentValues = swap;
        previousCore = core;
        hasPreviousValues = true;
      } else {
        core = computeCore(state, compounds, captured);
        hasPreviousValues = false;
      }
    }

    return overrideMerge(core, props);
  }) as RuntimeComponent;
};

type SlotsResult = Record<string, (slotProps?: AnyRecord) => string | undefined>;
type SlotComputer = (
  index: CompoundIndex,
  propsRef?: AnyRecord,
  slotProps?: AnyRecord,
) => string | undefined;

/**
 * Everything a slots component needs after its definition compiles.
 *
 * One bundle rather than independently-nullable locals: they are produced together in one pass and
 * are meaningless apart, so the bundle's type is the proof that all of it is present.
 */
type PreparedSlots = {
  slotKeys: string[];
  computers: SlotComputer[];
  overrideMerge: ReturnType<typeof createLazyOverrideMerge>;
};

const createSlotsResolver = (resolved: ResolvedOptions, cn: CnAdapter): RuntimeComponent => {
  const {config, defaultVariants, deferredError, slots} = resolved;

  let prepared: PreparedSlots | null = null;
  let compounds: CompoundIndex = EMPTY_COMPOUND_INDEX;
  let dependencyKeys: string[] = EMPTY_ARRAY;
  // From the COMPILED state, not `resolved` — see the variants resolver's note.
  let variantKeys: string[] = EMPTY_ARRAY;
  // Reused across calls, so reading the dependency props allocates nothing in the steady state.
  let slotsValues: unknown[] = [];
  // The L1, as on the variants resolver: the last call's dependency values and the RESULT they
  // produced. Returning the same result object is already this branch's documented behaviour —
  // the keyed cache hands back one object per key — so this changes nothing a consumer can see.
  let previousSlotsValues: unknown[] = [];
  let hasPreviousSlots = false;
  let previousSlotsResult: SlotsResult | undefined;
  const captureSlotsProps = (keys: string[], props?: AnyRecord) => {
    readDependencyValues(keys, defaultVariants, slotsValues, props);

    return capturePropsSnapshot(keys, slotsValues);
  };
  let parentCache: ReturnType<typeof createBoundedCache<SlotsResult>> | null = null;
  let tracker: CompoundsTracker | null = null;
  // First parent invoke skips fingerprint/cache setup (lifecycle create+call once).
  let coldParentInvokesRemaining = 1;

  const prepare = (): PreparedSlots => {
    if (prepared !== null) return prepared;

    const compiled = compileResolvedOptions(resolved);
    const variants = compiled.variants;
    const {slotKeys} = compiled;

    compounds = compiled.compounds;
    variantKeys = compiled.variantKeys;

    const overrideMerge = createLazyOverrideMerge(cn, config);

    // One computer per slot for the lifetime of this tv() instance.
    const computers: SlotComputer[] = new Array(slotKeys.length);

    for (let i = 0; i < slotKeys.length; i++) {
      const slotKey = slotKeys[i];

      computers[i] = (index, propsRef, slotProps) => {
        enterResolveFrame();

        try {
          // Read from the INDEX this computer was handed, not from a flag fixed when the
          // definition compiled: the index is rebuilt from the consumer's live arrays whenever
          // detection fires, so a compound pushed after the first call is present here.
          const completeProps =
            index.compoundVariants.length > 0 || index.compoundSlots.length > 0
              ? getCompleteProps(defaultVariants, propsRef, slotProps)
              : undefined;
          const compoundVariantClasses = completeProps
            ? getCompoundVariantClassesBySlot(slotKey, index.compoundVariants, completeProps)
            : undefined;
          const compoundSlotClasses = completeProps
            ? getCompoundSlotClasses(index.bySlot[slotKey] ?? EMPTY_ARRAY, completeProps)
            : undefined;

          return cn(
            config,
            slots[slotKey],
            getVariantClassNamesBySlot(slotKey, variants, defaultVariants, propsRef, slotProps),
            compoundVariantClasses,
            compoundSlotClasses,
          );
        } finally {
          releaseResolveFrame();
        }
      };
    }

    dependencyKeys = collectDependencyKeys(
      variantKeys,
      compounds.compoundVariants,
      compounds.compoundSlots,
    );
    prepared = {slotKeys, computers, overrideMerge};

    return prepared;
  };

  /**
   * The slots twin of the variants resolver's derivation, and it reads BOTH arrays: either one can
   * gain its first entry after the definition was built, and a `compoundSlots` push is as invisible
   * to a compile-time flag as a `compoundVariants` one.
   */
  const needsChangeDetection = (): boolean =>
    tracker !== null || resolved.compoundVariants.length > 0 || resolved.compoundSlots.length > 0;

  const trackerFor = (): CompoundsTracker =>
    (tracker ??= createCompoundsTracker(resolved.compoundVariants, resolved.compoundSlots, () => {
      // Both derivations computed BEFORE either is published, then assigned with nothing between
      // them. Rebuilding the index reads consumer `slots` getters, so a reader can arrive while
      // this runs; it must never find the matcher's key sets moved and the per-slot index not,
      // which would let a compound match and then apply to nothing.
      const next = refreshCompoundIndex(resolved.compoundVariants, resolved.compoundSlots);
      const nextKeys = collectDependencyKeys(
        variantKeys,
        next.compoundVariants,
        next.compoundSlots,
      );

      compounds = next;
      if (!sameDependencyKeys(dependencyKeys, nextKeys)) dependencyKeys = nextKeys;
      // Dropping the cache beats re-keying it — the metadata is identical for every entry, so
      // folding it into each key leaves the superseded ones occupying the cache, unreachable.
      parentCache?.clear();
      // The L1 holds a result built against the superseded index. Unlike the variants resolver's,
      // this one IS reachable after the change: a slot function captured the old index, so the
      // stale result would keep rendering from it.
      hasPreviousSlots = false;
    }));

  const createSlotsResult = (
    ready: PreparedSlots,
    index: CompoundIndex,
    captured?: AnyRecord,
  ): SlotsResult => {
    const {slotKeys, computers, overrideMerge} = ready;
    const result: SlotsResult = {};

    for (let i = 0; i < slotKeys.length; i++) {
      const compute = computers[i];
      // Both the props and the compound index are captured per result instance. A slot function
      // is called long after the parent call that made it, interleaved with other results and
      // with metadata mutations, and reading either from the resolver would make the same slot
      // function answer differently depending on what happened elsewhere in between.
      const core = compute(index, captured);

      const slotFunction = (slotProps?: AnyRecord): string | undefined => {
        if (slotProps == null) return core;

        let hasVariantOverride = false;

        for (const key in slotProps) {
          if (key === "class" || key === "className") continue;
          if (slotProps[key] !== undefined) {
            hasVariantOverride = true;
            break;
          }
        }

        if (!hasVariantOverride) {
          return overrideMerge(core, slotProps);
        }

        // The caller's own object, deliberately. `getCompleteProps` refuses `__proto__` itself, so
        // there is nothing here for a capture to protect against — and capturing per slot call
        // measured 44% on this path, for a guarantee one comparison already gives.
        return overrideMerge(compute(index, captured, slotProps), slotProps);
      };

      // `__proto__` is the ONE name a plain assignment cannot store: it runs the inherited setter,
      // re-parenting the result onto the slot function, so the slot vanishes from `Object.keys` and
      // a later slot named `name` or `length` then throws `Cannot assign to read only property`.
      // `defineProperty` creates an own property and leaves the prototype alone, which is what
      // makes every other name safe to assign normally.
      //
      // Guarded rather than applied to every slot, because `defineProperty` costs 289 ns per
      // three-slot result against 20 ns for assignment — 14x, paid on every uncached slots call.
      // Guarding only the name that needs it measures 23 ns.
      const slotKey = slotKeys[i];

      if (slotKey === "__proto__") {
        Object.defineProperty(result, slotKey, {
          configurable: true,
          enumerable: true,
          value: slotFunction,
          writable: true,
        });
      } else {
        result[slotKey] = slotFunction;
      }
    }

    return result;
  };

  return ((props?: AnyRecord): RuntimeResult => {
    if (deferredError) throw deferredError;

    const ready = prepare();

    // Cold path: avoid fingerprint/tracker/Map overhead on first invoke. The props are still
    // captured — the result outlives this call whether or not it is cached, so holding the
    // caller's own object would pin whatever else it carries.
    if (coldParentInvokesRemaining > 0) {
      coldParentInvokesRemaining--;

      return createSlotsResult(ready, compounds, captureSlotsProps(dependencyKeys, props).captured);
    }

    // The props are read FIRST because reading them runs the caller's getters, and one of those
    // can mutate the metadata. Detecting before that point would accept the old state and serve
    // this call from an entry the mutation has already invalidated. One read each, feeding both
    // the key and the resolve — see PropsSnapshot.
    const keysBefore = dependencyKeys;

    readDependencyValues(dependencyKeys, defaultVariants, slotsValues, props);

    // Then detected, still AHEAD of the unkeyable early return: the slot index the computers read
    // is derived from this same metadata, so a call that bypasses the CACHE must not also bypass
    // DETECTION or it renders from a stale index.
    const change = needsChangeDetection() ? trackerFor().takeChange() : "unchanged";

    // Detection can WIDEN the dependency set: a compound that gained a condition key conditions on
    // a prop the snapshot above never read. Re-taken whole rather than patched, so the key and the
    // values it labels still come from one pass over the props.
    if (dependencyKeys !== keysBefore) {
      readDependencyValues(dependencyKeys, defaultVariants, slotsValues, props);
      hasPreviousSlots = false;
    }

    // L1: the same values as last time, and nothing moved underneath them. Answers without
    // building a key or touching the Map — the shape a React re-render actually is. Handing back
    // the same result object is what the keyed cache below already does, so nothing new is visible.
    if (
      change === "unchanged" &&
      hasPreviousSlots &&
      dependencyKeys === keysBefore &&
      previousSlotsResult !== undefined &&
      sameDependencyValues(previousSlotsValues, slotsValues, dependencyKeys.length)
    ) {
      return previousSlotsResult;
    }

    const {captured, fingerprint} = capturePropsSnapshot(dependencyKeys, slotsValues);

    // `indeterminate` is a re-entrant ask: detection could not run, so this call is resolved
    // fresh and left out of the cache entirely rather than dropping everything already in it.
    if (fingerprint === null || change === "indeterminate") {
      return createSlotsResult(ready, compounds, captured);
    }

    parentCache ??= createBoundedCache<SlotsResult>();

    const publish = (result: SlotsResult): SlotsResult => {
      // Swapped rather than copied, so the steady state allocates nothing.
      const swap = previousSlotsValues;

      previousSlotsValues = slotsValues;
      slotsValues = swap;
      previousSlotsResult = result;
      hasPreviousSlots = true;

      return result;
    };

    const cached = parentCache.get(fingerprint);

    if (cached !== CACHE_MISS) return publish(cached);

    // Sampled here, checked before the write. Building a result runs consumer code, and a nested
    // resolve it triggers can accept a metadata change, clear the cache and store the correct
    // answer. This result was built against the view above, so writing it would land a superseded
    // value on top of that correct one — permanently, because the change has been accepted and is
    // never reported again.
    const resolvedAgainst = compounds;
    const next = createSlotsResult(ready, resolvedAgainst, captured);

    if (compounds === resolvedAgainst) parentCache.set(fingerprint, next);

    return publish(next);
  }) as RuntimeComponent;
};

export const createClassResolver = (resolved: ResolvedOptions, cn: CnAdapter): RuntimeComponent => {
  // Read once into a const, because narrowing `resolved.mode` does not survive into the deferred
  // closure below: `resolved` is a mutable reference, so TypeScript must assume the field could
  // change between here and the call. Off the const the `switch` narrows, which is what makes its
  // `never` default a real check rather than an unreachable formality.
  const {mode} = resolved;

  if (mode === "plain") return createPlainResolver(resolved, cn);

  let resolver: RuntimeComponent | undefined;

  const createResolver = (): RuntimeComponent => {
    switch (mode) {
      case "slots":
        return createSlotsResolver(resolved, cn);
      case "variants":
        return createVariantResolver(resolved, cn);
      default: {
        // Adding a mode becomes a compile error here rather than a call silently resolving as
        // though it were a variants component.
        const unreachable: never = mode;

        throw new TypeError(`Unknown resolver mode: ${String(unreachable)}`);
      }
    }
  };

  // Defer slots/variants resolver setup until first call so tv() construction stays cheap.
  return ((props?: AnyRecord): RuntimeResult => {
    resolver ??= createResolver();

    return resolver(props);
  }) as RuntimeComponent;
};
