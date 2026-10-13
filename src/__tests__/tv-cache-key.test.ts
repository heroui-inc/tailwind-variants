import {describe, expect, test} from "vitest";

import {tv} from "../index";
import {tv as tvLite} from "../lite";
import {asRecord, defineSlots, defineVariants, type LooseRecord} from "./support/loose.js";

// A cache key must separate every pair of prop values that resolve differently. Compound
// conditions compare by identity (`matchesCompoundValue`) and `isNullishOrFalse` separates
// nullish values from their string spellings, so these four pairs are distinguishable to
// resolution — and a key that maps both halves onto one entry serves one's classes for the
// other. Each case warms on the first value, because the first invoke of a definition skips
// the cache and would take the miss path for the wrong reason.
const PAIRS: ReadonlyArray<readonly [string, unknown, unknown]> = [
  ["undefined and the empty string", undefined, ""],
  ["true and the string 'true'", true, "true"],
  ["null and the string 'null'", null, "null"],
  ["the number 0 and the string '0'", 0, "0"],
  // The rows above are separated by the length prefix or the defaulted marker even without a
  // per-kind tag on strings. These are separated by the tag alone: each names a string spelled
  // exactly like another kind's encoding, so an untagged string collides with that kind.
  ["null and a string spelling its tag", null, "n"],
  ["true and a string spelling its tag", true, "b1"],
  ["the number 0 and a string spelling its tag", 0, "#0"],
  ["a bigint and a string spelling its tag", 1n, "i1"],
];

const warm = (read: () => string, times = 3): string => {
  let last = "";

  for (let index = 0; index < times; index++) last = read();

  return last;
};

describe.each([
  ["tv", tv],
  ["tv/lite", tvLite],
] as const)("%s cache key", (_label, createTv) => {
  test.each(PAIRS)("separates %s", (_name, first, second) => {
    const definition = {
      base: "base",
      variants: {flag: {}},
      compoundVariants: [{flag: first, class: "cv"}],
    };
    const component = defineVariants(createTv, definition);

    expect(component({flag: first})).toHaveClass(["base", "cv"]);
    expect(component({flag: first})).toHaveClass(["base", "cv"]);
    expect(component({flag: first})).toHaveClass(["base", "cv"]);

    // The compound condition does not match the second value, so it must not inherit the
    // first's cached classes.
    expect(component({flag: second})).toHaveClass(["base"]);
  });

  test("separates the pairs on the slots path too", () => {
    const component = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {flag: {}},
      compoundVariants: [{flag: undefined, class: {root: "cv"}}],
    });

    expect(component({}).root()).toHaveClass(["root", "cv"]);
    expect(component({}).root()).toHaveClass(["root", "cv"]);
    expect(component({}).root()).toHaveClass(["root", "cv"]);

    expect(component({flag: ""}).root()).toHaveClass(["root"]);
  });

  test("still caches when the call carries props it does not read", () => {
    // The ordinary React shape: a component spreads its own props in, so the object carries an
    // event handler alongside the variants. A key built by scanning the caller's props cannot
    // serialize a function, and an unserializable key means no cache at all — so this is the
    // difference between the cache working and not existing for most real callers.
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {root: "root-a"}, b: {root: "root-b"}}},
      defaultVariants: {color: "a"},
    });

    menu({color: "a"});

    const first = menu({color: "a", onPress: () => undefined});
    const second = menu({color: "a", onPress: () => undefined});

    expect(first).toBe(second);
    expect(first.root()).toHaveClass(["root", "root-a"]);
  });

  test("still caches when a prop value is cyclic", () => {
    // React elements and stores are routinely cyclic. Serializing them threw, and the throw was
    // swallowed into an unserializable key — same outcome as the handler above.
    const cyclic: Record<string, unknown> = {};

    cyclic.self = cyclic;

    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {root: "root-a"}, b: {root: "root-b"}}},
      defaultVariants: {color: "a"},
    });

    menu({color: "a"});

    const first = menu({color: "a", children: cyclic});
    const second = menu({color: "a", children: cyclic});

    expect(first).toBe(second);
    expect(first.root()).toHaveClass(["root", "root-a"]);
  });

  test("a prop it does not read cannot change the result", () => {
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {root: "root-a"}, b: {root: "root-b"}}},
      defaultVariants: {color: "a"},
    });

    menu({color: "a"});

    expect(menu({color: "a", spacer: 1}).root()).toHaveClass(["root", "root-a"]);
    expect(menu({color: "a", spacer: 2}).root()).toHaveClass(["root", "root-a"]);
    expect(menu({color: "b", spacer: 1}).root()).toHaveClass(["root", "root-b"]);
  });

  test("a compound condition that is not a variant key still keys the cache", () => {
    // `state` is not in `variants`, so it is only reachable as a compound condition. It must
    // still be part of the key, or two calls differing only in it would share an entry.
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {}, b: {}}},
      compoundVariants: [{color: "a", state: "open", class: {root: "cv-open"}}],
      defaultVariants: {color: "a"},
    });

    expect(menu({color: "a", state: "open"}).root()).toHaveClass(["root", "cv-open"]);
    expect(menu({color: "a", state: "open"}).root()).toHaveClass(["root", "cv-open"]);
    expect(menu({color: "a", state: "closed"}).root()).toHaveClass(["root"]);
    expect(menu({color: "a", state: "open"}).root()).toHaveClass(["root", "cv-open"]);
  });

  test("separates values that could otherwise shift across the field boundary", () => {
    // Field NAMES are not emitted — position identifies the key — so the separator is the only
    // thing keeping fields apart, and a value that contains it can forge one. Tailwind makes
    // that reachable rather than theoretical: an arbitrary value can hold a data URL, and
    // `data:image/png;base64,AAA` + `BBB` flattens to the same string as
    // `data:image/png` + `base64,AAA;BBB` on any printable separator.
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {first: {}, second: {}},
      compoundVariants: [{first: "data:image/png;base64,AAA", second: "BBB", class: {root: "cv"}}],
    });
    const asOne = {first: "data:image/png;base64,AAA", second: "BBB"};
    const asTwo = {first: "data:image/png", second: "base64,AAA;BBB"};

    expect(menu(asOne).root()).toHaveClass(["root", "cv"]);
    expect(menu(asOne).root()).toHaveClass(["root", "cv"]);
    expect(menu(asOne).root()).toHaveClass(["root", "cv"]);

    expect(menu(asTwo).root()).toHaveClass(["root"]);
  });

  test("separates two prop pairs that forge the field boundary exactly", () => {
    // The boundary case above uses a data URL, which a tagged separator happens to survive. This
    // one forges the separator EXACTLY: with fields joined rather than length-prefixed, the two
    // pairs below flatten to the identical key, so one call serves the other's classes.
    //
    // `group-hover:shadow-lg` is an ordinary Tailwind class, and it contains the colon plus the
    // string tag that any such separator would use — which is what makes this reachable rather
    // than theoretical.
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {first: {}, second: {}},
      compoundVariants: [{first: "group-hover:shadow-lg", second: "p-2", class: {root: "cv"}}],
    });
    const asOne = {first: "group-hover:shadow-lg", second: "p-2"};
    const asTwo = {first: "group-hover", second: "hadow-lg:sp-2"};

    expect(menu(asOne).root()).toHaveClass(["root", "cv"]);
    expect(menu(asOne).root()).toHaveClass(["root", "cv"]);
    expect(menu(asOne).root()).toHaveClass(["root", "cv"]);

    expect(menu(asTwo).root()).toHaveClass(["root"]);
  });

  test("separates an absent prop from one explicitly set to null", () => {
    // Resolution treats these differently — an absent prop falls back to the default, an
    // explicit null suppresses the variant — but when the default is ITSELF null both resolve
    // to the same value, so a key built from the value alone cannot tell them apart.
    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: {false: "tone-false", on: "tone-on"}},
      defaultVariants: {tone: null},
    });

    expect(button({tone: null})).toHaveClass(["base"]);
    expect(button({tone: null})).toHaveClass(["base"]);
    expect(button({tone: null})).toHaveClass(["base"]);

    expect(button({})).toHaveClass(["base", "tone-false"]);
  });

  test("does not share an entry between structurally equal objects", () => {
    // Compound conditions compare by identity, so two equal-looking objects resolve
    // differently. A value-based key cannot express that, so such a call must not be cached.
    const shared = {breakpoint: "md"};
    const button = defineVariants(createTv, {
      base: "base",
      variants: {dummy: {a: "dummy-a"}},
      compoundVariants: [{responsive: shared, class: "cv"}],
    });

    expect(button({responsive: shared})).toHaveClass(["base", "cv"]);
    expect(button({responsive: shared})).toHaveClass(["base", "cv"]);
    expect(button({responsive: shared})).toHaveClass(["base", "cv"]);

    expect(button({responsive: {breakpoint: "md"}})).toHaveClass(["base"]);
  });

  test("carries data URLs and base64 through the key intact", () => {
    // A base64 payload is long and contains `+`, `/` and `=`; a data URL prefix contains a
    // literal `;`; an encoded SVG contains `%`, quotes and angle brackets. All of these reach
    // the key as ordinary Tailwind arbitrary values.
    const base64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQ==";
    const values = [
      `bg-[url(data:image/png;base64,${base64})]`,
      `bg-[url(data:image/png;base64,${base64.repeat(40)})]`,
      'bg-[url("data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E")]',
      "bg-[url(https://a.example/x?y=1&z=2#frag)]",
    ];

    for (const value of values) {
      const menu = defineSlots(createTv, {
        slots: {root: "root"},
        variants: {token: {}},
        compoundVariants: [{token: value, class: {root: "cv"}}],
      });

      expect(menu({token: value}).root()).toHaveClass(["root", "cv"]);
      expect(menu({token: value}).root()).toHaveClass(["root", "cv"]);
      expect(menu({token: value}).root()).toHaveClass(["root", "cv"]);
      expect(menu({token: `${value}x`}).root()).toHaveClass(["root"]);

      // And as an override, where the same characters reach the override cache's own key.
      const styled = defineSlots(createTv, {slots: {root: "root"}, variants: {}});

      styled({});
      styled({});

      expect(styled({}).root({className: value})).toHaveClass(["root", value]);
    }
  });

  test("carries Tailwind arbitrary values through the key intact", () => {
    // Arbitrary values put brackets, parens, commas, quotes, colons and semicolons inside a
    // class name, and a data URL puts a semicolon in one routinely.
    const values = [
      "translate-x-[10px]",
      "w-[calc(100%-2rem)]",
      "grid-cols-[repeat(2,minmax(0,1fr))]",
      "[&>*]:m-1",
      "bg-[url('/a;b.png')]",
      "bg-[url(data:image/png;base64,iVBORw0KGgo=)]",
    ];

    for (const value of values) {
      const menu = defineSlots(createTv, {
        slots: {root: "root"},
        variants: {token: {}},
        compoundVariants: [{token: value, class: {root: "cv"}}],
      });

      expect(menu({token: value}).root()).toHaveClass(["root", "cv"]);
      expect(menu({token: value}).root()).toHaveClass(["root", "cv"]);
      expect(menu({token: value}).root()).toHaveClass(["root", "cv"]);
      expect(menu({token: `${value}-suffix`}).root()).toHaveClass(["root"]);
    }
  });

  test("caches around a per-frame arbitrary override without drifting", () => {
    // The animation shape: the override is new every frame and cannot be cached, but the
    // variant-derived core can — and the slots that are not overridden must not move.
    const menu = defineSlots(createTv, {
      slots: {root: "root p-2", label: "text-xs"},
      variants: {tone: {a: {root: "bg-red-500"}, b: {root: "bg-blue-500"}}},
      defaultVariants: {tone: "a"},
    });

    for (let frame = 0; frame < 5; frame++) {
      const styles = menu({tone: "a"});

      expect(styles.root({className: `translate-x-[${frame}px]`})).toHaveClass([
        "root",
        "p-2",
        "bg-red-500",
        `translate-x-[${frame}px]`,
      ]);
      expect(styles.label()).toHaveClass(["text-xs"]);
    }
  });

  test("invalidates a variants-path cache that is over its entry limit", () => {
    // The twin of the slots-path case: the two resolvers keep different cache types, so one is
    // not coverage for the other.
    //
    // The combination read back must be one the warm loop actually CACHED. The definition's
    // FIRST call takes the cold path and is never stored, so asserting on the defaults would
    // re-read a combination that misses either way — and the test would pass with invalidation
    // deleted outright.
    const tones = Array.from({length: 40}, (_unused, index) => `tone${index}`);
    const steps = Array.from({length: 12}, (_unused, index) => `step${index}`);
    const button = defineVariants(createTv, {
      base: "base",
      variants: {
        tone: Object.fromEntries(tones.map((tone) => [tone, `text-${tone}`])),
        step: Object.fromEntries(steps.map((step) => [step, `p-${step}`])),
      },
      compoundVariants: [{tone: "tone0", class: "cv-old"}],
      defaultVariants: {tone: "tone0", step: "step0"},
    });

    for (const tone of tones) {
      for (const step of steps) button({tone, step});
    }

    button.compoundVariants[0].class = "cv-new";

    expect(button({tone: "tone0", step: "step5"})).toHaveClass([
      "base",
      "text-tone0",
      "p-step5",
      "cv-new",
    ]);
    expect(button({tone: "tone7", step: "step3"})).toHaveClass(["base", "text-tone7", "p-step3"]);
  });

  test("serves a repeated variants-path call from the cache", () => {
    // The variants path returns a string, so identity cannot show a cache hit. A getter on the
    // variant values counts resolutions instead: without a cache every call recomputes.
    let resolutions = 0;
    const values: Record<string, unknown> = {};

    // The getter sits on the value these calls actually select, so it fires once per
    // resolution and not at all on a cache hit.
    Object.defineProperty(values, "a", {
      enumerable: true,
      get() {
        resolutions++;

        return "text-a";
      },
    });

    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: values},
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 8; call++) button({tone: "a"});

    expect(resolutions).toBeGreaterThan(0);

    const warmed = resolutions;

    for (let call = 0; call < 8; call++) button({tone: "a"});

    expect(resolutions).toBe(warmed);
  });

  test("keeps a compound-only condition key in the variants-path key", () => {
    // `state` exists only as a compound condition, and the variants path builds its own key.
    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [{tone: "a", state: "open", class: "cv"}],
      defaultVariants: {tone: "a"},
    });

    expect(button({state: "open"})).toHaveClass(["base", "text-a", "cv"]);
    expect(button({state: "open"})).toHaveClass(["base", "text-a", "cv"]);
    expect(button({state: "shut"})).toHaveClass(["base", "text-a"]);
    expect(button({state: "open"})).toHaveClass(["base", "text-a", "cv"]);
  });

  test("keeps a compoundSlots-only condition key in the key", () => {
    const menu = defineSlots(createTv, {
      slots: {title: "title"},
      variants: {tone: {a: {}}},
      compoundSlots: [{slots: ["title"], state: "open", class: "cs"}],
      defaultVariants: {tone: "a"},
    });

    expect(menu({state: "open"}).title()).toHaveClass(["title", "cs"]);
    expect(menu({state: "open"}).title()).toHaveClass(["title", "cs"]);
    expect(menu({state: "shut"}).title()).toHaveClass(["title"]);
    expect(menu({state: "open"}).title()).toHaveClass(["title", "cs"]);
  });

  test("keeps the default a call falls back to in the key", () => {
    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: {a: "text-a", b: "text-b"}},
      defaultVariants: {tone: "a"},
    });

    expect(button({})).toHaveClass(["base", "text-a"]);
    expect(button({})).toHaveClass(["base", "text-a"]);

    button.defaultVariants.tone = "b";

    expect(button({})).toHaveClass(["base", "text-b"]);
  });

  test("moving the default ends a run of cached identical calls", () => {
    // A caching layer is invisible to any assertion about class strings — a working cache and a
    // broken one produce the same output — so this counts RESOLUTIONS with a getter on the variant
    // value the call actually selects. That is the only technique that can see it.
    //
    // The count deliberately does not name a LAYER. The resolvers keep a single-entry memo in front
    // of the keyed cache, and it answers with the value the keyed cache below it would have
    // returned — same identity, no consumer code in between — so its existence is not observable
    // through this API at all, and either layer alone satisfies the first assertion. "Some cache
    // serves the repeat" is the whole of what is claimed here, and only disabling BOTH reddens it.
    //
    // That precondition is what this adds to "keeps the default a call falls back to in the key",
    // which asserts the classes after the move and stays green for a component that caches nothing.
    // Both calls straddling the move pass the SAME raw value — none — so a comparison built from
    // the caller's value alone reports "same" and serves the old string for ever; only the
    // EFFECTIVE value moves. Red under `readDependencyValues` keeping `value` rather than
    // `provided ? value : defaultVariants[key]`, and red under both cache layers disabled.
    let resolves = 0;
    const values: Record<string, unknown> = {};

    for (const tone of ["a", "b"]) {
      Object.defineProperty(values, tone, {
        enumerable: true,
        get() {
          resolves++;

          return `text-${tone}`;
        },
      });
    }

    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: values},
      defaultVariants: {tone: "a"},
    });

    // Past the cold invoke, which deliberately skips every cache.
    for (let call = 0; call < 3; call++) button({});

    const warmed = resolves;

    for (let call = 0; call < 20; call++) button({});

    // Twenty identical calls, nothing recomputed.
    expect(resolves).toBe(warmed);

    // Nothing about the CALL moves here — it passed no value before and passes none now. The value
    // the key is built from does.
    button.defaultVariants.tone = "b";

    expect(button({})).toHaveClass(["base", "text-b"]);
    expect(resolves).toBeGreaterThan(warmed);
  });

  test("does not share one entry between two different functions on a key it reads", () => {
    // A function cannot be keyed, so the call must bypass the cache rather than land on a
    // shared entry — otherwise two different handlers resolve to the same classes.
    const first = () => undefined;
    const second = () => undefined;
    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [{tone: "a", handler: first, class: "cv"}],
      defaultVariants: {tone: "a"},
    });

    expect(button({handler: first})).toHaveClass(["base", "text-a", "cv"]);
    expect(button({handler: first})).toHaveClass(["base", "text-a", "cv"]);
    expect(button({handler: second})).toHaveClass(["base", "text-a"]);
  });

  test("does not share one entry between two cyclic values on a key it reads", () => {
    const first: Record<string, unknown> = {};
    const second: Record<string, unknown> = {};

    first.self = first;
    second.self = second;

    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {tone: {a: {}}},
      compoundVariants: [{tone: "a", shape: first, class: {root: "cv"}}],
      defaultVariants: {tone: "a"},
    });

    expect(menu({shape: first}).root()).toHaveClass(["root", "cv"]);
    expect(menu({shape: first}).root()).toHaveClass(["root", "cv"]);
    expect(menu({shape: second}).root()).toHaveClass(["root"]);
  });

  test("separates a bigint from its decimal spelling", () => {
    const button = defineVariants(createTv, {
      base: "base",
      variants: {count: {}},
      compoundVariants: [{count: 1n, class: "cv"}],
    });

    expect(button({count: 1n})).toHaveClass(["base", "cv"]);
    expect(button({count: 1n})).toHaveClass(["base", "cv"]);
    expect(button({count: 1n})).toHaveClass(["base", "cv"]);
    expect(button({count: "1"})).toHaveClass(["base"]);
  });

  test("a cached slots result is a snapshot of the props it was called with", () => {
    // The result outlives the call — the parent cache keeps it — so it must not track later
    // edits to the caller's object. Each slot's no-argument value is computed eagerly and so
    // is already frozen; the slot-variant override path recomputes lazily, which is where
    // holding the caller's object rather than a copy of it becomes visible.
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {
        tone: {a: {root: "tone-a"}, b: {root: "tone-b"}},
        size: {sm: {root: "size-sm"}, lg: {root: "size-lg"}},
      },
      defaultVariants: {tone: "a", size: "sm"},
    });
    const props: Record<string, unknown> = {tone: "a", size: "sm"};

    menu(props);
    menu(props);

    const styles = menu(props);

    props.tone = "b";

    expect(styles.root()).toHaveClass(["root", "tone-a", "size-sm"]);
    expect(styles.root({size: "lg"})).toHaveClass(["root", "tone-a", "size-lg"]);
  });

  test("caches a call whose compound-only condition key it does not pass", () => {
    // `state` is reachable only as a compound condition and this call never passes it, so the
    // value reaching the key is undefined. Undefined compares by value like any other
    // primitive, so treating it as unkeyable would bypass the cache for every component
    // carrying a condition its callers usually omit — correct output, no cache.
    let resolutions = 0;
    const values: Record<string, unknown> = {};

    Object.defineProperty(values, "a", {
      enumerable: true,
      get() {
        resolutions++;

        return "text-a";
      },
    });

    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: values},
      compoundVariants: [{tone: "a", state: "open", class: "cv"}],
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 8; call++) button({});

    const warmed = resolutions;

    for (let call = 0; call < 8; call++) button({});

    expect(resolutions).toBe(warmed);
  });

  test("caches a call for a variant that has no default and is not passed", () => {
    let resolutions = 0;
    const values: Record<string, unknown> = {};

    Object.defineProperty(values, "a", {
      enumerable: true,
      get() {
        resolutions++;

        return "text-a";
      },
    });

    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: values, size: {sm: "p-1"}},
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 8; call++) button({});

    const warmed = resolutions;

    for (let call = 0; call < 8; call++) button({});

    expect(resolutions).toBe(warmed);
  });

  test("keeps an absent condition key distinct from one given a value", () => {
    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [{tone: "a", state: "open", class: "cv"}],
      defaultVariants: {tone: "a"},
    });

    expect(button({})).toHaveClass(["base", "text-a"]);
    expect(button({})).toHaveClass(["base", "text-a"]);
    expect(button({state: "open"})).toHaveClass(["base", "text-a", "cv"]);
    expect(button({})).toHaveClass(["base", "text-a"]);
    expect(button({state: "open"})).toHaveClass(["base", "text-a", "cv"]);
  });

  test("a compound slot the variants path never reads does not drop its cache", () => {
    // Without slots the variants resolver runs, and it never reads compoundSlots — so they are
    // excluded from both the dependency keys and change detection. Mutating one must therefore
    // leave the cache intact rather than clearing it on every call for a change that cannot
    // affect the output.
    let resolutions = 0;
    const values: Record<string, unknown> = {};

    Object.defineProperty(values, "a", {
      enumerable: true,
      get() {
        resolutions++;

        return "text-a";
      },
    });

    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: values},
      compoundVariants: [{tone: "a", class: "cv"}],
      compoundSlots: [{slots: ["root"], tone: "a", class: "cs"}],
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 4; call++) button({});

    const warmed = resolutions;

    button.compoundSlots[0].class = "cs-new";

    for (let call = 0; call < 4; call++) button({});

    expect(resolutions).toBe(warmed);
    expect(button({})).toHaveClass(["base", "text-a", "cv"]);
  });

  test("keys on condition keys from BOTH compound kinds at once", () => {
    // Every other case declares one compound kind or the other. With both present, a dependency
    // set built by short-circuiting on "has compounds" can skip the union entirely and fall back
    // to the variant keys — which silently drops `openState` and `sizeState` from the key, so
    // calls differing only in those share an entry and serve each other's classes.
    const menu = defineSlots(createTv, {
      slots: {root: "root", title: "title"},
      variants: {tone: {a: {}, b: {}}},
      compoundVariants: [{tone: "a", openState: "open", class: {root: "cv-open"}}],
      compoundSlots: [{slots: ["title"], sizeState: "wide", class: "cs-wide"}],
      defaultVariants: {tone: "a"},
    });

    expect(menu({openState: "open", sizeState: "wide"}).root()).toHaveClass(["root", "cv-open"]);
    expect(menu({openState: "open", sizeState: "wide"}).title()).toHaveClass(["title", "cs-wide"]);

    // Warm, so the assertions below read cached entries rather than the cold miss path.
    menu({openState: "open", sizeState: "wide"});

    expect(menu({openState: "shut", sizeState: "wide"}).root()).toHaveClass(["root"]);
    expect(menu({openState: "shut", sizeState: "wide"}).title()).toHaveClass(["title", "cs-wide"]);
    expect(menu({openState: "open", sizeState: "narrow"}).root()).toHaveClass(["root", "cv-open"]);
    expect(menu({openState: "open", sizeState: "narrow"}).title()).toHaveClass(["title"]);
    expect(menu({openState: "open", sizeState: "wide"}).root()).toHaveClass(["root", "cv-open"]);
  });

  test("does not read the caller's object again after the result is built", () => {
    // The snapshot exists so a cached result stops referencing the caller's object — retention
    // that class strings cannot show. Read COUNT is the observable proxy: a result that still
    // aliases the caller re-reads it on the lazy slot-override path, so the getter fires again.
    let reads = 0;
    const props: Record<string, unknown> = {size: "sm"};

    Object.defineProperty(props, "tone", {
      enumerable: true,
      get() {
        reads++;

        return "a";
      },
    });

    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {
        tone: {a: {root: "tone-a"}, b: {root: "tone-b"}},
        size: {sm: {root: "size-sm"}, lg: {root: "size-lg"}},
      },
      defaultVariants: {tone: "a", size: "sm"},
    });

    for (let warm = 0; warm < 3; warm++) menu(props);

    const styles = menu(props);
    const settled = reads;

    // The lazy path recomputes; it must recompute from the snapshot, not from the caller.
    styles.root({size: "lg"});
    styles.root({size: "lg"});
    styles.root({size: "lg"});

    expect(reads).toBe(settled);
    expect(styles.root({size: "lg"})).toHaveClass(["root", "tone-a", "size-lg"]);
  });

  test("accepts a null argument on every call, not just the first", () => {
    // `component(null)` is legal and reaches the key builder and the props snapshot. Both once
    // tested only for `undefined` and then dereferenced. The cold path hides it: the first
    // invoke skips the cache, so a single call succeeds and only a WARM component throws.
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {tone: {a: {root: "tone-a"}}},
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 4; call++) {
      expect(menu(null).root()).toHaveClass(["root", "tone-a"]);
    }

    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [{tone: "a", state: "open", class: "cv"}],
      defaultVariants: {tone: "a"},
    });

    for (let call = 0; call < 4; call++) {
      expect(button(null)).toHaveClass(["base", "text-a"]);
    }
  });

  test("separates class and className overrides that would forge the join between them", () => {
    // The override cache keys on the two override strings together. Joining them with a
    // separator is forgeable by a value containing it — the same defect the props fingerprint
    // length-prefixes to avoid, and the same argument applies to both keys.
    const nul = String.fromCharCode(0);
    const button = defineVariants(createTv, {base: "base"});

    expect(button({class: `a${nul}b`, className: ""})).toBe(`base a${nul}b`);
    expect(button({class: `a${nul}b`, className: ""})).toBe(`base a${nul}b`);
    expect(button({class: "a", className: `b${nul}`})).toBe(`base a b${nul}`);
  });

  test("keeps distinct string values distinct", () => {
    // The tags must not collapse ordinary strings into each other.
    const component = defineVariants(createTv, {
      base: "base",
      variants: {size: {small: "p-1", large: "p-4"}},
      defaultVariants: {size: "small"},
    });

    expect(component({size: "small"})).toHaveClass(["base", "p-1"]);
    expect(component({size: "small"})).toHaveClass(["base", "p-1"]);
    expect(component({size: "large"})).toHaveClass(["base", "p-4"]);
    expect(component({size: "small"})).toHaveClass(["base", "p-1"]);
  });

  test("two calls whose key cannot be built are never served from one another", () => {
    // An object variant value compares by identity, which no value-based key can represent, so
    // the fingerprint is null and the call must bypass the cache. Bypassing means resolving
    // FRESH — not looking the entry up under the absent key, which files every unkeyable call
    // together and hands the second one the first's classes. `tone` is what makes that visible.
    const boxed = {value: "lg"};
    const panel = defineSlots(createTv, {
      slots: {base: "base"},
      variants: {
        size: {lg: {base: "base-lg"}},
        tone: {loud: {base: "tone-loud"}, quiet: {base: "tone-quiet"}},
      },
    });

    // Warmed first: the first invoke of a definition skips the cache, so an unwarmed component
    // would take the bypass for the wrong reason.
    panel({tone: "loud"});

    expect(panel({size: boxed, tone: "loud"}).base()).toHaveClass(["base", "tone-loud"]);
    expect(panel({size: boxed, tone: "quiet"}).base()).toHaveClass(["base", "tone-quiet"]);

    const button = defineVariants(createTv, {
      base: "base",
      variants: {size: {lg: "text-lg"}, tone: {loud: "text-loud", quiet: "text-quiet"}},
    });

    button({tone: "loud"});

    expect(button({size: boxed, tone: "loud"})).toHaveClass(["base", "text-loud"]);
    expect(button({size: boxed, tone: "quiet"})).toHaveClass(["base", "text-quiet"]);
  });

  test("a variant named after an Object.prototype member resolves like any other", () => {
    // Prop names are consumer strings. A plain `{}` reports a dozen of them as already present
    // and answers reads with an inherited function, and `__proto__` is worse still — assigning to
    // it sets the prototype and stores nothing, so the value simply vanishes. Anything that copies
    // props into an object it later reads by name has to be null-prototype or it is not a copy.
    // Computed keys throughout: a bare `__proto__:` in an object literal sets the prototype
    // instead of creating the property, so writing these the obvious way tests nothing.
    const button = defineVariants(createTv, {
      base: "base",
      variants: {
        ["__proto__"]: {a: "proto-a", b: "proto-b"},
        toString: {a: "to-string-a"},
        constructor: {a: "ctor-a"},
      },
    });

    // Warmed, because the cold invoke resolves straight from the caller's object and so cannot
    // see the defect at all — it only appears once a call resolves from a copy.
    expect(warm(() => button({["__proto__"]: "b"}))).toHaveClass(["base", "proto-b"]);
    expect(button({["__proto__"]: "a"})).toHaveClass(["base", "proto-a"]);
    expect(warm(() => button({toString: "a"}))).toHaveClass(["base", "to-string-a"]);
    expect(warm(() => button({constructor: "a"}))).toHaveClass(["base", "ctor-a"]);

    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {["__proto__"]: {a: {root: "proto-a"}, b: {root: "proto-b"}}},
    });

    expect(warm(() => menu({["__proto__"]: "b"}).root())).toHaveClass(["root", "proto-b"]);
    expect(menu({["__proto__"]: "a"}).root()).toHaveClass(["root", "proto-a"]);

    // The ABSENT case: the default applies, as it does for a variant with any other name. Every
    // published version resolves this to `base` alone — the caller supplied nothing, so
    // `props.toString` answers with `Object.prototype.toString` rather than `undefined`, and that
    // shadows the default so the variant contributes nothing at all.
    //
    // Two changes together make it behave: the capture treats a value reachable only through
    // `Object.prototype` as not supplied, so the default is what reaches the key; and the record
    // compounds are matched against carries no prototype, so the miss reads back as `undefined`
    // there too. Reddens if either is reverted.
    const withDefault = defineVariants(createTv, {
      base: "base",
      variants: {toString: {a: "to-string-a"}},
      defaultVariants: {toString: "a"},
    });

    expect(warm(() => withDefault({}))).toHaveClass(["base", "to-string-a"]);
  });

  test("a prop inherited from the caller's prototype resolves, and keys, like an own one", () => {
    // `for...in` reaches inherited enumerable properties and so does a read by name, so every
    // published version resolves from them. A capture that tested for own keys dropped them from
    // BOTH the classes and the key at once, which is worse than either alone: two callers
    // differing only in an inherited value produced one entry, and whichever warmed it first
    // rendered its classes for the other one for the life of the component.
    const button = defineVariants(createTv, {
      base: "base",
      variants: {color: {ghost: "c-ghost", solid: "c-solid"}},
      defaultVariants: {color: "solid"},
    });

    const ghost = asRecord(Object.create({color: "ghost"}));

    expect(warm(() => button(ghost))).toHaveClass(["base", "c-ghost"]);

    // The collision: same own keys, different inherited value, so an own-key capture gives both
    // the empty key and serves the first one's answer to the second.
    const solid = asRecord(Object.create({color: "solid"}));

    expect(warm(() => button(solid))).toHaveClass(["base", "c-solid"]);
    expect(button(ghost)).toHaveClass(["base", "c-ghost"]);

    // A compound conditioned on the inherited key has to see it too — it reaches resolution
    // through `getCompleteProps` rather than `getVariantValue`, so it is a separate reader.
    const badge = defineVariants(createTv, {
      base: "base",
      variants: {size: {large: "s-large"}},
      compoundVariants: [{color: "ghost", size: "large", class: "cv-hit"}],
    });

    const large = asRecord(Object.create({color: "ghost"}));

    large.size = "large";

    expect(warm(() => badge(large))).toHaveClass(["base", "s-large", "cv-hit"]);

    const slotted = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {ghost: {root: "c-ghost"}, solid: {root: "c-solid"}}},
      defaultVariants: {color: "solid"},
    });

    expect(warm(() => slotted(ghost).root())).toHaveClass(["root", "c-ghost"]);
  });

  test("a COMPOUND condition named after an Object.prototype member matches when supplied", () => {
    // A supplied value shadows the inherited member, so this half works on every version and is
    // pinned here because the capture is what carries it: a capture that read inherited members,
    // or one built on a prototype, would break it. The ABSENT half is the case below.
    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: {a: "text-a"}},
      compoundVariants: [{tone: "a", toString: "on", class: "cv"}],
      defaultVariants: {tone: "a"},
    });

    expect(warm(() => button({toString: "on"}))).toHaveClass(["base", "text-a", "cv"]);
    expect(button({toString: "off"})).toHaveClass(["base", "text-a"]);
    expect(button({})).toHaveClass(["base", "text-a"]);
  });

  test("a COMPOUND condition named after an Object.prototype member matches when ABSENT", () => {
    // `undefined` as a condition means "the caller did not supply this", and that has to hold for
    // these eight exactly as it does for every ordinary name. The record the matcher reads carries
    // no prototype, so a key nobody supplied reads back as `undefined` rather than as whatever
    // `Object.prototype` happens to carry under that name.
    //
    // Reddens with that record built as a plain `{}` — then `toString` reads back as the inherited
    // function, the comparison against `undefined` fails, and the compound silently never applies.
    // All eight are swept rather than one representative, because the eight are the whole of the
    // affected surface and a fix that reached only some of them would look correct.
    const PROTOTYPE_MEMBERS = [
      "toString",
      "valueOf",
      "constructor",
      "hasOwnProperty",
      "isPrototypeOf",
      "propertyIsEnumerable",
      "toLocaleString",
      "__proto__",
    ] as const;

    const unmatched: string[] = [];

    for (const member of PROTOTYPE_MEMBERS) {
      const button = defineVariants(createTv, {
        base: "base",
        variants: {tone: {a: "text-a"}},
        compoundVariants: [{tone: "a", [member]: undefined, class: "cv"}],
        defaultVariants: {tone: "a"},
      });

      // Cold AND warm: the two invoke paths build that record from different call sites, so a fix
      // reaching only one of them leaves the first render disagreeing with every later one.
      if (button({}) !== "base text-a cv") unmatched.push(`${member} (cold)`);
      if (button({}) !== "base text-a cv") unmatched.push(`${member} (warm)`);
    }

    expect(unmatched).toEqual([]);
  });

  test("an unkeyable value ends the KEY but not the capture", () => {
    // A value that compares by identity cannot be keyed, so the fingerprint stops there — but the
    // call still has to RESOLVE, and it resolves from the capture, so the capture must not stop.
    //
    // Three dependency keys with the unkeyable one FIRST is what makes the difference visible.
    // With two, the second is captured before the loop would have stopped, so stopping and
    // continuing produce the same result and the case asserts nothing.
    const boxed = {};
    const button = defineVariants(createTv, {
      base: "base",
      variants: {alpha: {}, beta: {b: "beta-b"}, gamma: {g: "gamma-g"}},
    });

    // Warmed, because the cold invoke never builds a key and so never reaches this loop.
    warm(() => button({alpha: "x", beta: "b", gamma: "g"}));

    expect(button({alpha: boxed, beta: "b", gamma: "g"})).toHaveClass([
      "base",
      "beta-b",
      "gamma-g",
    ]);
  });

  test("each dependency prop is read exactly ONCE per call", () => {
    // The key and the classes it labels must describe the same value. A prop is under no
    // obligation to answer the same way twice — a reactive getter recomputes, and one with a side
    // effect can change what a later read sees — so reading once for the key and again for
    // resolution files one call's classes under another call's key. That entry is then served for
    // the life of the component, and nothing about it looks wrong from outside.
    //
    // Counting the reads is the pin rather than staging a drift at a particular read, because
    // WHERE a second read would land is exactly the implementation detail under test. At one read
    // there is nothing for a drifting getter to disagree with.
    //
    // The counted call has to MISS both caches, which is what warming on a DIFFERENT value buys. A
    // repeat is answered by the single-entry memo in front of the keyed cache, before a key is ever
    // built — so counting a repeat is green for the whole key-building path this names, and green
    // for the resolve below it too. Missing both puts the key build AND the resolve under the
    // counter: red for a second read inserted anywhere on either, and red for a resolve handed the
    // caller's object rather than the snapshot the key came from. Nothing here OBSERVES the memo —
    // a build without one keys and resolves this call identically, and stays red the same way.
    let reads = 0;
    const countedProps: LooseRecord = {
      get tone() {
        reads++;

        return "a";
      },
    };

    const button = defineVariants(createTv, {
      base: "root",
      variants: {tone: {a: "v-a", b: "v-b"}, size: {lg: "s-lg"}},
      compoundVariants: [{tone: "a", size: "lg", class: "cv"}],
      defaultVariants: {tone: "a", size: "lg"},
    });

    // Warmed past the cold invoke — which skips the cache and so reads for resolution only — on a
    // value the counted call does not share, so the memo holds `b` and `a` is a key nobody has
    // built yet.
    button({tone: "b"});
    button({tone: "b"});
    reads = 0;

    expect(button(countedProps)).toHaveClass(["root", "v-a", "s-lg", "cv"]);
    expect(reads).toBe(1);

    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {tone: {a: {root: "v-a"}, b: {root: "v-b"}}, size: {lg: {root: "s-lg"}}},
      compoundVariants: [{tone: "a", size: "lg", class: {root: "cv"}}],
      defaultVariants: {tone: "a", size: "lg"},
    });

    menu({tone: "b"}).root();
    menu({tone: "b"}).root();
    reads = 0;

    expect(menu(countedProps).root()).toHaveClass(["root", "v-a", "s-lg", "cv"]);
    expect(reads).toBe(1);
  });

  test("mutating the PUBLISHED variantKeys does not change which props are keyed", () => {
    // `component.variantKeys` is a public array, and with no compounds the dependency list is the
    // same set of names. Handing the published array straight back would put a consumer-reachable
    // object in the path that builds every cache key: emptying it here would leave two calls that
    // resolve differently sharing one entry. Resolution itself reads the compiled variant list,
    // so nothing else about the component moves — the collision would be the only symptom.
    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: {a: "text-a", b: "text-b"}},
    });

    // Warm past the cold invoke, so the dependency list exists before it is clobbered.
    button({tone: "a"});
    button({tone: "a"});

    button.variantKeys.length = 0;

    expect(button({tone: "b"})).toHaveClass(["base", "text-b"]);
    expect(button({tone: "a"})).toHaveClass(["base", "text-a"]);
  });

  test("a non-string class override is not filed under the string part of the key", () => {
    // The override cache key is built from the string spellings of `class` and `className`
    // alone, because an array or an object has no value-based key. Any override that is not a
    // string therefore has to skip the cache entirely: filing them lands every one of them on the
    // same key, and the second call is served the first call's classes.
    const button = defineVariants(createTv, {base: "text-sm"});

    expect(button({class: ["p-4"]})).toHaveClass(["text-sm", "p-4"]);
    expect(button({class: ["m-2"]})).toHaveClass(["text-sm", "m-2"]);
    expect(button({className: {"font-bold": true}})).toHaveClass(["text-sm", "font-bold"]);
    expect(button({className: {italic: true}})).toHaveClass(["text-sm", "italic"]);

    // A definition with nothing in it resolves to no core at all, so the override is the whole
    // result — the one shape where the key's core half is absent rather than a string.
    expect(defineVariants(createTv, {})({class: "p-4"})).toHaveClass(["p-4"]);
  });
});
