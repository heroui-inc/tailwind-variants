import {describe, expect, test} from "vitest";

import {cnMerge, tv} from "../index";
import {tv as tvLite} from "../lite";

describe("tv.extend (advanced composition)", () => {
  test("merges class arrays with cnMerge", () => {
    const tvResult = ["w-fit", "h-fit"];
    const custom = ["w-full"];

    const resultWithoutMerge = cnMerge(tvResult.concat(custom))({twMerge: false});
    const resultWithMerge = cnMerge(tvResult.concat(custom))({twMerge: true});
    const emptyResultWithoutMerge = cnMerge([].concat([]))({twMerge: false});
    const emptyResultWithMerge = cnMerge([].concat([]))({twMerge: true});

    expect(resultWithoutMerge).toBe("w-fit h-fit w-full");
    expect(resultWithMerge).toBe("h-fit w-full");
    expect(emptyResultWithoutMerge).toBe("");
    expect(emptyResultWithMerge).toBe("");
  });

  test("inherits parent slots when the child only defines a base", () => {
    const menuBase = tv({base: "menuBase"});
    const menu = tv({
      extend: menuBase,
      base: "menu",
      slots: {
        title: "title",
      },
    });

    const {base, title} = menu();

    expect(base()).toHaveClass(["menuBase", "menu"]);
    expect(title()).toHaveClass(["title"]);
  });

  test("lets child slots.base replace folded parent/root base", () => {
    const chrome = tv({base: "parent-chrome"});
    const panel = tv({
      extend: chrome,
      base: "child-root",
      slots: {
        base: "child-slot-base",
        body: "child-body",
      },
    });

    const {base, body} = panel();

    // slots.base replaces the folded parent + child root base (does not append).
    expect(base()).toHaveClass(["child-slot-base"]);
    expect(base()?.includes("parent-chrome")).toBe(false);
    expect(base()?.includes("child-root")).toBe(false);
    expect(body()).toHaveClass(["child-body"]);
  });

  test("keeps folded parent/root base when child omits slots.base", () => {
    const focusable = tv({base: "outline-none"});
    const elevated = tv({base: "shadow-sm"});
    const card = tv({
      extend: [focusable, elevated],
      base: "child-root rounded-lg",
      slots: {
        title: "font-semibold",
      },
    });

    const {base, title} = card();

    expect(base()).toHaveClass(["child-root", "rounded-lg", "outline-none", "shadow-sm"]);
    expect(title()).toHaveClass(["font-semibold"]);
  });

  test("lets child slots.base replace folded multi-parent base", () => {
    const focusable = tv({base: "outline-none"});
    const elevated = tv({base: "shadow-sm"});
    const card = tv({
      extend: [focusable, elevated],
      base: "child-root rounded-lg",
      slots: {
        base: "child-slot-base border",
        title: "font-semibold",
      },
    });

    const {base, title} = card();

    expect(base()).toHaveClass(["child-slot-base", "border"]);
    expect(base()?.includes("outline-none")).toBe(false);
    expect(base()?.includes("shadow-sm")).toBe(false);
    expect(base()?.includes("child-root")).toBe(false);
    expect(title()).toHaveClass(["font-semibold"]);
  });

  test("supports multi-level extends", () => {
    const themeButton = tv({
      base: "font-medium",
      variants: {
        color: {
          primary: "text-blue-500",
        },
        disabled: {
          true: "opacity-50",
        },
      },
      compoundVariants: [
        {
          color: "primary",
          disabled: true,
          class: "bg-black",
        },
      ],
      defaultVariants: {
        color: "primary",
        disabled: true,
      },
    });

    const appButton = tv({extend: themeButton});
    const button = tv({extend: appButton});

    expect(appButton()).toHaveClass("font-medium text-blue-500 opacity-50 bg-black");
    expect(button()).toHaveClass("font-medium text-blue-500 opacity-50 bg-black");
  });
});

describe("tv.extend (multi-parent)", () => {
  test("merges bases left-to-right with child last", () => {
    const focusable = tv({base: "focus-visible:ring-2"});
    const animated = tv({base: "transition-all"});
    const button = tv({
      extend: [focusable, animated],
      base: "inline-flex",
    });

    expect(button()).toHaveClass(["focus-visible:ring-2", "transition-all", "inline-flex"]);
    expect(button.extend).toEqual([focusable, animated]);
  });

  test("matches single-parent extend when the array has one parent", () => {
    const parent = tv({
      base: "text-base",
      variants: {
        color: {
          red: "text-red-500",
          blue: "text-blue-500",
        },
      },
    });

    const viaSingle = tv({
      extend: parent,
      base: "font-bold",
      variants: {
        color: {
          green: "text-green-500",
        },
      },
    });

    const viaArray = tv({
      extend: [parent],
      base: "font-bold",
      variants: {
        color: {
          green: "text-green-500",
        },
      },
    });

    expect(viaArray({color: "red"})).toBe(viaSingle({color: "red"}));
    expect(viaArray({color: "green"})).toBe(viaSingle({color: "green"}));
  });

  test("unions overlapping variant options; later classes win conflicts", () => {
    const sizing = tv({
      variants: {
        size: {
          sm: "text-sm px-2",
          md: "text-base px-3",
        },
      },
    });
    const density = tv({
      variants: {
        size: {
          sm: "py-1",
          lg: "text-lg py-3",
        },
      },
    });
    const button = tv({
      extend: [sizing, density],
      variants: {
        size: {
          sm: "gap-1",
        },
      },
    });

    expect(button({size: "sm"})).toHaveClass(["text-sm", "px-2", "py-1", "gap-1"]);
    expect(button({size: "md"})).toHaveClass(["text-base", "px-3"]);
    expect(button({size: "lg"})).toHaveClass(["text-lg", "py-3"]);
  });

  test("resolves overlapping defaultVariants with rightmost then child winning", () => {
    const a = tv({
      variants: {
        size: {sm: "text-sm", md: "text-base"},
      },
      defaultVariants: {size: "sm"},
    });
    const b = tv({
      variants: {
        size: {sm: "text-sm", md: "text-base", lg: "text-lg"},
      },
      defaultVariants: {size: "md"},
    });
    const child = tv({
      extend: [a, b],
      defaultVariants: {size: "lg"},
    });

    expect(child()).toHaveClass(["text-lg"]);
    expect(
      tv({
        extend: [a, b],
      })(),
    ).toHaveClass(["text-base"]);
  });

  test("concatenates compoundVariants from each parent then child", () => {
    const a = tv({
      variants: {
        color: {primary: "text-blue-500", secondary: "text-gray-500"},
        busy: {true: "opacity-50", false: ""},
      },
      compoundVariants: [{color: "primary", busy: true, class: "cv-a"}],
    });
    const b = tv({
      variants: {
        color: {primary: "text-blue-500", secondary: "text-gray-500"},
        busy: {true: "opacity-50", false: ""},
      },
      compoundVariants: [{color: "primary", busy: true, class: "cv-b"}],
    });
    const child = tv({
      extend: [a, b],
      compoundVariants: [{color: "primary", busy: true, class: "cv-child"}],
    });

    expect(child({color: "primary", busy: true})).toHaveClass([
      "text-blue-500",
      "opacity-50",
      "cv-a",
      "cv-b",
      "cv-child",
    ]);
  });

  test("unions slots from multiple parents and concatenates matching keys", () => {
    const frame = tv({
      slots: {
        base: "rounded-xl",
        title: "font-medium",
      },
    });
    const media = tv({
      slots: {
        base: "border",
        media: "aspect-video",
      },
    });
    const card = tv({
      extend: [frame, media],
      slots: {
        title: "text-base",
      },
    });

    const {base, title, media: mediaSlot} = card();

    expect(base()).toHaveClass(["rounded-xl", "border"]);
    expect(title()).toHaveClass(["font-medium", "text-base"]);
    expect(mediaSlot()).toHaveClass(["aspect-video"]);
  });

  test("treats an empty extend array like omitting extend", () => {
    const withEmpty = tv({
      extend: [] as any,
      base: "inline-flex",
    });
    const without = tv({base: "inline-flex"});

    expect(withEmpty()).toBe(without());
    expect(withEmpty.extend).toEqual([]);
  });

  test("uses already-flattened metadata from nested extended parents", () => {
    const grandparent = tv({
      base: "text-base",
      variants: {
        color: {red: "text-red-500"},
      },
    });
    const parent = tv({
      extend: grandparent,
      base: "font-bold",
      variants: {
        color: {blue: "text-blue-500"},
      },
    });
    const other = tv({base: "underline"});
    const child = tv({
      extend: [parent, other],
      base: "tracking-tight",
    });

    expect(child({color: "red"})).toHaveClass([
      "text-base",
      "font-bold",
      "underline",
      "tracking-tight",
      "text-red-500",
    ]);
    expect(child({color: "blue"})).toHaveClass([
      "text-base",
      "font-bold",
      "underline",
      "tracking-tight",
      "text-blue-500",
    ]);
  });

  test("concatenates compoundSlots from each parent then child", () => {
    const a = tv({
      slots: {
        base: "a-base",
        icon: "a-icon",
      },
      variants: {
        size: {sm: {}, md: {}},
      },
      compoundSlots: [{slots: ["base", "icon"], size: "sm", class: "cs-a"}],
    });
    const b = tv({
      slots: {
        base: "b-base",
        label: "b-label",
      },
      variants: {
        size: {sm: {}, md: {}},
      },
      compoundSlots: [{slots: ["base", "label"], size: "sm", class: "cs-b"}],
    });
    const child = tv({
      extend: [a, b],
      compoundSlots: [{slots: ["icon"], size: "sm", class: "cs-child"}],
    });

    const {base, icon, label} = child({size: "sm"});

    expect(base()).toHaveClass(["a-base", "b-base", "cs-a", "cs-b"]);
    expect(icon()).toHaveClass(["a-icon", "cs-a", "cs-child"]);
    expect(label()).toHaveClass(["b-label", "cs-b"]);
  });

  test("folds a base-only parent into the base slot of a later slotted parent", () => {
    const chrome = tv({base: "chrome"});
    const frame = tv({
      slots: {
        base: "frame-base",
        title: "frame-title",
      },
    });
    const card = tv({
      extend: [chrome, frame],
    });

    const {base, title} = card();

    expect(base()).toHaveClass(["chrome", "frame-base"]);
    expect(title()).toHaveClass(["frame-title"]);
  });

  test("appends a later base-only parent onto earlier slots.base", () => {
    const frame = tv({
      slots: {
        base: "frame-base",
        title: "frame-title",
      },
    });
    const chrome = tv({base: "chrome"});
    const card = tv({
      extend: [frame, chrome],
    });

    const {base, title} = card();

    expect(base()).toHaveClass(["frame-base", "chrome"]);
    expect(title()).toHaveClass(["frame-title"]);
  });

  test("skips falsy entries in the extend array", () => {
    const a = tv({base: "parent-a"});
    const b = tv({base: "parent-b"});
    const extend = [a, null, undefined, false, b] as any;
    const child = tv({
      extend,
      base: "child",
    });

    expect(child()).toHaveClass(["parent-a", "parent-b", "child"]);
    expect(child.extend).toBe(extend);
  });

  test("resolves twMerge conflicts across parents with later classes winning", () => {
    const a = tv({base: "p-2 text-red-500"});
    const b = tv({base: "p-4 text-blue-500"});
    const child = tv({
      extend: [a, b],
      base: "font-bold",
    });

    expect(child()).toHaveClass(["p-4", "text-blue-500", "font-bold"]);
  });

  test("lets the child author compoundVariants against parent variant axes", () => {
    const focusable = tv({
      variants: {
        focus: {visible: "ring-2", none: "ring-0"},
      },
    });
    const animated = tv({
      variants: {
        motion: {normal: "duration-150", slow: "duration-300"},
      },
    });
    const child = tv({
      extend: [focusable, animated],
      compoundVariants: [{focus: "visible", motion: "slow", class: "cv-combo"}],
    });

    expect(child({focus: "visible", motion: "slow"})).toHaveClass([
      "ring-2",
      "duration-300",
      "cv-combo",
    ]);
    expect(child({focus: "visible", motion: "normal"})).toHaveClass(["ring-2", "duration-150"]);
  });

  test("lets the child author compoundSlots against parent variant axes", () => {
    const sized = tv({
      slots: {
        base: "slot-base",
        icon: "slot-icon",
      },
      variants: {
        size: {sm: {}, lg: {}},
      },
    });
    const tonal = tv({
      variants: {
        tone: {neutral: "", info: ""},
      },
    });
    const child = tv({
      extend: [sized, tonal],
      compoundSlots: [{slots: ["base", "icon"], size: "sm", tone: "info", class: "cs-combo"}],
    });

    const matched = child({size: "sm", tone: "info"});

    expect(matched.base()).toHaveClass(["slot-base", "cs-combo"]);
    expect(matched.icon()).toHaveClass(["slot-icon", "cs-combo"]);

    const unmatched = child({size: "lg", tone: "info"});

    expect(unmatched.base()).toHaveClass(["slot-base"]);
  });

  test("lets a single-parent child target parent slots in compoundSlots", () => {
    const sized = tv({
      slots: {
        base: "slot-base",
        icon: "slot-icon",
      },
      variants: {
        size: {sm: {}, lg: {}},
      },
    });
    const child = tv({
      extend: sized,
      slots: {label: "slot-label"},
      compoundSlots: [{slots: ["icon", "label"], size: "sm", class: "cs-single"}],
    });

    const matched = child({size: "sm"});

    expect(matched.icon()).toHaveClass(["slot-icon", "cs-single"]);
    expect(matched.label()).toHaveClass(["slot-label", "cs-single"]);
  });

  test("folds parent string variant values into child slot-shaped options", () => {
    const typography = tv({
      variants: {
        size: {
          sm: "text-sm",
          lg: "text-lg",
        },
      },
    });
    const card = tv({
      extend: typography,
      slots: {
        base: "rounded-xl",
        title: "font-medium",
      },
      variants: {
        size: {
          sm: {base: "p-3", title: "text-sm"},
          lg: {base: "p-6", title: "text-xl"},
        },
      },
    });

    const {base, title} = card({size: "sm"});

    expect(base()).toHaveClass(["rounded-xl", "p-3", "text-sm"]);
    expect(title()).toHaveClass(["font-medium", "text-sm"]);
    expect(base()?.includes("[object Object]")).toBe(false);
  });

  test("keeps multi-parent slotted results independent across interleaved calls", () => {
    const focusable = tv({base: "outline-none focus-visible:ring-2"});
    const interactive = tv({
      variants: {
        isDisabled: {true: "opacity-50", false: ""},
      },
      defaultVariants: {isDisabled: false},
    });
    const button = tv({
      extend: [focusable, interactive],
      base: "inline-flex",
      slots: {
        label: "truncate",
        icon: "shrink-0",
      },
      variants: {
        size: {
          sm: {base: "h-8", icon: "size-3.5"},
          lg: {base: "h-12", icon: "size-5"},
        },
      },
      defaultVariants: {size: "sm"},
    });

    const small = button({size: "sm"});
    const large = button({size: "lg"});

    expect(small).not.toBe(large);
    expect(small.base()).toHaveClass([
      "outline-none",
      "focus-visible:ring-2",
      "inline-flex",
      "h-8",
    ]);
    expect(small.icon()).toHaveClass(["shrink-0", "size-3.5"]);
    expect(large.base()).toHaveClass([
      "outline-none",
      "focus-visible:ring-2",
      "inline-flex",
      "h-12",
    ]);
    expect(large.icon()).toHaveClass(["shrink-0", "size-5"]);
    expect(small.base()?.includes("h-12")).toBe(false);
    expect(small.icon()?.includes("size-5")).toBe(false);
  });

  test("supports multi-parent extend on the lite entrypoint", () => {
    const focusable = tvLite({base: "focus-visible:ring-2"});
    const animated = tvLite({base: "transition-all"});
    const button = tvLite({
      extend: [focusable, animated],
      base: "inline-flex",
      variants: {
        size: {sm: "text-sm", lg: "text-lg"},
      },
      defaultVariants: {size: "sm"},
    });

    expect(button()).toHaveClass([
      "focus-visible:ring-2",
      "transition-all",
      "inline-flex",
      "text-sm",
    ]);
    expect(button({size: "lg"})).toHaveClass([
      "focus-visible:ring-2",
      "transition-all",
      "inline-flex",
      "text-lg",
    ]);
    expect(button.extend).toEqual([focusable, animated]);
  });
});

/**
 * Real-world demo: compose a design-system Button from reusable primitives.
 *
 * - `focusable` owns keyboard focus rings (a11y).
 * - `interactive` owns press / disabled affordances (`isDisabled` axis).
 * - `button` extends both, then owns slots, size, and surface colors,
 *   including color-matched focus rings and disabled compound surfaces.
 *
 * Intended as a shareable multi-parent `extend` example.
 */
describe("tv.extend (real-world Button demo)", () => {
  const focusable = tv({
    base: [
      "outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-offset-2",
      "focus-visible:ring-offset-white",
    ],
  });

  const interactive = tv({
    base: "transition-[color,background-color,transform,opacity] duration-150 ease-out",
    variants: {
      isDisabled: {
        true: "pointer-events-none opacity-50",
        false: "active:scale-[0.98]",
      },
    },
    defaultVariants: {
      isDisabled: false,
    },
  });

  const button = tv({
    extend: [focusable, interactive],
    // Root layout lives on `base` so parent primitives fold into the base slot.
    base: "inline-flex items-center justify-center gap-2 rounded-lg font-semibold select-none",
    slots: {
      label: "truncate",
      icon: "shrink-0",
    },
    variants: {
      size: {
        sm: {
          base: "h-8 px-3 text-sm",
          icon: "size-3.5",
        },
        md: {
          base: "h-10 px-4 text-sm",
          icon: "size-4",
        },
        lg: {
          base: "h-12 px-5 text-base",
          icon: "size-5",
        },
      },
      color: {
        primary: {
          base: [
            "bg-blue-600 text-white shadow-sm",
            "hover:bg-blue-700",
            "focus-visible:ring-blue-500",
          ],
        },
        danger: {
          base: [
            "bg-red-600 text-white shadow-sm",
            "hover:bg-red-700",
            "focus-visible:ring-red-500",
          ],
        },
        ghost: {
          base: [
            "bg-transparent text-zinc-700",
            "hover:bg-zinc-100",
            "focus-visible:ring-zinc-400",
          ],
        },
      },
    },
    compoundVariants: [
      {
        color: "primary",
        isDisabled: true,
        class: {base: "bg-blue-400 hover:bg-blue-400"},
      },
      {
        color: "danger",
        isDisabled: true,
        class: {base: "bg-red-400 hover:bg-red-400"},
      },
      {
        color: "ghost",
        isDisabled: true,
        class: {base: "text-zinc-400 hover:bg-transparent"},
      },
    ],
    defaultVariants: {
      size: "md",
      color: "primary",
      isDisabled: false,
    },
  });

  test("default primary button merges focus + press primitives into slots", () => {
    const {base, label, icon} = button();

    expect(base()).toHaveClass([
      // focusable
      "outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-offset-2",
      "focus-visible:ring-offset-white",
      "focus-visible:ring-blue-500",
      // interactive
      "transition-[color,background-color,transform,opacity]",
      "duration-150",
      "ease-out",
      "active:scale-[0.98]",
      // button
      "inline-flex",
      "items-center",
      "justify-center",
      "gap-2",
      "rounded-lg",
      "font-semibold",
      "select-none",
      "h-10",
      "px-4",
      "text-sm",
      "bg-blue-600",
      "text-white",
      "shadow-sm",
      "hover:bg-blue-700",
    ]);
    expect(label()).toHaveClass(["truncate"]);
    expect(icon()).toHaveClass(["shrink-0", "size-4"]);
    expect(button.extend).toEqual([focusable, interactive]);
  });

  test("danger + large + disabled compounds surface and drops press scale", () => {
    const {base, icon} = button({
      color: "danger",
      size: "lg",
      isDisabled: true,
    });

    expect(base()).toHaveClass([
      "outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-offset-2",
      "focus-visible:ring-offset-white",
      "focus-visible:ring-red-500",
      "transition-[color,background-color,transform,opacity]",
      "duration-150",
      "ease-out",
      "pointer-events-none",
      "opacity-50",
      "inline-flex",
      "items-center",
      "justify-center",
      "gap-2",
      "rounded-lg",
      "font-semibold",
      "select-none",
      "h-12",
      "px-5",
      "text-base",
      "bg-red-400",
      "hover:bg-red-400",
      "text-white",
      "shadow-sm",
    ]);
    expect(base()?.includes("active:scale-[0.98]")).toBe(false);
    expect(base()?.includes("bg-red-600")).toBe(false);
    expect(base()?.includes("hover:bg-red-700")).toBe(false);
    expect(icon()).toHaveClass(["shrink-0", "size-5"]);
  });

  test("ghost size keeps parent primitives while slot callers add local classes", () => {
    const {base, label, icon} = button({color: "ghost", size: "sm"});

    expect(base()).toHaveClass([
      "outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-offset-2",
      "focus-visible:ring-offset-white",
      "focus-visible:ring-zinc-400",
      "transition-[color,background-color,transform,opacity]",
      "duration-150",
      "ease-out",
      "active:scale-[0.98]",
      "inline-flex",
      "items-center",
      "justify-center",
      "gap-2",
      "rounded-lg",
      "font-semibold",
      "select-none",
      "h-8",
      "px-3",
      "text-sm",
      "bg-transparent",
      "text-zinc-700",
      "hover:bg-zinc-100",
    ]);
    expect(label({class: "font-medium"})).toHaveClass(["truncate", "font-medium"]);
    expect(icon({class: "text-zinc-500"})).toHaveClass(["shrink-0", "size-3.5", "text-zinc-500"]);
  });
});
