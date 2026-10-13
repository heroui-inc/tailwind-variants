import {describe, expect, test} from "vitest";

import {tv} from "../index";
import {tv as tvLite} from "../lite";
import {asRecord, defineSlots, defineVariants, type LooseRecord} from "./support/loose.js";

// Every case warms the cache with several calls BEFORE mutating: the first invoke of a
// definition skips the cache, so a case that mutates after one call takes the miss path and
// passes even when invalidation is broken.
const warm = (read: () => string, times = 3): string => {
  let last = "";

  for (let index = 0; index < times; index++) last = read();

  return last;
};

describe.each([
  ["tv", tv],
  ["tv/lite", tvLite],
] as const)("%s compound invalidation", (_label, createTv) => {
  test("sees a mutation of the array passed to tv(), never touching the metadata property", () => {
    const compoundVariants = [{color: "red" as const, class: {root: "cv-old"}}];
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {red: {}, blue: {}}},
      compoundVariants,
      defaultVariants: {color: "red"},
    });

    expect(warm(() => menu({color: "red"}).root())).toHaveClass(["root", "cv-old"]);

    compoundVariants[0].class = {root: "cv-new"};

    expect(menu({color: "red"}).root()).toHaveClass(["root", "cv-new"]);
  });

  test("sees a compound PUSHED onto the array after the first call", () => {
    // Every case above mutates a compound that already exists, which the compiled snapshot can
    // still be walked for. A push changes the array's LENGTH, and a walk over the snapshot has
    // nothing to report — 3.2.2 honours it because it iterates the consumer's array live.
    const compoundVariants: LooseRecord[] = [{size: "sm", class: "cv-first"}];
    const button = defineVariants(createTv, {
      base: "b",
      variants: {size: {sm: "is-sm"}},
      compoundVariants,
      defaultVariants: {size: "sm"},
    });

    expect(warm(() => button({size: "sm"}))).toHaveClass(["b", "is-sm", "cv-first"]);

    compoundVariants.push({size: "sm", class: "cv-pushed"});

    expect(button({size: "sm"})).toHaveClass(["b", "is-sm", "cv-first", "cv-pushed"]);
  });

  test("sees a compound SPLICED out of the array after the first call", () => {
    // The other direction, and the worse one: a stale entry keeps applying a compound the
    // consumer removed, so classes appear that the current definition does not declare.
    const compoundVariants: LooseRecord[] = [
      {size: "sm", class: "cv-first"},
      {size: "sm", class: "cv-second"},
    ];
    const button = defineVariants(createTv, {
      base: "b",
      variants: {size: {sm: "is-sm"}},
      compoundVariants,
      defaultVariants: {size: "sm"},
    });

    expect(warm(() => button({size: "sm"}))).toHaveClass(["b", "is-sm", "cv-first", "cv-second"]);

    compoundVariants.splice(1, 1);

    expect(button({size: "sm"})).toHaveClass(["b", "is-sm", "cv-first"]);
  });

  test("sees the FIRST compound added to a definition created with none", () => {
    // The hardest of the three. A definition with no compounds decides at compile time that it
    // needs no change detection at all, so nothing is watching the array when the first one
    // arrives — the component can never see it, however many calls follow.
    const compoundVariants: LooseRecord[] = [];
    const button = defineVariants(createTv, {
      base: "b",
      variants: {size: {sm: "is-sm"}},
      compoundVariants,
      defaultVariants: {size: "sm"},
    });

    expect(warm(() => button({size: "sm"}))).toHaveClass(["b", "is-sm"]);

    compoundVariants.push({size: "sm", class: "cv-late"});

    expect(button({size: "sm"})).toHaveClass(["b", "is-sm", "cv-late"]);
  });

  test("sees a compoundSlots entry pushed after the first call", () => {
    // The slots resolver keeps its own detection, so the variants cases above are not coverage
    // for it.
    const compoundSlots: LooseRecord[] = [];
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {size: {sm: {root: "is-sm"}}},
      compoundSlots,
      defaultVariants: {size: "sm"},
    });

    expect(warm(() => menu({size: "sm"}).root())).toHaveClass(["root", "is-sm"]);

    compoundSlots.push({slots: ["root"], size: "sm", class: "cs-late"});

    expect(menu({size: "sm"}).root()).toHaveClass(["root", "is-sm", "cs-late"]);
  });

  test("a mutation of the VARIANTS or SLOTS map is NOT seen, and that is the trade", () => {
    // Pinned as it behaves, not as it should behave, because which one is right is a trade rather
    // than a defect — and an untested trade is one that changes by accident.
    //
    // Measured across arms: 3.2.2 SEES a `variants` mutation, the whole 3.3.0 line does not, and
    // NO version has ever seen a `slots` one. So the first is a 3.3.0 regression this branch
    // inherits and the second is not a regression at all.
    //
    // Watching them is possible — the tracker already walks consumer metadata — and the cost is
    // why it is not done here. That walk runs on EVERY call, and a real component's `variants` map
    // holds more class strings than its compound list does, so covering it roughly doubles the
    // per-call detection cost to support mutating a definition after it was built. Covering
    // `slots` would additionally be a behaviour change no published version has made.
    //
    // If a future edit starts watching them, this case fails and the change gets stated rather
    // than shipped silently — which is exactly what happened when 3.3.0 stopped watching.
    const variants = {color: {red: "text-red"}};
    const button = defineVariants(createTv, {
      base: "base",
      variants,
      defaultVariants: {color: "red"},
    });

    expect(warm(() => button({color: "red"}))).toHaveClass(["base", "text-red"]);

    variants.color.red = "text-crimson";

    expect(button({color: "red"})).toHaveClass(["base", "text-red"]);

    const slots = {root: "root-old"};
    const menu = defineSlots(createTv, {slots});

    expect(warm(() => menu({}).root())).toHaveClass(["root-old"]);

    slots.root = "root-new";

    expect(menu({}).root()).toHaveClass(["root-old"]);
  });

  test("a COMPOUND mutation still is seen, so the case above is not just a dead cache", () => {
    // Capability guard for it. A component that detected nothing at all would satisfy every
    // assertion above, and this is what separates "deliberately not watched" from "broken".
    const compoundVariants: LooseRecord[] = [{color: "red", class: "cv-old"}];
    const button = defineVariants(createTv, {
      base: "base",
      variants: {color: {red: "text-red"}},
      compoundVariants,
      defaultVariants: {color: "red"},
    });

    expect(warm(() => button({color: "red"}))).toHaveClass(["base", "text-red", "cv-old"]);

    compoundVariants[0].class = "cv-new";

    expect(button({color: "red"})).toHaveClass(["base", "text-red", "cv-new"]);
  });

  test("sees a mutation on the variants path", () => {
    // The two resolvers keep separate caches and separate change detection; a slots case is
    // not coverage for this one.
    const button = defineVariants(createTv, {
      base: "base",
      variants: {color: {red: "text-red", blue: "text-blue"}},
      compoundVariants: [{color: "red", class: "cv-old"}],
      defaultVariants: {color: "red"},
    });

    expect(warm(() => button({color: "red"}))).toHaveClass(["base", "text-red", "cv-old"]);
    expect(warm(() => button({color: "blue"}))).toHaveClass(["base", "text-blue"]);

    button.compoundVariants[0].color = "blue";
    button.compoundVariants[0].class = "cv-new";

    expect(button({color: "red"})).toHaveClass(["base", "text-red"]);
    expect(button({color: "blue"})).toHaveClass(["base", "text-blue", "cv-new"]);
  });

  test("an untouched definition keeps serving its cached result", () => {
    // The other half of the contract: detection that always reports a change is as wrong as
    // one that never does, it just fails silently by disabling the cache. NaN is present
    // because it is the value that would defeat a bare `!==` comparison.
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {count: {1: {}, 2: {}}},
      compoundVariants: [
        {count: Number.NaN, class: {root: "cv-nan"}},
        {count: 1, class: {root: "cv"}},
      ],
      defaultVariants: {count: 1},
    });

    // The first invoke skips the cache; reuse starts after it.
    menu({count: 1});

    const first = menu({count: 1});
    const second = menu({count: 1});

    expect(first).toBe(second);
    expect(first.root()).toHaveClass(["root", "cv"]);
  });

  test("sees a className mutation", () => {
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {}, b: {}}},
      compoundVariants: [{color: "a", className: {root: "cv-old"}}],
      defaultVariants: {color: "a"},
    });

    expect(warm(() => menu({color: "a"}).root())).toHaveClass(["root", "cv-old"]);

    menu.compoundVariants[0].className = {root: "cv-new"};

    expect(menu({color: "a"}).root()).toHaveClass(["root", "cv-new"]);
  });

  test("sees a per-slot class object become an array of the same members", () => {
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {}, b: {}}},
      compoundVariants: [{color: "a", class: {root: "cv"}}],
      defaultVariants: {color: "a"},
    });

    expect(warm(() => menu({color: "a"}).root())).toHaveClass(["root", "cv"]);

    // Same members in the same order — only the container kind differs, and an array is not a
    // per-slot map, so `root` loses the compound.
    menu.compoundVariants[0].class = ["root", "cv"];

    expect(menu({color: "a"}).root()).toHaveClass(["root"]);
  });

  test("honours a compoundSlots slot list changed after the first call", () => {
    // Which slots a compound applies to is derived into an index when the definition compiles.
    // The list is mutable metadata like the rest, so the index is rebuilt when it changes —
    // otherwise the change is detected and then ignored, which is neither behaviour.
    const menu = defineSlots(createTv, {
      slots: {title: "title-base", subtitle: "subtitle-base"},
      variants: {color: {a: {}, b: {}}},
      compoundSlots: [{slots: ["title"], color: "b", class: "cs"}],
      defaultVariants: {color: "b"},
    });

    expect(warm(() => menu().title())).toHaveClass(["title-base", "cs"]);
    expect(warm(() => menu().subtitle())).toHaveClass(["subtitle-base"]);

    menu.compoundSlots[0].slots = ["title", "subtitle"];

    expect(menu().title()).toHaveClass(["title-base", "cs"]);
    expect(menu().subtitle()).toHaveClass(["subtitle-base", "cs"]);
  });

  test("honours that slot list on a call the cache cannot key", () => {
    // An object on a dependency key cannot be keyed, so the call bypasses the cache. Bypassing
    // the CACHE must not also bypass change DETECTION: the slot index the computers read is
    // derived from this metadata, so a call that skips the check renders from a stale index —
    // the very mutation the case above exists to honour, silently ignored.
    const marker = {};
    const menu = defineSlots(createTv, {
      slots: {title: "title-base", subtitle: "subtitle-base"},
      variants: {color: {a: {}, b: {}}},
      compoundVariants: [{shape: marker, class: {}}],
      compoundSlots: [{slots: ["title"], color: "b", class: "cs"}],
      defaultVariants: {color: "b"},
    });

    expect(warm(() => menu().title())).toHaveClass(["title-base", "cs"]);
    expect(warm(() => menu().subtitle())).toHaveClass(["subtitle-base"]);

    menu.compoundSlots[0].slots = ["title", "subtitle"];

    const unkeyable = menu({shape: {}});

    expect(unkeyable.title()).toHaveClass(["title-base", "cs"]);
    expect(unkeyable.subtitle()).toHaveClass(["subtitle-base", "cs"]);
  });

  test("sees a condition key deleted from a compound, which WIDENS it", () => {
    // Which keys a compound conditions on is part of what it means, not just their values:
    // removing a key makes the compound match more, not less. A key list captured when the
    // definition compiled cannot see either direction — and the result is a wrong answer with a
    // freshly computed cache, not a stale one.
    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: {a: "tone-a", b: "tone-b"}, size: {xl: "size-xl"}},
      compoundVariants: [{tone: "a", class: "cv"}],
      defaultVariants: {tone: "a", size: "xl"},
    });

    expect(warm(() => button({tone: "a", size: "xl"}))).toHaveClass([
      "base",
      "tone-a",
      "size-xl",
      "cv",
    ]);
    expect(button({tone: "b", size: "xl"})).toHaveClass(["base", "tone-b", "size-xl"]);

    delete button.compoundVariants[0].tone;

    // With no conditions left, the compound matches everything.
    expect(button({tone: "b", size: "xl"})).toHaveClass(["base", "tone-b", "size-xl", "cv"]);
  });

  test("sees a condition key added to a compound, which NARROWS it", () => {
    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: {a: "tone-a"}, size: {xl: "size-xl"}},
      compoundVariants: [{tone: "a", class: "cv"}],
      defaultVariants: {tone: "a", size: "xl"},
    });

    expect(warm(() => button({tone: "a", size: "xl"}))).toHaveClass([
      "base",
      "tone-a",
      "size-xl",
      "cv",
    ]);

    button.compoundVariants[0].size = "never";

    expect(button({tone: "a", size: "xl"})).toHaveClass(["base", "tone-a", "size-xl"]);
  });

  test("sees a condition key RENAMED, with its value unchanged", () => {
    // The count of conditions is the same and so is the value; only which prop it reads moves.
    // Recording the key NAMES is the only thing that separates these two states, and getting it
    // wrong means a compound silently keeps matching the prop it no longer names.
    // Two conditions, and the SECOND one is renamed while keeping its value. A stale key list
    // reads the renamed-away key as absent, and an absent condition matches an absent prop — so
    // the compound goes on matching, which is what makes this case able to fail rather than
    // merely happening to give the same answer.
    const button = defineVariants(createTv, {
      base: "base",
      variants: {tone: {a: "tone-a"}, mood: {b: "mood-b"}},
      compoundVariants: [{tone: "a", size: "xl", class: "cv"}],
      defaultVariants: {tone: "a"},
    });

    expect(warm(() => button({tone: "a", size: "xl"}))).toHaveClass(["base", "tone-a", "cv"]);

    delete button.compoundVariants[0].size;
    button.compoundVariants[0].mood = "xl";

    // `size` is now absent from both the compound and the call, so the stale list matches; the
    // fresh list reads `mood`, which is "b" here and does not.
    expect(button({tone: "a", mood: "b"})).toHaveClass(["base", "tone-a", "mood-b"]);
  });

  test("sees a condition key added to a compound SLOT", () => {
    const menu = defineSlots(createTv, {
      slots: {title: "title-base"},
      variants: {tone: {a: {}}},
      compoundSlots: [{slots: ["title"], tone: "a", class: "cs"}],
      defaultVariants: {tone: "a"},
    });

    expect(warm(() => menu({tone: "a"}).title())).toHaveClass(["title-base", "cs"]);

    menu.compoundSlots[0].state = "never";

    expect(menu({tone: "a"}).title()).toHaveClass(["title-base"]);
  });

  test("sees a nested mutation of a per-slot class object", () => {
    const menu = defineSlots(createTv, {
      slots: {root: "root", title: "title"},
      variants: {color: {a: {}, b: {}}},
      compoundVariants: [{color: "a", class: {root: "root-old", title: "title-old"}}],
      defaultVariants: {color: "a"},
    });

    expect(warm(() => menu({color: "a"}).title())).toHaveClass(["title", "title-old"]);

    // The `class` object identity is unchanged; only one of its values moves.
    const compoundClass = asRecord(menu.compoundVariants[0].class);

    compoundClass.title = "title-new";

    expect(menu({color: "a"}).title()).toHaveClass(["title", "title-new"]);
    expect(menu({color: "a"}).root()).toHaveClass(["root", "root-old"]);
  });

  test("sees a swap that leaves the overall shape unchanged", () => {
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {}, b: {}}},
      compoundVariants: [
        {color: "a", class: {root: "cv-a"}},
        {color: "b", class: {root: "cv-b"}},
      ],
      defaultVariants: {color: "a"},
    });

    expect(warm(() => menu({color: "a"}).root())).toHaveClass(["root", "cv-a"]);
    expect(warm(() => menu({color: "b"}).root())).toHaveClass(["root", "cv-b"]);

    menu.compoundVariants[0].class = {root: "cv-b"};
    menu.compoundVariants[1].class = {root: "cv-a"};

    expect(menu({color: "a"}).root()).toHaveClass(["root", "cv-b"]);
    expect(menu({color: "b"}).root()).toHaveClass(["root", "cv-a"]);
  });

  test("sees a class value changing type", () => {
    const menu = defineSlots(createTv, {
      slots: {root: "root", title: "title"},
      variants: {color: {a: {}, b: {}}},
      compoundVariants: [{color: "a", class: {root: "cv-object"}}],
      defaultVariants: {color: "a"},
    });

    expect(warm(() => menu({color: "a"}).root())).toHaveClass(["root", "cv-object"]);

    // Object to string: a bare string applies to `base` only, so `root` loses the compound.
    menu.compoundVariants[0].class = "cv-string";

    expect(menu({color: "a"}).root()).toHaveClass(["root"]);
    expect(menu({color: "a"}).base()).toHaveClass(["cv-string"]);
  });

  test("sees an array-valued condition being resized", () => {
    const compoundVariants = [{color: ["red", "blue"], class: {root: "cv"}}];
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {red: {}, blue: {}, green: {}}},
      compoundVariants: compoundVariants,
      defaultVariants: {color: "green"},
    });

    expect(warm(() => menu({color: "blue"}).root())).toHaveClass(["root", "cv"]);

    compoundVariants[0].color = ["red"];

    expect(menu({color: "blue"}).root()).toHaveClass(["root"]);
    expect(menu({color: "red"}).root()).toHaveClass(["root", "cv"]);
  });

  test("invalidates every cached combination, not only the one re-read", () => {
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {}, b: {}, c: {}}},
      compoundVariants: [
        {color: "a", class: {root: "cv-old"}},
        {color: "b", class: {root: "cv-old"}},
        {color: "c", class: {root: "cv-old"}},
      ],
      defaultVariants: {color: "a"},
    });

    for (const color of ["a", "b", "c"] as const) warm(() => menu({color}).root());

    for (const compound of menu.compoundVariants) compound.class = {root: "cv-new"};

    for (const color of ["a", "b", "c"] as const) {
      expect(menu({color}).root()).toHaveClass(["root", "cv-new"]);
    }
  });

  test("invalidates while the cache is over its entry limit", () => {
    const tones = Array.from({length: 40}, (_unused, index) => `tone${index}`);
    const steps = Array.from({length: 12}, (_unused, index) => `step${index}`);
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {
        tone: Object.fromEntries(tones.map((tone) => [tone, {}])),
        step: Object.fromEntries(steps.map((step) => [step, {}])),
      },
      compoundVariants: [{tone: "tone0", class: {root: "cv-old"}}],
      defaultVariants: {tone: "tone0", step: "step0"},
    });

    for (const tone of tones) {
      for (const step of steps) menu({tone, step}).root();
    }

    menu.compoundVariants[0].class = {root: "cv-new"};

    expect(menu({tone: "tone0", step: "step0"}).root()).toHaveClass(["root", "cv-new"]);
    expect(menu({tone: "tone0", step: "step5"}).root()).toHaveClass(["root", "cv-new"]);
    expect(menu({tone: "tone7", step: "step3"}).root()).toHaveClass(["root"]);
  });

  test("a mutation and its exact reversal both land", () => {
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {}}},
      compoundVariants: [{color: "a", class: {root: "cv-a"}}],
      defaultVariants: {color: "a"},
    });

    expect(warm(() => menu({color: "a"}).root())).toHaveClass(["root", "cv-a"]);

    menu.compoundVariants[0].class = {root: "cv-b"};

    expect(warm(() => menu({color: "a"}).root())).toHaveClass(["root", "cv-b"]);

    menu.compoundVariants[0].class = {root: "cv-a"};

    expect(warm(() => menu({color: "a"}).root())).toHaveClass(["root", "cv-a"]);
  });

  test("a parent mutation reaches a child that extends it", () => {
    const parent = defineSlots(createTv, {
      slots: {root: "root", title: "title"},
      variants: {color: {a: {}, b: {}}},
      compoundVariants: [{color: "a", class: {title: "parent-old"}}],
      defaultVariants: {color: "a"},
    });
    const child = defineSlots(createTv, {extend: parent, slots: {root: "child-root"}});

    expect(warm(() => child({color: "a"}).title())).toHaveClass(["title", "parent-old"]);
    expect(warm(() => parent({color: "a"}).title())).toHaveClass(["title", "parent-old"]);

    // `extend` merges the parent's compounds into the child by reference, so one mutation has
    // to be seen by both caches.
    parent.compoundVariants[0].class = {title: "parent-new"};

    expect(parent({color: "a"}).title()).toHaveClass(["title", "parent-new"]);
    expect(child({color: "a"}).title()).toHaveClass(["title", "parent-new"]);
  });

  test("a NaN in the metadata does not disturb a neighbouring compound", () => {
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {count: {1: {}, 2: {}}},
      compoundVariants: [
        // NaN never matches a condition (`matchesCompoundValue` compares with ===), so this
        // compound is inert. It is here because NaN is the one value that is not equal to
        // itself, which any change detection over the metadata has to survive.
        {count: Number.NaN, class: {root: "cv-nan"}},
        {count: 1, class: {root: "cv-old"}},
      ],
      defaultVariants: {count: 1},
    });

    expect(warm(() => menu({count: 1}).root())).toHaveClass(["root", "cv-old"]);

    menu.compoundVariants[1].class = {root: "cv-new"};

    expect(menu({count: 1}).root()).toHaveClass(["root", "cv-new"]);
    expect(menu({count: 2}).root()).toHaveClass(["root"]);
  });

  test("reading the metadata does not disturb resolution", () => {
    const menu = defineSlots(createTv, {
      slots: {root: "root", title: "title"},
      variants: {color: {a: {}, b: {}}},
      compoundVariants: [{color: "a", class: {title: "cv"}}],
      defaultVariants: {color: "a"},
    });
    const before = warm(() => menu({color: "a"}).title());

    // A read — a devtool, a spread, a deep-equal — must be inert.
    Object.keys(menu);
    void menu.compoundVariants;
    void menu.compoundSlots;

    expect(menu({color: "a"}).title()).toBe(before);
    expect(menu({color: "b"}).title()).toHaveClass(["title"]);
  });

  test("a definition with no compounds resolves normally", () => {
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {root: "root-a"}, b: {root: "root-b"}}},
      defaultVariants: {color: "a"},
    });

    expect(warm(() => menu({color: "a"}).root())).toHaveClass(["root", "root-a"]);
    expect(warm(() => menu({color: "b"}).root())).toHaveClass(["root", "root-b"]);
  });

  test("survives cyclic metadata", () => {
    const cyclic: Record<string, unknown> = {root: "cv"};

    cyclic.self = cyclic;

    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {}, b: {}}},
      compoundVariants: [{color: "a", class: cyclic}],
      defaultVariants: {color: "a"},
    });

    // Consumer-supplied metadata can be cyclic. Every call after the first goes through
    // change detection, so a walk with no cycle guard throws from the second call onward.
    expect(warm(() => menu({color: "a"}).root(), 5)).toHaveClass(["root", "cv"]);
  });

  test("survives deeply nested metadata", () => {
    const deep: Record<string, unknown> = {root: "cv"};
    let node = deep;

    for (let level = 0; level < 6000; level++) {
      const next: Record<string, unknown> = {};

      node.nested = next;
      node = next;
    }

    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {}, b: {}}},
      compoundVariants: [{color: "a", class: deep}],
      defaultVariants: {color: "a"},
    });

    expect(warm(() => menu({color: "a"}).root(), 5)).toHaveClass(["root", "cv"]);
  });

  test("a getter that throws while the snapshot is re-recorded does not hide the change", () => {
    let reads = 0;
    let throwAtRead = Number.POSITIVE_INFINITY;
    const compound: Record<string, unknown> = {color: "a"};

    Object.defineProperty(compound, "className", {
      enumerable: true,
      get() {
        reads++;

        if (reads === throwAtRead) throw new Error("transient");

        return undefined;
      },
    });
    compound.class = {root: "cv-old"};

    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {}, b: {}}},
      compoundVariants: [compound],
      defaultVariants: {color: "a"},
    });

    expect(warm(() => menu({color: "a"}).root())).toHaveClass(["root", "cv-old"]);

    compound.class = {root: "cv-new"};
    // Change detection compares first and re-records only once it has seen a change, so the
    // second read from here is the one inside the re-record — the half-written snapshot case.
    throwAtRead = reads + 2;

    expect(() => menu({color: "a"}).root()).toThrow("transient");

    throwAtRead = Number.POSITIVE_INFINITY;

    expect(menu({color: "a"}).root()).toHaveClass(["root", "cv-new"]);
  });

  test("a condition key ADDED at runtime narrows the compound on the variants path", () => {
    // A compound's key SET is metadata like the rest of it: adding a key narrows the compound.
    // Two derived lists have to move for that to take effect — the condition list the matcher
    // reads, and the DEPENDENCY list the cache key is built from. Refreshing only the first
    // leaves `gate` out of the key, so the two calls below collide and the second is served the
    // first's classes: the compound is detected as narrowed and then applied as though it were
    // not.
    const compound: LooseRecord = {color: "a", class: "cv"};
    const button = defineVariants(createTv, {
      base: "base",
      variants: {color: {a: "text-a"}},
      compoundVariants: [compound],
      defaultVariants: {color: "a"},
    });

    expect(warm(() => button({color: "a", gate: "on"}))).toHaveClass(["base", "text-a", "cv"]);

    compound.gate = "on";

    expect(button({color: "a", gate: "on"})).toHaveClass(["base", "text-a", "cv"]);
    expect(button({color: "a", gate: "off"})).toHaveClass(["base", "text-a"]);
  });

  test("a condition key ADDED at runtime narrows the compound on the slots path", () => {
    // The same stale list, failing in the OPPOSITE direction. The slots path also builds the
    // props its computers see from the dependency list, so a key missing from it is stripped
    // before the matcher runs — the compound reads `gate` as undefined and stops matching at
    // all, including on the call that supplies it.
    const compound: LooseRecord = {color: "a", class: {root: "cv"}};
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {root: "text-a"}}},
      compoundVariants: [compound],
      defaultVariants: {color: "a"},
    });

    expect(warm(() => menu({color: "a", gate: "on"}).root())).toHaveClass(["root", "text-a", "cv"]);

    compound.gate = "on";

    expect(menu({color: "a", gate: "on"}).root()).toHaveClass(["root", "text-a", "cv"]);
    expect(menu({color: "a", gate: "off"}).root()).toHaveClass(["root", "text-a"]);
  });

  test("a condition key ADDED at runtime narrows a compound SLOT", () => {
    // Compound slots contribute their own condition keys to the same dependency list, and only
    // the slots path reads them — so this is a third derivation of the same list, not a
    // restatement of the case above.
    const compound: LooseRecord = {slots: ["root"], color: "a", class: "cs"};
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {root: "text-a"}}},
      compoundSlots: [compound],
      defaultVariants: {color: "a"},
    });

    expect(warm(() => menu({color: "a", gate: "on"}).root())).toHaveClass(["root", "text-a", "cs"]);

    compound.gate = "on";

    expect(menu({color: "a", gate: "on"}).root()).toHaveClass(["root", "text-a", "cs"]);
    expect(menu({color: "a", gate: "off"}).root()).toHaveClass(["root", "text-a"]);
  });

  test("honours a condition-key change on a VARIANTS call the cache cannot key", () => {
    // Bypassing the CACHE must not also bypass DETECTION — the condition list the matcher reads
    // is derived from the same metadata, so a call that skips the check matches on a stale key
    // set. The slots path has this case above; the two resolvers keep separate detection state,
    // so it is not coverage for this one.
    const compound: LooseRecord = {color: "a", class: "cv"};
    const button = defineVariants(createTv, {
      base: "base",
      // `shape` is a declared variant, so it is a dependency key — and an object value on one of
      // those cannot be keyed, which is what puts every call below on the bypass path.
      variants: {color: {a: "text-a"}, shape: {}},
      compoundVariants: [compound],
      defaultVariants: {color: "a"},
    });
    const unkeyable = {};

    expect(warm(() => button({color: "a", shape: unkeyable}))).toHaveClass([
      "base",
      "text-a",
      "cv",
    ]);

    compound.gate = "on";

    expect(button({color: "a", shape: unkeyable, gate: "on"})).toHaveClass([
      "base",
      "text-a",
      "cv",
    ]);
    expect(button({color: "a", shape: unkeyable, gate: "off"})).toHaveClass(["base", "text-a"]);
  });

  test("an ordinary value change does not cost a second read of the caller's props", () => {
    // Every change re-derives the dependency set, and it comes back EQUAL almost every time. The
    // only remedy for a set that genuinely moved is to read the caller's props again, which runs
    // their getters a second time — so the equal case has to be recognised rather than merely
    // recomputed, or every ordinary mutation doubles the reads a reactive consumer sees.
    let reads = 0;
    const countedProps: LooseRecord = {
      get color() {
        reads++;

        return "a";
      },
    };
    const compound: LooseRecord = {color: "a", class: "cv-old"};
    const button = defineVariants(createTv, {
      base: "base",
      variants: {color: {a: "text-a"}},
      compoundVariants: [compound],
      defaultVariants: {color: "a"},
    });

    warm(() => button(countedProps));

    compound.class = "cv-new";
    reads = 0;

    expect(button(countedProps)).toHaveClass(["base", "text-a", "cv-new"]);
    expect(reads).toBe(1);
  });

  test("a condition key DELETED at runtime widens the compound on both paths", () => {
    // The other direction, pinned beside the one above so a fix that repairs one and leaves the
    // other is a failure rather than a green run. Deleting a key widens the compound: it now
    // matches calls that do not supply `gate` at all.
    const forVariants: LooseRecord = {color: "a", gate: "on", class: "cv"};
    const button = defineVariants(createTv, {
      base: "base",
      variants: {color: {a: "text-a"}},
      compoundVariants: [forVariants],
      defaultVariants: {color: "a"},
    });

    expect(warm(() => button({color: "a"}))).toHaveClass(["base", "text-a"]);

    delete forVariants.gate;

    expect(button({color: "a"})).toHaveClass(["base", "text-a", "cv"]);

    const forSlots: LooseRecord = {color: "a", gate: "on", class: {root: "cv"}};
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {root: "text-a"}}},
      compoundVariants: [forSlots],
      defaultVariants: {color: "a"},
    });

    expect(warm(() => menu({color: "a"}).root())).toHaveClass(["root", "text-a"]);

    delete forSlots.gate;

    expect(menu({color: "a"}).root()).toHaveClass(["root", "text-a", "cv"]);
  });

  test("a throw while ACTING on a change leaves the change to be acted on again", () => {
    // Detecting a change and acting on it are one step, and every part of acting runs consumer
    // code: re-deriving the key sets enumerates each compound, and rebuilding the per-slot index
    // reads `slots`. A throw in there is the shape that loses an invalidation permanently —
    // detection has already recorded the new metadata, so if it also ACCEPTED it, the tracker
    // answers `unchanged` forever afterwards and the cache is never cleared.
    let reads = 0;
    let throwAtRead = Number.POSITIVE_INFINITY;
    const compound: LooseRecord = {color: "a", class: "cs-old"};

    Object.defineProperty(compound, "slots", {
      enumerable: true,
      get() {
        reads++;

        if (reads === throwAtRead) throw new Error("transient");

        return ["root"];
      },
    });

    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {root: "text-a"}}},
      compoundSlots: [compound],
      defaultVariants: {color: "a"},
    });

    expect(warm(() => menu({color: "a"}).root())).toHaveClass(["root", "text-a", "cs-old"]);

    // Calibrated rather than hardcoded: how many times a change cycle reads `slots` is an
    // implementation detail, but the LAST of those reads is always the index rebuild, which is
    // the read that happens after detection has recorded and before it has accepted.
    const beforeCalibration = reads;

    compound.class = "cs-mid";
    menu({color: "a"}).root();

    const readsPerChange = reads - beforeCalibration;

    compound.class = "cs-new";
    throwAtRead = reads + readsPerChange;

    expect(() => menu({color: "a"}).root()).toThrow("transient");

    throwAtRead = Number.POSITIVE_INFINITY;

    expect(menu({color: "a"}).root()).toHaveClass(["root", "text-a", "cs-new"]);
  });

  test("a frozen definition resolves", () => {
    const menu = defineSlots(createTv, {
      slots: {root: "root"},
      variants: {color: {a: {}, b: {}}},
      compoundVariants: Object.freeze([
        Object.freeze({color: "a" as const, class: Object.freeze({root: "cv"})}),
      ]),
      defaultVariants: {color: "a"},
    });

    expect(warm(() => menu({color: "a"}).root())).toHaveClass(["root", "cv"]);
    expect(warm(() => menu({color: "b"}).root())).toHaveClass(["root"]);
  });
});
