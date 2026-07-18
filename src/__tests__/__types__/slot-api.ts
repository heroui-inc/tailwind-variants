import {tv, type VariantProps} from "../../index.js";

// Case: infer slot functions, slot props, compounds, and boolean conditions.
const card = tv({
  slots: {
    base: "grid",
    header: "font-semibold",
    body: "text-sm",
  },
  variants: {
    tone: {
      neutral: {base: "bg-gray-50"},
      info: {base: "bg-blue-50"},
    },
    bordered: {
      true: {base: "border"},
      false: {base: "border-0"},
    },
  },
  defaultVariants: {
    tone: "neutral",
    bordered: true,
  },
  compoundVariants: [{tone: "info", bordered: true, class: {base: "border-blue-500"}}],
  compoundSlots: [
    {slots: ["header", "body"], tone: ["neutral", "info"], class: "px-2"},
    {slots: ["base"], bordered: [false, undefined], className: "border-0"},
  ],
});

type CardProps = VariantProps<typeof card>;

const cardProps: CardProps = {tone: "info", bordered: false};
const slots = card(cardProps);

slots.base({tone: "neutral"});
slots.header({bordered: true});
slots.body();

// @ts-expect-error unknown slots remain rejected
slots.footer();

// Case: retain variants and slot functions across three extend levels.
const slotBase = tv({
  slots: {
    base: "grid",
    header: "font-semibold",
  },
  variants: {
    tone: {
      neutral: {base: "bg-gray-50"},
      info: {base: "bg-blue-50"},
    },
  },
});
const slotParent = tv({
  extend: slotBase,
  slots: {
    body: "text-sm",
  },
  variants: {
    size: {
      sm: {body: "text-sm"},
      lg: {body: "text-lg"},
    },
  },
});
const slotChild = tv({
  extend: slotParent,
  slots: {
    icon: "shrink-0",
  },
  variants: {
    selected: {
      true: "ring-2",
      false: "ring-0",
    },
  },
  defaultVariants: {
    tone: "neutral",
    size: "sm",
    selected: false,
  },
});

const inheritedSlotProps: VariantProps<typeof slotChild> = {
  tone: "info",
  size: "lg",
  selected: true,
};
const inheritedSlots = slotChild(inheritedSlotProps);

inheritedSlots.base();
inheritedSlots.header({tone: "neutral"});
inheritedSlots.body({size: "sm"});
inheritedSlots.icon({selected: false});

// Case: reject compoundSlots entries that target undeclared slots.
tv({
  slots: {base: "", icon: ""},
  variants: {size: {sm: {}, lg: {}}},
  compoundSlots: [
    // @ts-expect-error compoundSlots reject unknown slot names
    {slots: ["label"], size: "sm", class: "text-sm"},
  ],
});

// Case: reject compoundSlots values outside the declared variant union.
tv({
  slots: {base: ""},
  variants: {size: {sm: {}, lg: {}}},
  compoundSlots: [
    // @ts-expect-error compoundSlots reject invalid variant values
    {slots: ["base"], size: "xl", class: "text-xl"},
  ],
});

// Case: keep class and className mutually exclusive in compoundSlots.
tv({
  slots: {base: ""},
  variants: {size: {sm: {}, lg: {}}},
  compoundSlots: [
    // @ts-expect-error class and className remain mutually exclusive
    {slots: ["base"], size: "sm", class: "text-sm", className: "font-medium"},
  ],
});
