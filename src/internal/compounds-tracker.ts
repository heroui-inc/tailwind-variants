import type {AnyRecord, CompiledCompoundSlot, CompiledCompoundVariant} from "./types.js";

/**
 * Four bounds, because no one of them is sufficient and each covers what the others cannot. One is
 * a data structure; the three below it are numbers, and those three are configurable.
 *
 * The VISITED SET is not in here and is not negotiable: each object is walked once per walk, so a
 * cycle terminates and a shared node is not re-walked per path. Without it an object referencing
 * itself through TWO keys is revisited 2^depth times, and every revisit pays the FULL cost of
 * enumerating its keys — 20k non-enumerable keys plus a two-key cycle measured at 11.5 SECONDS for
 * one call. Key enumeration happens before any per-key work, so a step counter cannot meter it;
 * only not doing it again can.
 *
 * Read ONCE per tracker, into locals, so the hot loop never touches this object and a component's
 * bounds cannot move under a walk already in flight. Changing them affects components created
 * afterwards, which is the granularity a consumer can reason about.
 *
 * Deliberately explicit rather than derived from anything about the machine. These decide whether
 * metadata goes on being WATCHED — past one, the component reports "changed" for ever and stops
 * caching, which is permanent and observable. Derived from free memory that becomes a property of
 * the host: the same definition caches on one box and not on another, and no bug report
 * reproduces. Set by the consumer it is a deterministic choice they can write down.
 *
 * **Raising `steps` is almost never the answer, and the numbers say so.** A 1,000-compound
 * component spends 0.095% of it per walk; a realistic design-system button with 20–40 compounds
 * spends 0.002–0.004%. Nothing a component library produces comes within three orders of magnitude
 * of the ceiling, and the cost that actually grows — the walk itself — is linear and paid on every
 * call long before any bound fires: 300,000 compounds measured 62 ms per call and 600,000 measured
 * 144 ms, both UNDER the default `steps` and so both un-truncated. If a component is slow, the
 * ceiling is not what is making it slow.
 */
export type MetadataBounds = {
  /** Recursion limit for metadata that nests without repeating. A visited set cannot bound it. */
  depth: number;
  /**
   * Work ceiling, for metadata that MINTS a fresh object per read so nothing is ever revisited —
   * the only shape a visited set cannot terminate. Removing it OOMs at 2 GB after 18 seconds.
   */
  steps: number;
  /**
   * Prototype-chain levels beyond an object literal's, past which the walk stops.
   *
   * The other three meter the walk in STEPS, and a step's cost is the consumer's to choose:
   * `for...in` shadow-checks every key it yields against every object above it, so one object on a
   * deep chain costs O(keys x depth) while spending only O(keys) of the budget. The same 1,000,001
   * steps measured 107 ms over own keys and 2,254 ms over a 200-deep chain — per call, for ever,
   * with the cache hitting throughout. A plain object literal is 0 and a two-level `Object.create`
   * chain is 1, so 8 is far above anything a class definition produces.
   */
  prototypeExcess: number;
};

export const metadataBounds: MetadataBounds = {
  depth: 256,
  steps: 1 << 20,
  prototypeExcess: 8,
};

const OBJECT_MARK = Symbol("tv-object");
const ARRAY_MARK = Symbol("tv-array");
const END_MARK = Symbol("tv-end");
const DEPTH_MARK = Symbol("tv-depth");
const BUDGET_MARK = Symbol("tv-budget");
const SEEN_MARK = Symbol("tv-seen");

/**
 * A stable token per function, held weakly so recording one never keeps its closure alive.
 *
 * Module-level and shared: two components that reference the same function agree on its token,
 * and the map holds no strong reference, so a function is collectable the moment the consumer
 * drops it even though a snapshot still names it.
 */
const functionIdentities = new WeakMap<object, symbol>();

/**
 * How many levels the chain above `value` has BEYOND the one an object literal carries.
 *
 * A plain `{}` answers 0 and `Object.create(null)` answers 0, so ordinary metadata is charged
 * nothing and the bound never fires on it. The walk itself is O(result), and it stops as soon as
 * the answer exceeds the bound, so measuring can never become the expensive thing.
 */
const prototypeChainExcess = (value: object, limit: number): number => {
  let excess = 0;
  let current: object | null = Object.getPrototypeOf(value) as object | null;

  while (current !== null && excess <= limit) {
    current = Object.getPrototypeOf(current) as object | null;

    if (current !== null) excess++;
  }

  return excess;
};

const identityOf = (value: object): symbol => {
  const existing = functionIdentities.get(value);

  if (existing !== undefined) return existing;

  const token = Symbol("tv-fn");

  functionIdentities.set(value, token);

  return token;
};

/**
 * Three outcomes, not two. `indeterminate` is what a re-entrant ask returns: the walk that would
 * answer the question is already in flight, so the tracker genuinely does not know. Collapsing it
 * into `changed` is not merely conservative — it makes every call of a self-re-entrant component
 * drop its cache, so results never stabilise and downstream memoisation never holds.
 */
export type CompoundsChange = "unchanged" | "changed" | "indeterminate";

export type CompoundsTracker = {
  /**
   * Reports whether compound metadata changed since the last change that was fully applied.
   *
   * "Applied", not "asked": a change is accepted only once `applyChange` has returned. Anything
   * that runs consumer code can throw — and every step of applying one does — so accepting on
   * detection would let a single throwing getter lose the invalidation permanently, leaving the
   * tracker answering `unchanged` forever over metadata it knows has moved.
   */
  takeChange(): CompoundsChange;
};

/**
 * Allocation-free change detector over compound metadata.
 *
 * `applyChange` is called from inside the walk that detected the change, before it is accepted,
 * which is what makes "detected" and "applied" a single step that either both happen or neither
 * does. It runs with the re-entrancy latch still held, so a getter it triggers that calls back
 * into the component is answered `indeterminate` — resolved fresh — rather than being served from
 * state that is halfway through being rebuilt.
 */
export const createCompoundsTracker = (
  compoundVariants: CompiledCompoundVariant[],
  compoundSlots: CompiledCompoundSlot[],
  applyChange: () => void,
): CompoundsTracker => {
  // Read ONCE, into locals. Two reasons, and the second is the load-bearing one: the hot loop then
  // reads a local rather than a module property on every step, and a component's bounds cannot
  // move under a walk that is already in flight — which would let one walk record against one
  // limit and the next compare against another, so the snapshot would differ for a reason that has
  // nothing to do with the metadata.
  const maxDepth = metadataBounds.depth;
  const maxSteps = metadataBounds.steps;
  const maxPrototypeExcess = metadataBounds.prototypeExcess;
  const snapshot: unknown[] = [];
  let initialized = false;
  let cursor = 0;
  let depth = 0;
  let recording = false;
  let mismatched = false;
  let walking = false;
  let steps = 0;
  let halted = false;
  let truncated = false;
  let unbounded = false;
  // Reused across walks so the steady state allocates nothing, and emptied on the way out so it
  // never pins consumer metadata between calls.
  const visited = new Set<object>();

  // Comparing is the steady state and writes nothing; recording only runs after a change.
  //
  // Also where the step ceiling is spent. It is the LAST of the three bounds, not the main one:
  // work that never reaches a value — enumerating an object's keys — cannot be charged here, so
  // a counter alone was never enough.
  const visit = (value: unknown): void => {
    if (halted) return;

    // Spending the last step writes ONE terminal mark instead of the value, and flags the walk as
    // having stopped short of the metadata's end.
    let recorded = value;

    if (steps >= maxSteps) {
      halted = true;
      truncated = true;
      recorded = BUDGET_MARK;
    } else {
      steps++;
    }

    if (recording) {
      snapshot[cursor++] = recorded;

      return;
    }

    const previous = snapshot[cursor];

    // NaN is not equal to itself: a bare `!==` would report a change every call and silently
    // disable the cache. 0 and -0 stay equal, as they are to resolution.
    if (previous !== recorded && (previous === previous || recorded === recorded)) {
      mismatched = true;
      // The verdict is settled and the rest of a compare walk cannot change it, so stopping here
      // halves the consumer getter reads a changed ask costs. `cursor` is only compared against
      // the snapshot length when nothing mismatched, so leaving it short is harmless.
      halted = true;
    }

    cursor++;
  };

  const walkValue = (value: unknown): void => {
    if (halted) return;

    // A function condition is compared by identity, so the snapshot needs something that
    // distinguishes it — but storing the function itself keeps its whole closure alive until the
    // next walk overwrites the slot, which for a component that is mutated and then never called
    // again is forever. An identity token is as good for comparison and holds nothing.
    if (typeof value === "function") {
      visit(identityOf(value));

      return;
    }

    if (value === null || typeof value !== "object") {
      visit(value);

      return;
    }

    // Walked once per walk. A second encounter records a mark rather than descending, which is
    // what makes a cycle terminate and stops a shared node being re-enumerated once per path.
    // Detection is unaffected: a change inside the object is still seen at its first encounter.
    if (visited.has(value)) {
      visit(SEEN_MARK);

      return;
    }

    // Keeps the recursion off the stack for metadata that nests without ever repeating, which
    // the visited set above cannot bound because every level is a genuinely new object.
    //
    // Checked BEFORE the node is marked seen. Marking one the walk then refuses to enumerate
    // would make every later, shallower reference to it record "seen" as well, so its contents
    // are walked zero times in every walk and a change inside it is invisible permanently.
    if (depth >= maxDepth) {
      truncated = true;
      visit(DEPTH_MARK);
      // Halted, like the other two truncating bounds. The verdict is already settled — `truncated`
      // latches `unbounded`, so this walk's remaining reads cannot change the answer — and
      // `walkProperty` exists precisely so that consumer getters do not fire once that is true.
      // Without this the walk carried on enumerating siblings after giving up, which is the same
      // defect that rule was written for, one bound over.
      halted = true;

      return;
    }

    visited.add(value);
    depth++;

    if (Array.isArray(value)) {
      visit(ARRAY_MARK);

      for (let i = 0; i < value.length && !halted; i++) walkValue(value[i]);
    } else {
      visit(OBJECT_MARK);

      // Checked BEFORE the enumeration, because the enumeration is the cost. Past the bound the
      // walk stops entirely rather than descending: `compareThenRecord` reads `truncated` and
      // latches, so this component reports "changed" on every later ask and never walks again.
      // Slower per call than a cache hit, bounded, and never silently stale — which is the trade
      // the depth cap and the step ceiling already make.
      if (prototypeChainExcess(value, maxPrototypeExcess) > maxPrototypeExcess) {
        truncated = true;
        halted = true;
      }

      // `for...in` over a consumer object can enumerate arbitrarily many keys, so the budget has
      // to stop the LOOP and not merely the recursion inside it.
      for (const key in value) {
        if (halted) break;

        visit(key);
        walkValue((value as AnyRecord)[key]);
      }
    }

    visit(END_MARK);
    depth--;
  };

  /**
   * Reads one property of a compound and walks it.
   *
   * The read is what needs guarding, not the walk: `walkValue` and `visit` both return early once
   * halted, but the property access happens BEFORE either of them is called, and a consumer getter
   * fires on that access. Once the verdict is settled or the budget is spent, nothing the walk
   * reads can change the answer, so reading at all is a side effect with no purpose.
   */
  const walkProperty = (source: AnyRecord, key: string): void => {
    if (halted) return;

    walkValue(source[key]);
  };

  /**
   * Walks a compound's own keys, not the condition list captured when the definition compiled.
   *
   * Which keys a compound conditions on is part of what it MEANS: deleting one widens the
   * compound, adding one narrows it. Reading the captured list can see neither — a deleted key
   * only looks like its value becoming undefined, and an added key is not read at all — so both
   * produce a wrong answer rather than a stale one. Recording the key set here is what lets the
   * resolvers recompile it on a change.
   */
  const walkCompound = (source: AnyRecord, withSlots: boolean): void => {
    for (const key in source) {
      if (halted) break;
      if (key === "class" || key === "className") continue;
      if (withSlots && key === "slots") continue;

      visit(key);
      walkProperty(source, key);
    }

    if (withSlots) walkProperty(source, "slots");

    walkProperty(source, "class");
    walkProperty(source, "className");
    visit(END_MARK);
  };

  // `recording` is set here rather than by the caller so no walk can inherit the mode of one that
  // threw part-way through.
  const walk = (isRecording: boolean): void => {
    recording = isRecording;
    visited.clear();
    cursor = 0;
    depth = 0;
    steps = 0;
    halted = false;
    truncated = false;
    mismatched = false;

    for (let i = 0; i < compoundVariants.length && !halted; i++) {
      walkCompound(compoundVariants[i].source, false);
    }

    for (let i = 0; i < compoundSlots.length && !halted; i++) {
      walkCompound(compoundSlots[i].source, true);
    }
  };

  const compareThenRecord = (): CompoundsChange => {
    // Skipped entirely once the metadata has been found larger than the walk covers: from then on
    // this tracker reports a change on every ask, because it can no longer tell that there wasn't
    // one. Everything derived from the metadata is therefore re-derived every call and nothing is
    // cached — slow, and correct.
    //
    // Saying so is the whole point. The alternative is far worse than being slow: a truncated
    // walk is a fixed prefix plus a fixed ending, so it compares equal to ITSELF for ever, and
    // everything past the bound silently stops being watched while the cache goes on serving.
    // Nested class values are in the public contract and resolution recurses them with no limit
    // at all, so a value that RENDERS would otherwise be a value nothing watches.
    if (!unbounded) {
      walk(false);

      // A walk that ended early or ran long is a shape change `mismatched` cannot see: a
      // snapshot slot past the old end reads as undefined and matches an undefined value.
      if (!truncated && initialized && !mismatched && cursor === snapshot.length) {
        return "unchanged";
      }

      // Dropped BEFORE the rewrite: a getter that throws part-way through would otherwise leave
      // a half-new snapshot whose length still matches, hiding the change forever.
      initialized = false;

      // A compare walk halts at the first mismatch, so it can stop short of the metadata that
      // would have truncated it. Only a walk that ran to the end can rule truncation out.
      if (!truncated) walk(true);

      if (truncated) {
        // Latched, so an oversized definition pays for one full walk rather than one per call.
        unbounded = true;
        snapshot.length = 0;
      } else {
        snapshot.length = cursor;
      }
    }

    // Applied while still uninitialized, so a throw in here leaves the change UNACCEPTED and the
    // next ask reports it again. Acceptance is the last statement for that reason.
    applyChange();
    initialized = !unbounded;

    return "changed";
  };

  return {
    takeChange() {
      // A getter in the metadata can call back into this component. A re-entrant walk would
      // splice two traversals into one snapshot and never converge, so this one does not walk at
      // all — it reports that it cannot tell, and leaves the outer walk untouched. The caller
      // answers by bypassing the cache for this call rather than dropping it.
      //
      // Outside the `try` below on purpose: its cleanup empties the visited set, which the walk
      // already in flight is still using.
      if (walking) return "indeterminate";

      walking = true;

      try {
        return compareThenRecord();
      } finally {
        walking = false;
        // In a `finally` because a consumer getter can throw from anywhere in a walk, and an
        // exception would otherwise leave the set holding every object the walk had reached until
        // the next ask — which for a component nobody calls again is forever.
        visited.clear();
      }
    },
  };
};
