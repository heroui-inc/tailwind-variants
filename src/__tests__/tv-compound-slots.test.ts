import {describe, expect, test} from "vitest";

import {tv} from "../index";
import {defineSlots, readSlot} from "./support/loose.js";

describe("tv (compound slots)", () => {
  test("applies compound slots without variants", () => {
    const pagination = tv({
      slots: {
        base: "flex flex-wrap relative gap-1 max-w-fit",
        item: "",
        prev: "",
        next: "",
        cursor: ["absolute", "flex", "overflow-visible"],
      },
      compoundSlots: [
        {
          slots: ["item", "prev", "next"],
          class: ["flex", "flex-wrap", "truncate"],
        },
      ],
    });
    // with default values
    const {base, item, prev, next, cursor} = pagination();

    expect(base()).toHaveClass(["flex", "flex-wrap", "relative", "gap-1", "max-w-fit"]);
    expect(item()).toHaveClass(["flex", "flex-wrap", "truncate"]);
    expect(prev()).toHaveClass(["flex", "flex-wrap", "truncate"]);
    expect(next()).toHaveClass(["flex", "flex-wrap", "truncate"]);
    expect(cursor()).toHaveClass(["absolute", "flex", "overflow-visible"]);
  });

  test("preserves deferred validation for invalid compoundSlots", () => {
    const component = tv({
      slots: {base: "base"},
      // @ts-expect-error runtime validation coverage
      compoundSlots: {},
    });

    expect(component).toThrow('The "compoundSlots" prop must be an array. Received: object');
  });

  test("matches one default variant in compound slots", () => {
    const pagination = tv({
      slots: {
        base: "flex flex-wrap relative gap-1 max-w-fit",
        item: "",
        prev: "",
        next: "",
        cursor: ["absolute", "flex", "overflow-visible"],
      },
      variants: {
        size: {
          xs: {},
          sm: {},
          md: {},
          lg: {},
          xl: {},
        },
      },
      compoundSlots: [
        {
          slots: ["item", "prev", "next"],
          class: ["flex", "flex-wrap", "truncate"],
        },
        {
          slots: ["item", "prev", "next"],
          size: "xs",
          class: "w-7 h-7 text-xs",
        },
      ],
      defaultVariants: {
        size: "xs",
      },
    });
    // with default values
    const {base, item, prev, next, cursor} = pagination();

    expect(base()).toHaveClass(["flex", "flex-wrap", "relative", "gap-1", "max-w-fit"]);
    expect(item()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(prev()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(next()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(cursor()).toHaveClass(["absolute", "flex", "overflow-visible"]);
  });

  test("matches one explicit variant in compound slots", () => {
    const pagination = tv({
      slots: {
        base: "flex flex-wrap relative gap-1 max-w-fit",
        item: "",
        prev: "",
        next: "",
        cursor: ["absolute", "flex", "overflow-visible"],
      },
      variants: {
        size: {
          xs: {},
          sm: {},
          md: {},
          lg: {},
          xl: {},
        },
      },
      compoundSlots: [
        {
          slots: ["item", "prev", "next"],
          class: ["flex", "flex-wrap", "truncate"],
        },
        {
          slots: ["item", "prev", "next"],
          size: "xs",
          class: "w-7 h-7 text-xs",
        },
      ],
      defaultVariants: {
        size: "sm",
      },
    });
    // with default values
    const {base, item, prev, next, cursor} = pagination({
      size: "xs",
    });

    expect(base()).toHaveClass(["flex", "flex-wrap", "relative", "gap-1", "max-w-fit"]);
    expect(item()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(prev()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(next()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(cursor()).toHaveClass(["absolute", "flex", "overflow-visible"]);
  });

  test("matches one boolean variant in compound slots", () => {
    const nav = tv({
      base: "base",
      slots: {
        toggle: "slot--toggle",
        item: "slot--item",
      },
      variants: {
        isActive: {
          true: "",
        },
      },
      compoundSlots: [
        {
          slots: ["item", "toggle"],
          class: "compound--item-toggle",
        },
        {
          slots: ["item", "toggle"],
          isActive: true,
          class: "compound--item-toggle--active",
        },
      ],
    });

    let styles = nav({isActive: false});

    expect(styles.base()).toHaveClass(["base"]);
    expect(styles.toggle()).toHaveClass(["slot--toggle", "compound--item-toggle"]);
    expect(styles.item()).toHaveClass(["slot--item", "compound--item-toggle"]);

    styles = nav({isActive: true});

    expect(styles.base()).toHaveClass(["base"]);
    expect(styles.toggle()).toHaveClass([
      "slot--toggle",
      "compound--item-toggle",
      "compound--item-toggle--active",
    ]);
    expect(styles.item()).toHaveClass([
      "slot--item",
      "compound--item-toggle",
      "compound--item-toggle--active",
    ]);
  });

  test("treats missing boolean variants as false in compoundSlots", () => {
    const nav = tv({
      slots: {
        item: "slot--item",
      },
      variants: {
        isActive: {
          true: {
            item: "active",
          },
        },
      },
      compoundSlots: [
        {
          slots: ["item"],
          isActive: false,
          class: "scalar-false",
        },
        {
          slots: ["item"],
          isActive: [false],
          class: "array-false",
        },
        {
          slots: ["item"],
          isActive: [false, undefined],
          class: "array-explicit-undefined",
        },
      ],
    });

    expect(nav().item()).toHaveClass([
      "slot--item",
      "scalar-false",
      "array-false",
      "array-explicit-undefined",
    ]);
    expect(nav({isActive: true}).item()).toHaveClass(["slot--item", "active"]);
  });

  test("matches multiple default variants in compound slots", () => {
    const pagination = tv({
      slots: {
        base: "flex flex-wrap relative gap-1 max-w-fit",
        item: "",
        prev: "",
        next: "",
        cursor: ["absolute", "flex", "overflow-visible"],
      },
      variants: {
        size: {
          xs: {},
          sm: {},
          md: {},
          lg: {},
          xl: {},
        },
        color: {
          primary: {},
          secondary: {},
        },
        isBig: {
          true: {},
        },
      },
      compoundSlots: [
        {
          slots: ["item", "prev", "next"],
          class: ["flex", "flex-wrap", "truncate"],
        },
        {
          slots: ["item", "prev", "next"],
          size: "xs",
          color: "primary",
          isBig: false,
          class: "w-7 h-7 text-xs",
        },
      ],
      defaultVariants: {
        size: "xs",
        color: "primary",
        isBig: false,
      },
    });
    // with default values
    const {base, item, prev, next, cursor} = pagination();

    expect(base()).toHaveClass(["flex", "flex-wrap", "relative", "gap-1", "max-w-fit"]);
    expect(item()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(prev()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(next()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(cursor()).toHaveClass(["absolute", "flex", "overflow-visible"]);
  });

  test("matches multiple explicit variants in compound slots", () => {
    const pagination = tv({
      slots: {
        base: "flex flex-wrap relative gap-1 max-w-fit",
        item: "",
        prev: "",
        next: "",
        cursor: ["absolute", "flex", "overflow-visible"],
      },
      variants: {
        size: {
          xs: {},
          sm: {},
          md: {},
          lg: {},
          xl: {},
        },
        color: {
          primary: {},
          secondary: {},
        },
        isBig: {
          true: {},
        },
      },
      compoundSlots: [
        {
          slots: ["item", "prev", "next"],
          class: ["flex", "flex-wrap", "truncate"],
        },
        {
          slots: ["item", "prev", "next"],
          size: "xs",
          color: "primary",
          isBig: true,
          class: "w-7 h-7 text-xs",
        },
      ],
      defaultVariants: {
        size: "sm",
        color: "secondary",
        isBig: false,
      },
    });
    // with default values
    const {base, item, prev, next, cursor} = pagination({
      size: "xs",
      color: "primary",
      isBig: true,
    });

    expect(base()).toHaveClass(["flex", "flex-wrap", "relative", "gap-1", "max-w-fit"]);
    expect(item()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(prev()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(next()).toHaveClass(["flex", "flex-wrap", "truncate", "w-7", "h-7", "text-xs"]);
    expect(cursor()).toHaveClass(["absolute", "flex", "overflow-visible"]);
  });

  test("applies a compound slot that names only className", () => {
    // `className` is the other half of the public class API, and every other compound-slot case
    // spells it `class` — so the branch that reads it has never run. The two spellings are
    // interchangeable everywhere else, which is what makes dropping one here produce a slot that
    // is merely missing classes rather than one that fails.
    const component = defineSlots(tv, {
      slots: {base: "base", title: "title"},
      compoundSlots: [{slots: ["base", "title"], tone: "loud", className: "cs"}],
    });

    const parts = component({tone: "loud"});

    expect(parts.base()).toHaveClass(["base", "cs"]);
    expect(parts.title()).toHaveClass(["title", "cs"]);
  });

  test("a slot named after an Object.prototype member resolves", () => {
    // Slot names are consumer strings and the per-slot compound index is keyed by them, so a
    // plain `{}` reports a dozen of them as already present — `toString`, `constructor`,
    // `valueOf` — and the entry that should have been created is an inherited function instead.
    // The failure is not a missing class: it is a TypeError that takes the whole component down.
    //
    // Every inherited member is listed, not a sample. They do not share one failure mode: the
    // named methods answer the read with a function, `__proto__` is an ACCESSOR whose setter
    // swallows the write and changes the prototype instead, and the `__define*` / `__lookup*`
    // pair are legacy accessors on the same object. One keyed record covers all of them, and
    // listing them is what proves the record is doing the work rather than three special cases.
    const component = defineSlots(tv, {
      slots: {
        toString: "to-string",
        valueOf: "value-of",
        constructor: "ctor",
        hasOwnProperty: "has-own",
        isPrototypeOf: "is-proto",
        propertyIsEnumerable: "prop-enum",
        toLocaleString: "to-locale",
        ["__proto__"]: "proto",
        ["__defineGetter__"]: "define-getter",
        ["__lookupGetter__"]: "lookup-getter",
      },
      compoundSlots: [
        {
          slots: ["toString", "constructor", "__proto__", "isPrototypeOf"],
          tone: "loud",
          class: "cs",
        },
      ],
    });

    const parts = component({tone: "loud"});

    expect(readSlot(parts, "toString")()).toHaveClass(["to-string", "cs"]);
    expect(readSlot(parts, "constructor")()).toHaveClass(["ctor", "cs"]);
    expect(readSlot(parts, "__proto__")()).toHaveClass(["proto", "cs"]);
    expect(readSlot(parts, "isPrototypeOf")()).toHaveClass(["is-proto", "cs"]);
    expect(readSlot(parts, "valueOf")()).toHaveClass(["value-of"]);
    expect(readSlot(parts, "hasOwnProperty")()).toHaveClass(["has-own"]);
    expect(readSlot(parts, "propertyIsEnumerable")()).toHaveClass(["prop-enum"]);
    expect(readSlot(parts, "toLocaleString")()).toHaveClass(["to-locale"]);
    expect(readSlot(parts, "__defineGetter__")()).toHaveClass(["define-getter"]);
    expect(readSlot(parts, "__lookupGetter__")()).toHaveClass(["lookup-getter"]);
  });

  test("every slot is an OWN property of the result, whatever it is called", () => {
    // `result[name] = fn` on a plain object runs the INHERITED setter when `name` is `__proto__`:
    // the result is re-parented onto the slot function, the slot disappears from `Object.keys`,
    // and any later slot named after one of that function's read-only members — `name`, `length` —
    // throws `Cannot assign to read only property`. Declaration ORDER decides whether it throws,
    // which is why the neighbouring case above passed while this shape did not: it put `__proto__`
    // second to last.
    //
    // `defineProperty` creates an own property in every case. The result keeps `Object.prototype`
    // deliberately — it is a public return value and consumers may call methods on it.
    const component = defineSlots(tv, {
      slots: {["__proto__"]: "proto", name: "named", length: "sized", root: "root"},
    });

    const parts = component({});

    expect(Object.keys(parts)).toEqual(["base", "__proto__", "name", "length", "root"]);
    expect(readSlot(parts, "__proto__")()).toHaveClass(["proto"]);
    expect(readSlot(parts, "name")()).toHaveClass(["named"]);
    expect(readSlot(parts, "length")()).toHaveClass(["sized"]);
    expect(readSlot(parts, "root")()).toHaveClass(["root"]);
    // The prototype is untouched, so this is not a null-prototype object in disguise.
    expect(Object.getPrototypeOf(parts)).toBe(Object.prototype);
  });

  test("a compound slot with no slots list is inert rather than fatal", () => {
    // `slots` is what names the slots a compound slot reaches, and the per-slot index is built by
    // iterating it. A definition that omits it, or spells it as a bare string, is an ordinary
    // consumer mistake — it must cost that one compound, not the whole component.
    const component = defineSlots(tv, {
      slots: {base: "base", title: "title"},
      compoundSlots: [
        {tone: "loud", class: "cs-missing"},
        {slots: "title", tone: "loud", class: "cs-string"},
      ],
    });

    const parts = component({tone: "loud"});

    expect(parts.base()).toHaveClass(["base"]);
    expect(parts.title()).toHaveClass(["title"]);
  });
});
