import {describe, expect, test} from "vitest";
import {createTV, tv} from "../index";
import {
  CACHE_MISS,
  type CacheMiss,
  capturePropsSnapshot,
  createBoundedCache,
  readDependencyValues,
} from "../internal/cache.js";
import {tv as tvLite} from "../lite";
import {defineSlots, defineVariants, type LooseRecord} from "./support/loose.js";

/** The whole snapshot, when a case needs `captured` as well as the key. */
const snapshotOf = (keys: readonly string[], defaults: LooseRecord, props?: LooseRecord) => {
  const values: unknown[] = [];

  readDependencyValues(keys as string[], defaults, values, props);

  return capturePropsSnapshot(keys as string[], values);
};

/**
 * The two-step read the resolvers do: values first, then the key built from those values. Wrapped
 * here so a case reads as `fingerprintOf(keys, defaults, props)` rather than restating the split.
 */
const fingerprintOf = (
  keys: readonly string[],
  defaults: LooseRecord,
  props?: LooseRecord,
): string | null => {
  const values: unknown[] = [];

  readDependencyValues(keys as string[], defaults, values, props);

  return capturePropsSnapshot(keys as string[], values).fingerprint;
};

/*
 * Cache-key forgery and cross-call leakage.
 *
 * A class string carries visual state — a control that is disabled, an element that is hidden, a
 * style that depends on a role — so two calls sharing one cache entry is not a performance bug, it
 * is one call rendering with another's state. Every case here asks the same question in a
 * different place: can an input that is NOT part of a key change what that key resolves to?
 *
 * Where a case attacks an encoding, it also proves its own corpus: a weaker encoding is applied to
 * the same values and must collide on them. A test that passes because its inputs are too tame
 * asserts nothing, and is indistinguishable from one that passes because the encoding is sound.
 */

// The alphabet a Tailwind arbitrary value actually admits — `:`, `;`, quotes, brackets, a data
// URL — plus values that spell the encoding's own machinery: a tag letter, a length prefix, the
// defaulted marker, and a complete field.
const FORGERY_VALUES: readonly unknown[] = [
  undefined,
  null,
  true,
  false,
  0,
  -0,
  1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  1n,
  -1n,
  "",
  ":",
  ";",
  '"',
  "'",
  "d",
  "u",
  "n",
  "b1",
  "#0",
  "i1",
  "s",
  "0:",
  // The pair that forges the FIELD BOUNDARY when the length prefix is removed: `a` + `sb` and
  // `as` + `b` both flatten to `sassb` once each field is only its tag plus its value. Without
  // these the corpus cannot produce a prefix-free collision at all, so the "a weaker encoding
  // collides" arm below passes against an encoding that has no prefix — which is the whole
  // property it exists to prove. Measured: dropping the prefix failed 0 of 211 tests before this.
  "as",
  "sb",
  "1:s",
  "2:sa",
  "d1:u",
  "d2:sa",
  "1:s1:s",
  "9",
  "10",
  "NaN",
  "true",
  "null",
  " ",
  "𝕏",
  "𝕏𝕐",
  "group-hover:shadow-lg",
  "bg-[url('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')]",
  "x".repeat(300),
  `${"x".repeat(299)}y`,
];

const normalize = (value: unknown): string =>
  `${typeof value}:${Object.is(value, -0) ? "0" : String(value)}`;

/** What resolution can tell apart: the kind and value of each prop, and whether it was supplied. */
const resolutionIdentity = (props: LooseRecord, keys: readonly string[]): string =>
  keys.map((key) => (props[key] === undefined ? "ABSENT" : normalize(props[key]))).join("");

/** The encoding a length prefix and a per-kind tag exist to replace. */
const naiveFingerprint = (props: LooseRecord, keys: readonly string[]): string =>
  keys.map((key) => String(props[key])).join(":");

type CollisionReport = {
  /** Distinct keys produced, so a corpus that keyed nothing cannot pass by producing one entry. */
  keys: number;
  /** Every pair of resolution-distinct prop sets that shared one key. */
  collisions: string[];
};

const findCollisions = (
  keys: readonly string[],
  tuples: readonly LooseRecord[],
  encode: (props: LooseRecord) => string | null,
): CollisionReport => {
  const byKey = new Map<string, string>();
  const collisions: string[] = [];

  for (const props of tuples) {
    const encoded = encode(props);

    // An unkeyable value is a deliberate cache BYPASS, not a key — there is nothing to collide.
    if (encoded === null) continue;

    const identity = resolutionIdentity(props, keys);
    const previous = byKey.get(encoded);

    if (previous === undefined) {
      byKey.set(encoded, identity);
      continue;
    }

    if (previous !== identity) collisions.push(`${previous}  ==  ${identity}`);
  }

  return {keys: byKey.size, collisions};
};

/*
 * The two-generation cache underneath every key in this file. A key it was never given must come
 * back a miss, and a key it was given must come back with that key's value — including across the
 * rotation, where one generation holds a subset of the working set and the other holds the rest.
 */
describe("bounded cache never answers for a key it was not given", () => {
  const LIMIT = 8;
  const WORKING_SET = 40;

  /** A trace of set/get operations wide enough to rotate the generations several times over. */
  const driveCache = (
    read: (key: string) => string | CacheMiss,
    write: (key: string, value: string) => void,
  ): string[] => {
    const wrong: string[] = [];
    const written = new Set<string>();

    for (let pass = 0; pass < 6; pass++) {
      for (let index = 0; index < WORKING_SET; index++) {
        // A stride coprime with the working set, so the access order is not the write order and a
        // generation is read after the next one has partly filled.
        const key = `k${(index * 7 + pass) % WORKING_SET}`;
        const found = read(key);

        if (found === CACHE_MISS) {
          if (written.has(key)) continue;

          write(key, `value-${key}`);
          written.add(key);
          continue;
        }

        if (found !== `value-${key}`) wrong.push(`${key} -> ${found}`);
      }
    }

    return wrong;
  };

  test("across generation rotation, every hit is the value stored under that key", () => {
    const cache = createBoundedCache<string>(LIMIT);
    const wrong = driveCache(
      (key) => cache.get(key),
      (key, value) => cache.set(key, value),
    );

    expect(wrong).toEqual([]);
  });

  // A cache that answers from the wrong generation is the failure this is watching for, so the
  // same trace is run against one that does exactly that. A trace too short to rotate would pass
  // both, and would prove nothing about the real one.
  test("the same trace catches a cache that answers from the wrong entry", () => {
    let primary = new Map<string, string>();
    let secondary = new Map<string, string>();
    const firstValueIn = (generation: Map<string, string>): string | undefined => {
      for (const value of generation.values()) return value;

      return undefined;
    };
    const wrong = driveCache(
      (key) => {
        const stored = primary.get(key);

        if (stored !== undefined) return stored;

        // The defect — a surviving entry answers, rather than the one filed under this key.
        return firstValueIn(secondary) ?? CACHE_MISS;
      },
      (key, value) => {
        if (primary.size >= LIMIT) {
          secondary = primary;
          primary = new Map();
        }

        primary.set(key, value);
      },
    );

    expect(wrong.length).toBeGreaterThan(0);
  });
});

describe("props fingerprint forgery", () => {
  const KEYS = ["first", "second", "third"];
  const DEFAULTS: LooseRecord = {first: "d-first", second: undefined, third: null};

  // Every value in each of the three positions, against a fixed partner — the shape a shift attack
  // needs, since forging a boundary means moving characters from one field into the next.
  const TUPLES: LooseRecord[] = [];

  for (const value of FORGERY_VALUES) {
    for (const partner of FORGERY_VALUES) {
      TUPLES.push({first: value, second: partner, third: "z"});
      TUPLES.push({first: "z", second: value, third: partner});
      TUPLES.push({first: value, second: "z", third: partner});
    }
  }

  // Every value alone in each position, so the absent/present axis is exercised against a default
  // that IS the value — the case the defaulted marker exists for.
  for (const value of FORGERY_VALUES) {
    for (const key of KEYS) TUPLES.push({[key]: value});
  }

  TUPLES.push({});

  test("no two resolution-distinct prop sets share a fingerprint", () => {
    const report = findCollisions(KEYS, TUPLES, (props) => fingerprintOf(KEYS, DEFAULTS, props));

    expect(report.collisions).toEqual([]);
    expect(report.keys).toBeGreaterThan(1000);
  });

  // The corpus proves itself: an encoding without the length prefix, the per-kind tag or the
  // defaulted marker collides on these very values. Without this the case above would pass just as
  // happily over inputs that cannot forge anything.
  test("the same corpus does collide under a delimiter-joined encoding", () => {
    const report = findCollisions(KEYS, TUPLES, (props) => naiveFingerprint(props, KEYS));

    expect(report.collisions.length).toBeGreaterThan(0);
  });

  test("a value spelling a complete field does not shift the boundary", () => {
    const keys = ["a", "b"];
    const shifted = fingerprintOf(keys, {}, {a: "1:sx", b: ""});
    const straight = fingerprintOf(keys, {}, {a: "", b: "1:sx"});
    const merged = fingerprintOf(keys, {}, {a: "1:sx1:s", b: ""});

    expect(shifted).not.toBe(straight);
    expect(shifted).not.toBe(merged);
    expect(straight).not.toBe(merged);
  });

  test("no provided value forges an absent prop, whatever it spells", () => {
    const keys = ["a"];
    const absent = fingerprintOf(keys, {a: "u"}, {});

    // The pair that isolates DEFAULTED_TAG, and the only one that does. Passing the DEFAULT'S OWN
    // value means both sides serialize to the identical `1:u`, so the marker is the whole
    // difference — blank it and these two collide. The obvious-looking choice here is a value that
    // SPELLS the encoding (`d1:u`), and it is the weaker one: the length prefix already holds that
    // pair apart, so it passes with the marker removed and guards nothing it names.
    expect(fingerprintOf(keys, {a: "u"}, {a: "u"})).not.toBe(absent);

    // The spelled-encoding case is still worth pinning — it is the length prefix that holds it,
    // which is why both assertions are here rather than either one standing for the pair.
    expect(fingerprintOf(keys, {a: "u"}, {a: "d1:u"})).not.toBe(absent);
  });

  test("a value compared by identity is unkeyable rather than keyed by shape", () => {
    const keys = ["a"];
    const object = {};

    expect(fingerprintOf(keys, {}, {a: object})).toBeNull();
    expect(fingerprintOf(keys, {}, {a: () => "x"})).toBeNull();
    expect(fingerprintOf(keys, {}, {a: Symbol("x")})).toBeNull();
    // The capture still carries the value: an unkeyable prop bypasses the cache, it does not
    // vanish from the resolve.
    expect(snapshotOf(keys, {}, {a: object}).captured).toEqual({a: object});
  });
});

// The override key joins two consumer-supplied strings, so either of them could forge the other's
// boundary. Merging is off on both arms, which makes a forged entry visible as a literal wrong
// string rather than as a merge outcome that happens to look plausible.
const OVERRIDE_PIECES: readonly string[] = [
  "",
  "a",
  "b",
  "aa",
  ":",
  "0:",
  "1:",
  "1:a",
  "2:ab",
  "d1:a",
  "ab",
  "1:a2:ab",
  "a1:b",
  // The piece that makes the corpus discriminating — see the separator-joined case below.
  "a:",
  "𝕏",
  "x".repeat(120),
];

describe.each([
  ["tv", createTV({twMerge: false})],
  // The lite build never merges, so it is already the plain-join arm.
  ["tv/lite", tvLite],
] as const)("%s override cache forgery", (_label, createTv) => {
  test("every class/className pair resolves to its own join", () => {
    const warm = defineVariants(createTv, {base: "core", variants: {color: {a: "c-a"}}});
    const mismatches: string[] = [];

    // Twice through the whole grid, so the second pass reads entries the first pass wrote.
    for (let pass = 0; pass < 2; pass++) {
      for (const classValue of OVERRIDE_PIECES) {
        for (const classNameValue of OVERRIDE_PIECES) {
          const expected = ["core", "c-a", classValue, classNameValue].filter(Boolean).join(" ");
          const actual = warm({color: "a", class: classValue, className: classNameValue});

          if (actual !== expected) {
            mismatches.push(
              `pass ${pass} ${JSON.stringify([classValue, classNameValue])}: ` +
                `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
            );
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  // The corpus proves itself: joining the two override strings with a separator collides on these
  // very pairs, so the case above is watching an encoding a weaker one genuinely fails.
  //
  // A collision alone does not prove that, which is why only the OBSERVABLE ones count — pairs that
  // share a separator-joined key AND whose correct joins differ. `("", ":")` and `(":", "")` collide
  // and both resolve to `core c-a :`, so a separator-joined key serves them both correctly and the
  // case above stays green over it. `"a:"` is the piece that makes the corpus bite: `("a:", "")` and
  // `("a", ":")` share the key `a::` and resolve to `core c-a a:` against `core c-a a :`, so one of
  // them must be served the other's string. Removing that piece reddens THIS case rather than
  // silently leaving its neighbour asserting nothing.
  test("the same corpus does collide under a separator-joined key, on pairs that resolve differently", () => {
    const seen = new Map<string, {identity: string; join: string}>();
    const observable: string[] = [];

    for (const classValue of OVERRIDE_PIECES) {
      for (const classNameValue of OVERRIDE_PIECES) {
        const identity = `${JSON.stringify(classValue)}|${JSON.stringify(classNameValue)}`;
        // The expected string the case above asserts, so a collision counted here is one that case
        // can actually see.
        const join = ["core", "c-a", classValue, classNameValue].filter(Boolean).join(" ");
        const naive = `${classValue}:${classNameValue}`;
        const previous = seen.get(naive);

        if (previous === undefined) {
          seen.set(naive, {identity, join});
          continue;
        }

        if (previous.identity !== identity && previous.join !== join) {
          observable.push(`${previous.identity} == ${identity}`);
        }
      }
    }

    expect(observable.length).toBeGreaterThan(0);
  });

  // An override key is three consumer strings — the resolved core, `class` and `className` — and any
  // of them can spell the shape of another. The core sits at its own level of the cache and the two
  // override halves are length-prefixed within theirs, so no arrangement of the three reads as a
  // different arrangement.
  //
  // All three vary together here, which is the arrangement neither neighbouring case can produce:
  // the pair grid holds the core CONSTANT, so a core reaching across a boundary is invisible to it,
  // and the levels case below leaves `className` EMPTY, so a core reaching across THAT boundary is
  // invisible to it. An encoding that separates the core from `class` and then folds it into the gap
  // before `className` is served the wrong string here and passes both of them.
  //
  // The corpus is small and purpose-built rather than OVERRIDE_PIECES crossed three ways, because a
  // grid wider than OVERRIDE_CACHE_LIMIT stops testing the cache at all: the first member of a
  // colliding pair is evicted before the second one arrives, so the second takes a MISS — and a miss
  // recomputes CORRECTLY. Widen this grid and the pairs still collide, nothing is ever served the
  // wrong string, and the case goes quiet over an encoding it genuinely forges. Every combination
  // here stays live for the whole run, so a collision is served rather than recomputed.
  //
  // Each value is one half of a pair that resolves to two different strings, so a key shared between
  // them surfaces as one call being served the other's classes. Remove any one and an encoding
  // defect stops being detected:
  // - core `a:` against core `a` with a `className` of `:` — forges when the core is keyed into the
  //   gap between the two override halves.
  // - piece `a:` against piece `a` with a `className` of `:` — the same forgery one level down,
  //   between `class` and `className`, and what the length prefix inside the override key holds
  //   apart.
  // - core `ab` is the same LENGTH as core `a:` — forges when the core level is keyed by size.
  // - core `a b` is the only multi-token one, which is the shape `cn` actually returns — forges when
  //   the core level is keyed by its first class rather than by the whole string.
  // - `""` is the other half of every pair above: a boundary is only forgeable when the field whose
  //   text runs into it can be empty.
  test("a core string and an override string cannot forge each other's boundary", () => {
    const cores: readonly string[] = ["a", "a:", "ab", "a b"];
    const pieces: readonly string[] = ["", "a", ":", "a:"];
    const component = defineVariants(createTv, {
      base: "",
      variants: {core: Object.fromEntries(cores.map((core) => [core, core]))},
    });
    const mismatches: string[] = [];

    // Twice through the whole grid, so the second pass reads entries the first pass wrote.
    for (let pass = 0; pass < 2; pass++) {
      for (const core of cores) {
        for (const classValue of pieces) {
          for (const classNameValue of pieces) {
            const joined = [core, classValue, classNameValue].filter(Boolean).join(" ");
            // Nothing to emit is `undefined`, not the empty string — the published `cn` contract.
            const expected = joined === "" ? undefined : joined;
            const actual = component({core, class: classValue, className: classNameValue});

            if (actual !== expected) {
              mismatches.push(
                `pass ${pass} ${JSON.stringify([core, classValue, classNameValue])}: ` +
                  `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
              );
            }
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  // The override cache is keyed on the core AND on the override, so the same override against a
  // different core must not be served the other core's merge — and the same core against a
  // different override must not be served the other override's.
  test("a core and an override are separate levels of the key, not a joined string", () => {
    const cores: readonly string[] = ["a", "a b", "a1:b", "1:a", ""];
    const component = defineVariants(createTv, {
      base: "",
      variants: {core: Object.fromEntries(cores.map((core) => [core, core]))},
    });
    const mismatches: string[] = [];

    for (let pass = 0; pass < 2; pass++) {
      for (const core of cores) {
        for (const override of OVERRIDE_PIECES) {
          const joined = [core, override].filter(Boolean).join(" ");
          // Nothing to emit is `undefined`, not the empty string — the published `cn` contract.
          const expected = joined === "" ? undefined : joined;
          const actual = component({core, class: override});

          if (actual !== expected) {
            mismatches.push(
              `pass ${pass} ${JSON.stringify([core, override])}: ` +
                `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
            );
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});

describe.each([
  ["tv", tv],
  ["tv/lite", tvLite],
] as const)("%s cross-component leakage", (_label, createTv) => {
  test("a nested resolve from a variant getter never contributes to the outer component", () => {
    const inner = defineVariants(createTv, {
      base: "inner",
      variants: {color: {a: "inner-a", b: "inner-b"}},
    });
    const outer = defineVariants(createTv, {
      base: "outer",
      variants: {
        color: {
          get a() {
            inner({color: "b"});

            return "outer-a";
          },
          b: "outer-b",
        },
      },
    });

    expect(outer({color: "a"})).toHaveClass(["outer", "outer-a"]);
    expect(outer({color: "a"})).toHaveClass(["outer", "outer-a"]);
    expect(outer({color: "b"})).toHaveClass(["outer", "outer-b"]);
    expect(outer({color: "a"})).toHaveClass(["outer", "outer-a"]);
    expect(inner({color: "b"})).toHaveClass(["inner", "inner-b"]);
  });

  test("two components that resolve each other never merge their class lists", () => {
    let depth = 0;
    const left = defineVariants(createTv, {
      base: "left",
      variants: {
        color: {
          get a() {
            if (depth < 3) {
              depth++;
              try {
                right({color: "a"});
              } finally {
                depth--;
              }
            }

            return "left-a";
          },
        },
      },
    });
    const right = defineVariants(createTv, {
      base: "right",
      variants: {
        color: {
          get a() {
            if (depth < 3) {
              depth++;
              try {
                left({color: "a"});
              } finally {
                depth--;
              }
            }

            return "right-a";
          },
        },
      },
    });

    expect(left({color: "a"})).toHaveClass(["left", "left-a"]);
    expect(left({color: "a"})).toHaveClass(["left", "left-a"]);
    expect(right({color: "a"})).toHaveClass(["right", "right-a"]);
    expect(left({color: "a"})).toHaveClass(["left", "left-a"]);
  });

  // A class value that is an object is walked with `for...in` INSIDE the merge, so a getter there
  // re-enters after the accumulators have been filled and handed over — the one window where a
  // shared accumulator would already be live.
  test("a nested resolve from inside the merge never contributes to the outer component", () => {
    const inner = defineVariants(createTv, {base: "inner", variants: {color: {a: "inner-a"}}});
    const outer = defineVariants(createTv, {
      base: "outer",
      variants: {
        color: {
          a: {
            get "outer-a"() {
              inner({color: "a"});

              return true;
            },
          },
          b: "outer-b",
        },
      },
    });

    expect(outer({color: "a"})).toHaveClass(["outer", "outer-a"]);
    expect(outer({color: "a"})).toHaveClass(["outer", "outer-a"]);
    expect(outer({color: "b"})).toHaveClass(["outer", "outer-b"]);
    expect(outer({color: "a"})).toHaveClass(["outer", "outer-a"]);
  });

  test("a getter that throws mid-resolve leaves no residue for the next call", () => {
    const third = defineVariants(createTv, {base: "third", variants: {color: {a: "third-a"}}});
    const second = defineVariants(createTv, {
      base: "second",
      variants: {
        color: {
          get a() {
            third({color: "a"});

            return "second-a";
          },
        },
      },
    });
    const first = defineVariants(createTv, {
      base: "first",
      variants: {
        color: {
          get a() {
            second({color: "a"});

            return "first-a";
          },
          get boom(): string {
            throw new Error("getter exploded");
          },
        },
      },
    });

    expect(first({color: "a"})).toHaveClass(["first", "first-a"]);
    expect(() => first({color: "boom"})).toThrow("getter exploded");
    expect(first({color: "a"})).toHaveClass(["first", "first-a"]);
    expect(second({color: "a"})).toHaveClass(["second", "second-a"]);
    expect(third({color: "a"})).toHaveClass(["third", "third-a"]);
  });

  test("two definitions with identical shapes keep separate caches", () => {
    const variants = {color: {a: "c-a", b: "c-b"}};
    const one = defineVariants(createTv, {base: "one", variants});
    const two = defineVariants(createTv, {base: "two", variants});

    expect(one({color: "a"})).toHaveClass(["one", "c-a"]);
    expect(two({color: "a"})).toHaveClass(["two", "c-a"]);
    expect(one({color: "a"})).toHaveClass(["one", "c-a"]);
    expect(two({color: "b"})).toHaveClass(["two", "c-b"]);
    expect(one({color: "b"})).toHaveClass(["one", "c-b"]);
  });

  // A working set larger than the variant cache's limit, so entries are evicted into the second
  // generation and promoted back out of it while the same keys keep being asked for. A generation
  // that answered for a key it does not hold would surface here as one value's classes on another.
  test("a working set past the cache limit still answers every key with its own classes", () => {
    const values: Record<string, string> = {};

    for (let index = 0; index < 400; index++) values[`v${index}`] = `class-${index}`;

    const component = defineVariants(createTv, {base: "base", variants: {color: values}});
    const mismatches: string[] = [];

    for (let pass = 0; pass < 3; pass++) {
      for (let index = 0; index < 400; index++) {
        const output = component({color: `v${index}`});

        if (output !== `base class-${index}`) mismatches.push(`pass ${pass} v${index}: ${output}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  // The same, for the override cache: more distinct override strings than its limit, cycled, so
  // its own two generations rotate under a live working set.
  test("a working set past the override cache limit still answers every override", () => {
    const component = defineVariants(createTv, {base: "base", variants: {color: {a: "c-a"}}});
    const mismatches: string[] = [];

    for (let pass = 0; pass < 3; pass++) {
      for (let index = 0; index < 300; index++) {
        const output = component({color: "a", class: `ov-${index}`});

        if (output !== `base c-a ov-${index}`)
          mismatches.push(`pass ${pass} ov-${index}: ${output}`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});

describe.each([
  ["tv", tv],
  ["tv/lite", tvLite],
] as const)("%s read-twice divergence", (_label, createTv) => {
  test("a dependency prop is read once per call, so no call is filed under another's key", () => {
    const component = defineVariants(createTv, {
      base: "base",
      variants: {color: {a: "c-a", b: "c-b"}},
    });
    const reads: string[] = [];
    // Answers differently on every read. A key built from one read and classes from another files
    // this call's output under the other value's key, permanently.
    const flipping: LooseRecord = {
      get color() {
        const value = reads.length % 2 === 0 ? "a" : "b";

        reads.push(value);

        return value;
      },
    };

    // Warm both stable entries first, so a forged write would have somewhere to land.
    expect(component({color: "a"})).toHaveClass(["base", "c-a"]);
    expect(component({color: "a"})).toHaveClass(["base", "c-a"]);
    expect(component({color: "b"})).toHaveClass(["base", "c-b"]);

    for (let call = 0; call < 6; call++) {
      const before = reads.length;
      const output = component(flipping);
      const readsThisCall = reads.slice(before);

      expect(readsThisCall).toHaveLength(1);
      expect(output).toHaveClass(["base", `c-${readsThisCall[0]}`]);
    }

    // The stable callers are still served their own classes.
    expect(component({color: "a"})).toHaveClass(["base", "c-a"]);
    expect(component({color: "b"})).toHaveClass(["base", "c-b"]);
  });

  test("a flipping class override is merged from the same read that keys it", () => {
    const component = defineVariants(createTv, {base: "core", variants: {color: {a: "c-a"}}});
    let reads = 0;
    // A value no other read can produce, so an entry names the read that filled it.
    const flipping: LooseRecord = {
      color: "a",
      get class() {
        reads++;

        return `read-${reads}`;
      },
    };

    // Three calls, so the cold invoke and the warm ones each leave an entry behind. The outputs are
    // not what is asserted — the entries are.
    for (let call = 0; call < 3; call++) component(flipping);

    // Probed by VALUE afterwards, because the flipping call's own output cannot separate the two
    // reads: it is SOME read's join either way, and a counter sampled after the call has already
    // advanced to the last read, so comparing against it agrees with whichever read the merge
    // happened to use — green whether the key and the class came from one read or two.
    //
    // What does separate them is asking, later, what each value resolves to. A plain call supplying
    // `read-n` must be served that override's own join; when the halves come apart, the entry filed
    // under the KEYING read holds the MERGING read's string and hands it back here. Every read of
    // every call is probed, since which one keyed the entry is the thing in question.
    const mismatches: string[] = [];

    for (let read = 1; read <= reads; read++) {
      const override = `read-${read}`;
      const expected = `core c-a ${override}`;
      const actual = component({color: "a", class: override});

      if (actual !== expected) {
        mismatches.push(`${override}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});

// The merger built from `twMergeConfig` lives in module state, so two components configured
// differently share one slot. Neither the core cache nor the override cache keys on the config, so
// an entry written while the other component's config was installed would be the wrong merge.
describe("tv merger config sharing", () => {
  // One group holding both tones, so the later class wins; two groups holding one each, so both
  // survive. Same input classes, opposite answers, decided only by which config is installed.
  const tvGrouped = createTV({twMergeConfig: {classGroups: {tone: [{tone: ["red", "blue"]}]}}});
  const tvSeparate = createTV({
    twMergeConfig: {classGroups: {redTone: [{tone: ["red"]}], blueTone: [{tone: ["blue"]}]}},
  });

  test("interleaved components each merge under their own config", () => {
    const grouped = defineVariants(tvGrouped, {base: "tone-red tone-blue"});
    const separate = defineVariants(tvSeparate, {base: "tone-red tone-blue"});

    for (let pass = 0; pass < 3; pass++) {
      expect(grouped()).toHaveClass(["tone-blue"]);
      expect(separate()).toHaveClass(["tone-red", "tone-blue"]);
    }
  });

  test("interleaved class overrides each merge under their own config", () => {
    const grouped = defineVariants(tvGrouped, {base: "p-1"});
    const separate = defineVariants(tvSeparate, {base: "p-1"});
    const override = {class: "tone-red tone-blue"};

    for (let pass = 0; pass < 3; pass++) {
      expect(grouped(override)).toHaveClass(["p-1", "tone-blue"]);
      expect(separate(override)).toHaveClass(["p-1", "tone-red", "tone-blue"]);
    }
  });

  test("merging on and off never share an entry", () => {
    const merging = defineVariants(createTV({twMerge: true}), {base: "p-1 p-2"});
    const joining = defineVariants(createTV({twMerge: false}), {base: "p-1 p-2"});

    for (let pass = 0; pass < 3; pass++) {
      expect(merging()).toHaveClass(["p-2"]);
      expect(joining()).toHaveClass(["p-1", "p-2"]);
    }
  });
});

/*
 * Three properties that were each broken and are each now guarded. Every one was watched go red on
 * the code that lacked its fix, and red for its OWN fix rather than for a neighbour's — the first
 * two were originally pinned as expected failures, and flipping them to plain tests is what proved
 * the repairs land.
 *
 * The third exists because that check was NOT free: sabotaging the copy in `compileResolvedOptions`
 * left the first two green, which means neither of them reaches the path where the copy matters.
 * A fix no test can distinguish from its absence is a fix nobody is holding.
 */
describe.each([
  ["tv", tv],
  ["tv/lite", tvLite],
] as const)("%s cache-key integrity", (_label, createTv) => {
  /*
   * DEFECT 1 — the first invoke of a variants component resolves from the caller's RAW props,
   * every later invoke from the captured dependency props. The two differ for exactly one prop
   * name: `getCompleteProps` copies with `result[key] = props[key]`, so an own-enumerable
   * `__proto__` — which `JSON.parse` produces from untrusted input — SETS the prototype of the
   * record every compound condition is matched against. It is not a variant key and not a
   * condition key, so it never reaches the fingerprint; the capture drops it and the cold path
   * does not.
   *
   * The result is a component whose first render applies a compound that no later render applies,
   * from a prop the cache key does not represent.
   */
  test("the first invoke resolves from the same props every later invoke does", () => {
    const component = defineVariants(createTv, {
      base: "base",
      variants: {color: {a: "c-a"}},
      compoundVariants: [{color: "a", role: "admin", class: "admin-only"}],
    });
    const polluted = JSON.parse('{"color":"a","__proto__":{"role":"admin"}}') as LooseRecord;

    const first = component(polluted);
    const second = component(polluted);
    const third = component(polluted);

    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  /*
   * DEFECT 2 — the dependency key set is derived from `resolved.variantKeys`, which is the very
   * array published as `component.variantKeys`. Removing an entry in place narrows BOTH the cache
   * key and the props handed to resolution, so the variant stops resolving and two calls that
   * differ only in it share one entry. Every published version resolves the variant regardless of
   * what that array holds.
   */
  test("the key set does not follow the published variantKeys array", () => {
    const component = defineVariants(createTv, {
      base: "base",
      variants: {color: {a: "c-a", b: "c-b"}, size: {lg: "size-lg"}},
    });

    expect(component({color: "a", size: "lg"})).toHaveClass(["base", "c-a", "size-lg"]);

    component.variantKeys.pop();

    expect(component({color: "a", size: "lg"})).toHaveClass(["base", "c-a", "size-lg"]);
    expect(component({color: "a", size: "sm"})).toHaveClass(["base", "c-a"]);
  });

  /*
   * The same published array, reached down the OTHER path — the one the case above cannot see.
   *
   * `dependencyKeys` is derived once on the first invoke, so a `pop()` after that is already too
   * late to matter there. But a compound metadata change re-derives it, and `applyChange` calls
   * `collectDependencyKeys(variantKeys, …)` again — so if that argument is still the array
   * published as `component.variantKeys`, a consumer who mutated it hands the re-derivation a
   * narrowed set. The variant then stops resolving AND stops keying, so two calls differing only
   * in it collide on one entry, permanently, from the moment some unrelated metadata moved.
   *
   * Compiling a copy is what closes it. Sabotaging that copy leaves every other case in this file
   * green, which is why this one is written separately rather than folded into the case above.
   */
  /*
   * The FOURTH way into `getCompleteProps`, and the reason the guard belongs inside it rather than
   * at its callers. Guarding call sites made three of the four safe and left this one leaking the
   * same own-enumerable `__proto__` the case above pins at the parent entry point — and cost 44%
   * on this path for the privilege. `getCompleteProps` refusing the key closes all four at once,
   * which is why both cases here now hold against one comparison instead of two captures.
   */
  test("a slot's own props cannot re-parent the record conditions are matched against", () => {
    const component = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {tone: {a: {root: "tone-a"}}},
      compoundVariants: [{tone: "a", secret: "on", class: {root: "injected"}}],
      defaultVariants: {tone: "a"},
    });

    // What `JSON.parse` of untrusted input produces: `__proto__` as an OWN enumerable property.
    const payload = JSON.parse('{"tone":"a","__proto__":{"secret":"on"}}') as LooseRecord;

    // Warmed past the cold invoke on both entry points, because the first call of a definition
    // skips the cache and would take the miss path for the wrong reason.
    for (let call = 0; call < 4; call++) {
      component(payload).root();
      component({tone: "a"}).root(payload);
    }

    expect(component(payload).root()).toHaveClass(["root", "tone-a"]);

    // Same payload, one argument position over. The compound must not match here either.
    expect(component({tone: "a"}).root(payload)).toHaveClass(["root", "tone-a"]);
  });

  test("a metadata change re-derives the key set from the compiled copy, not the published array", () => {
    // The compound conditions on `color` ALONE. That matters: `collectDependencyKeys` unions the
    // variant keys with every compound's condition keys, so a popped variant that some compound
    // also conditions on comes straight back and the defect hides. `size` is reachable only as a
    // variant, which is what makes its loss observable.
    const compound = {color: "a", class: "cv"};
    const component = defineVariants(createTv, {
      base: "base",
      variants: {color: {a: "c-a"}, size: {lg: "size-lg", sm: "size-sm"}},
      compoundVariants: [compound],
    });

    // Warm well past the cold invoke, so `dependencyKeys` is already derived and only a
    // re-derivation can change it.
    for (let call = 0; call < 4; call++) component({color: "a", size: "lg"});

    component.variantKeys.pop();

    // Move the compound's metadata. The tracker reports a change, and applying it re-derives both
    // the compound index and the dependency set.
    compound.class = "cv-moved";

    expect(component({color: "a", size: "lg"})).toHaveClass(["base", "c-a", "size-lg", "cv-moved"]);

    // The payload: `size` must still separate these two. If the re-derivation read the mutated
    // public array, `size` is gone from the key AND from the props the resolve sees, so this call
    // is served the entry above.
    expect(component({color: "a", size: "sm"})).toHaveClass(["base", "c-a", "size-sm", "cv-moved"]);
  });
});
