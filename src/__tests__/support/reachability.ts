/**
 * Reachability assertions for the memoisation layer.
 *
 * A cache bug that RETAINS is invisible to every assertion about class strings, exactly as a
 * cache bug that stops caching is. The only direct evidence is whether a dropped object can still
 * be reached, which needs a real collection — so these helpers are gated on `--expose-gc` and
 * report honestly when it is absent rather than passing vacuously.
 *
 * Run them with `pnpm test:leak`.
 */
export const gcAvailable = typeof globalThis.gc === "function";

const collect = async (): Promise<void> => {
  const runGc = globalThis.gc;

  if (runGc === undefined) throw new Error("gc is not exposed; run with --expose-gc");

  // Several cycles with a turn of the event loop between them: one pass does not reliably clear
  // a young-generation object that a finalizer is waiting on.
  for (let pass = 0; pass < 4; pass++) {
    runGc();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

/**
 * Reports whether the value produced by `create` is still reachable after `use` has run and the
 * value itself has gone out of scope.
 *
 * `create` must return a FRESH object each call and `use` must not close over it, or the test
 * measures its own harness rather than the subject.
 */
export const isRetainedAfter = async <T extends object>(
  create: () => T,
  use: (value: T) => void,
): Promise<boolean> => {
  let collected = false;
  const registry = new FinalizationRegistry(() => {
    collected = true;
  });

  // Scoped so the only strong reference dies with the block.
  ((): void => {
    const value = create();

    registry.register(value, "probe");
    use(value);
  })();

  await collect();

  return !collected;
};

/**
 * How many of `probes` are still reachable after a collection.
 *
 * The many-probe counterpart of `isRetainedAfter`: a bound is a claim about a POPULATION, so the
 * cases that assert one count survivors rather than ask about a single object. Every probe must be
 * created inside a frame that has already returned, or the count measures the caller's own stack.
 */
export const countRetained = async (probes: readonly WeakRef<object>[]): Promise<number> => {
  await collect();

  let retained = 0;

  for (const probe of probes) {
    if (probe.deref() !== undefined) retained++;
  }

  return retained;
};

/** Heap growth in bytes across `run`, measured after a collection on both sides. */
export const measureRetainedBytes = async (run: () => void): Promise<number> => {
  await collect();

  const before = process.memoryUsage().heapUsed;

  run();

  await collect();

  return process.memoryUsage().heapUsed - before;
};
