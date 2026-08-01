import {describe, expect, test} from "vitest";

import {tv} from "../index";
import {tv as tvLite} from "../lite";
import {defineSlots, defineVariants, type LooseRecord, readSlot} from "./support/loose.js";

/**
 * Every place a consumer STRING becomes an object KEY, attacked.
 *
 * The library maps consumer strings onto keys in six places — the props capture, the complete-props
 * record, the slots result, the per-slot compound index, the variant map and the merge helpers —
 * and a name like `__proto__` or `constructor` behaves differently from every other string in all
 * of them. Two failures are possible and they are not the same size:
 *
 *   GLOBAL — a write that reaches `Object.prototype`, changing every object in the process. That
 *            is the one that turns a class-name library into a remote-code-execution surface, and
 *            the suite's first assertion is that it never happens.
 *   LOCAL  — a `__proto__` key re-parenting the one record built by the call that carried it,
 *            so a read for a key nobody supplied answers out of the injected object. Confined to
 *            that call, and still able to fire a compound the caller never asked for.
 *
 * The rest of the file pins the null-prototype records that make the local case unreachable on the
 * paths that have one, and the cache-key encoding that keeps two calls with different values off
 * one entry.
 */

const BUILTIN_PROTOTYPES = [
  ["Object.prototype", Object.prototype],
  ["Array.prototype", Array.prototype],
  ["Function.prototype", Function.prototype],
  ["String.prototype", String.prototype],
] as const;

/**
 * The own-property names of every prototype a hostile key could plausibly reach, as one string.
 *
 * Own NAMES rather than values: a write is what matters, and comparing values would report a
 * difference for any harmless identity change in the runtime's own members.
 */
const builtinPrototypeCensus = (): string =>
  BUILTIN_PROTOTYPES.map(
    ([name, prototype]) => `${name}[${Object.getOwnPropertyNames(prototype).sort().join(",")}]`,
  ).join(" ");

/** The names that behave differently from every other string when used as an object key. */
const HOSTILE_NAMES = ["__proto__", "constructor", "prototype", "toString", "valueOf"] as const;

/** An own `__proto__` DATA property, which an object literal written the obvious way cannot make. */
const withOwnProtoKey = (payload: LooseRecord): LooseRecord =>
  JSON.parse(`{"tone":"a","__proto__":${JSON.stringify(payload)}}`) as LooseRecord;

const polluteObjectPrototype = (enumerable: boolean, value: string): void => {
  Object.defineProperty(Object.prototype, "secret", {
    configurable: true,
    enumerable,
    value,
    writable: true,
  });
};

const restoreObjectPrototype = (): void => {
  Reflect.deleteProperty(Object.prototype, "secret");
};

describe.each([
  ["tv", tv],
  ["tv/lite", tvLite],
] as const)("%s prototype pollution", (_label, createTv) => {
  test("every site that turns a consumer string into a key accepts a hostile name", () => {
    // Reddens under `indexCompoundSlotsBySlot`'s null-prototype record becoming a plain `{}`: the
    // sweep names a slot `constructor`, `index.constructor` answers `Object`, so the guard that
    // creates the array never fires and the push throws. The "resolves rather than throwing" case
    // below states that as one definition's behaviour; this is the whole six-site surface.
    //
    // The census is the file's GLOBAL claim, and it is checked against a deliberate write first so
    // it cannot quietly stop observing. It reports a difference for a write that reaches a shared
    // prototype — a shape no path here produces, because every hostile assignment the library makes
    // lands on a record the call owns: `result["__proto__"] = value` re-parents `result`, it does
    // not write to `Object.prototype`. It stays as the net for the first path that does.
    const census = builtinPrototypeCensus();

    Object.defineProperty(Object.prototype, "tvAuditSentinel", {configurable: true, value: 1});
    expect(builtinPrototypeCensus()).not.toBe(census);
    Reflect.deleteProperty(Object.prototype, "tvAuditSentinel");
    expect(builtinPrototypeCensus()).toBe(census);

    // One attack per site that turns a consumer string into a key. Completing the sweep is the
    // assertion — a name that breaks a site throws rather than resolving — and the census adds that
    // none of them left a mark on a prototype every object shares.
    for (const name of HOSTILE_NAMES) {
      const variants = defineVariants(createTv, {
        base: "base",
        variants: {[name]: {a: "hostile-a"}, tone: {a: "tone-a"}},
        defaultVariants: {[name]: "a"},
        compoundVariants: [{[name]: "a", tone: "a", class: "cv"}],
      });

      variants({[name]: "a", tone: "a"});
      variants({[name]: "a", tone: "a"});
      variants({[name]: "a", tone: "a", class: "override"});
      variants(withOwnProtoKey({[name]: "a"}));

      const slots = defineSlots(createTv, {
        slots: {root: "root", [name]: "hostile-slot"},
        variants: {[name]: {a: {root: "hostile-a"}}, tone: {a: {[name]: "tone-a"}}},
        compoundVariants: [{tone: "a", class: {[name]: "cv"}}],
        compoundSlots: [{slots: [name, "root"], tone: "a", class: "cs"}],
      });

      readSlot(slots({tone: "a"}), name)();
      readSlot(slots({tone: "a"}), name)({[name]: "a"});
      readSlot(slots(withOwnProtoKey({[name]: "a"})), "root")();

      // The merge helpers are the sixth site: `extend` runs both `mergeObjects` (variants) and
      // `joinObjects` (slots) over the two definitions' consumer keys.
      const extended = defineSlots(createTv, {
        extend: slots,
        slots: {[name]: "extended-slot"},
        variants: {[name]: {a: {root: "extended-a"}}},
      });

      readSlot(extended({tone: "a"}), "root")();
    }

    expect(builtinPrototypeCensus()).toBe(census);
  });

  test("a __proto__ DECLARED as a compound condition reaches resolution and re-parents nothing", () => {
    // Declaring `__proto__` as a compound CONDITION is what puts it in the dependency set, and that
    // is the only way the value a caller supplies for it survives to a warm call: the props a warm
    // call resolves from are a capture taken over the dependency keys, and a key outside that set
    // is never copied into it. So this is the widest the local case gets, on both entry points, and
    // `secret` is the tell — a condition nobody supplied, matchable only out of an injected object.
    //
    // Reddens under two mutants, which is why the returned string is the assertion rather than the
    // call being made for its side effect. Remove `getCompleteProps`' `__proto__` guard and the
    // copy into the matcher record re-parents it, so every condition the injected object carries
    // matches. Make the capture record a plain `{}` instead of a null-prototype one and the store
    // runs the inherited SETTER, re-parenting the capture itself — the injected keys then arrive as
    // inherited ENUMERABLE members and `for...in` copies them into the matcher record by name.
    const component = defineVariants(createTv, {
      base: "base",
      variants: {tone: {a: "tone-a"}},
      compoundVariants: [
        JSON.parse('{"__proto__":"never-matches","class":"unrelated"}') as LooseRecord,
        {secret: "on", class: "injected"},
      ],
    });

    const clean = "base tone-a";

    expect(component({tone: "a"})).toHaveClass(clean);
    expect(component({tone: "a"})).toHaveClass(clean);

    expect(component(withOwnProtoKey({secret: "on"}))).toHaveClass(clean);
    expect(component(withOwnProtoKey({secret: "on"}))).toHaveClass(clean);

    // The same component, called again without the hostile key, resolves as it did before it.
    expect(component({tone: "a"})).toHaveClass(clean);

    // The slots path captures on EVERY invoke including the first, so a declared condition is the
    // only shape that reaches its matcher either — from cold, and warm.
    const slots = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {tone: {a: {root: "tone-a"}}},
      compoundVariants: [
        JSON.parse('{"__proto__":"never-matches","class":{"root":"unrelated"}}') as LooseRecord,
        {secret: "on", class: {root: "injected"}},
      ],
    });

    expect(readSlot(slots(withOwnProtoKey({secret: "on"})), "root")()).toHaveClass("root tone-a");
    expect(readSlot(slots(withOwnProtoKey({secret: "on"})), "root")()).toHaveClass("root tone-a");

    // A compound SLOT reads the same record, and is a separate matcher from the one above.
    const compoundSlotted = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {tone: {a: {root: "tone-a"}}},
      compoundSlots: [
        JSON.parse(
          '{"slots":["root"],"__proto__":"never-matches","class":"unrelated"}',
        ) as LooseRecord,
        {slots: ["root"], secret: "on", class: "injected"},
      ],
    });

    expect(readSlot(compoundSlotted(withOwnProtoKey({secret: "on"})), "root")()).toHaveClass(
      "root tone-a",
    );
    expect(readSlot(compoundSlotted(withOwnProtoKey({secret: "on"})), "root")()).toHaveClass(
      "root tone-a",
    );
  });

  test("an undeclared __proto__ key never reaches the record compounds are matched against", () => {
    // A key the definition declares nowhere is outside the dependency set, so a capture cannot
    // carry it. That leaves the FIRST invoke of each entry point — the one with no cache entry to
    // key and so no reason to build a capture at all — and the two answer it differently, which is
    // the whole of this case. A warm call is immune by construction, so an assertion there would be
    // green whatever the resolver did and there is none.
    //
    // The variants one hands the caller's own object onward, so the hostile key arrives at
    // `getCompleteProps` with nothing in between and only its `__proto__` guard refuses it. Reddens
    // under that guard removed, on its own. A fresh component is what keeps the call cold: a
    // definition has exactly one.
    const cold = defineVariants(createTv, {
      base: "base",
      variants: {tone: {a: "tone-a"}},
      compoundVariants: [{secret: "on", class: "injected"}],
    });

    expect(cold(withOwnProtoKey({secret: "on"}))).toHaveClass("base tone-a");

    // The slots one captures even from cold, because the result outlives the call — so the key is
    // stopped a hop earlier here, before the guard is reached. Reddens only under BOTH that capture
    // replaced by the caller's own object AND the guard removed: either alone leaves one of the two
    // hops standing, and one is enough.
    const slots = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {tone: {a: {root: "tone-a"}}},
      compoundVariants: [{secret: "on", class: {root: "injected"}}],
    });

    expect(readSlot(slots(withOwnProtoKey({secret: "on"})), "root")()).toHaveClass("root tone-a");
  });

  test("a slot named after an Object.prototype member resolves rather than throwing", () => {
    // The per-slot compound index is keyed by consumer slot names. A plain `{}` answers
    // `index.constructor` with `Object` and `index.toString` with a function, so the guard that
    // creates the array never fires and the push lands on the inherited member — and on the read
    // side a truthy non-array reaches the matcher and is destructured as a compound.
    const targeted = defineSlots(createTv, {
      slots: {constructor: "ctor-slot", toString: "to-string-slot"},
      variants: {tone: {a: {constructor: "tone-a"}}},
      compoundSlots: [{slots: ["constructor", "toString"], class: "cs"}],
    });
    const targetedParts = targeted({tone: "a"});

    expect(readSlot(targetedParts, "constructor")()).toHaveClass("ctor-slot tone-a cs");
    expect(readSlot(targetedParts, "toString")()).toHaveClass("to-string-slot cs");

    // The empty-compound-slots path reads a DIFFERENT record — the shared one returned when a
    // definition has no compound slots at all — so it is a second site with the same failure.
    const untargeted = defineSlots(createTv, {
      slots: {constructor: "ctor", toString: "to-string", valueOf: "value-of", length: "len"},
      variants: {tone: {a: {constructor: "tone-a"}}},
      compoundVariants: [{tone: "a", class: {toString: "cv-to-string"}}],
    });
    const untargetedParts = untargeted({tone: "a"});

    expect(readSlot(untargetedParts, "constructor")()).toHaveClass("ctor tone-a");
    expect(readSlot(untargetedParts, "toString")()).toHaveClass("to-string cv-to-string");
    expect(readSlot(untargetedParts, "valueOf")()).toHaveClass("value-of");
    expect(readSlot(untargetedParts, "length")()).toHaveClass("len");
  });

  test("a prop NAME cannot forge another call's cache key", () => {
    // A key built by joining `name + ":" + value + ";"` is forgeable from either half, because both
    // are consumer strings and neither is delimited: one prop named `alpha:x;beta` with the value
    // `y` spells exactly what `{alpha: "x", beta: "y"}` spells. The forged call conditions on
    // nothing the compound asks for, so a shared entry serves it classes it never earned.
    const component = defineVariants(createTv, {
      base: "base",
      variants: {tone: {a: "tone-a"}},
      compoundVariants: [{alpha: "x", beta: "y", class: "hit"}],
    });

    component({tone: "a"});
    component({tone: "a"});

    expect(component({tone: "a", alpha: "x", beta: "y"})).toHaveClass("base tone-a hit");
    expect(component({tone: "a", alpha: "x", beta: "y"})).toHaveClass("base tone-a hit");
    expect(component({tone: "a", ["alpha:x;beta"]: "y"})).toHaveClass("base tone-a");

    // The same forgery from the VALUE side, where a compound condition's own text spells a key
    // boundary.
    const valueSide = defineVariants(createTv, {
      base: "base",
      variants: {alpha: {}, beta: {}},
      compoundVariants: [{alpha: "x", beta: "y", class: "hit"}],
    });

    valueSide({alpha: "x", beta: "y"});
    valueSide({alpha: "x", beta: "y"});

    expect(valueSide({alpha: "x", beta: "y"})).toHaveClass("base hit");
    expect(valueSide({alpha: "x;beta:y"})).toHaveClass("base");
  });

  test.each([
    ["enumerable", true],
    ["non-enumerable", false],
  ])("a %s polluted Object.prototype cannot desynchronise the cache", (_kind, enumerable) => {
    // A component reads props BY NAME, so a polluted prototype answers for a prop the caller never
    // supplied — on every published version, and on this one. What must hold is that the cache does
    // not disagree with resolution about it: a WARMED component and a FRESHLY CREATED one are the
    // same definition and the same props, so they must produce the same string. A key built by
    // enumerating the caller's object cannot see a non-enumerable member the by-name read does see,
    // and serves an entry filed before the pollution existed.
    const definition = (): LooseRecord => ({
      base: "base",
      variants: {tone: {a: "tone-a"}},
      compoundVariants: [{secret: "on", class: "injected"}],
    });
    const warmed = defineVariants(createTv, definition());

    warmed({tone: "a"});
    warmed({tone: "a"});
    warmed({tone: "a"});

    const census = builtinPrototypeCensus();

    polluteObjectPrototype(enumerable, "on");

    try {
      expect(warmed({tone: "a"})).toBe(defineVariants(createTv, definition())({tone: "a"}));
    } finally {
      restoreObjectPrototype();
    }

    // Nothing the library did while the prototype was polluted wrote to it.
    expect(builtinPrototypeCensus()).toBe(census);

    // And the pollution leaves no residue: the entry resolved during the window is filed under a
    // key that records what it was resolved from, so it is not served once the window closes.
    expect(warmed({tone: "a"})).toHaveClass("base tone-a");
    expect(defineVariants(createTv, definition())({tone: "a"})).toHaveClass("base tone-a");
  });
});
