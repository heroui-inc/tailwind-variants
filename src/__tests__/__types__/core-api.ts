import {
  createTV,
  type TV,
  type TVLite,
  type TVReturnProps,
  type TVReturnType,
  tv,
  type VariantProps,
} from "../../index.js";
import {createTV as createLiteTV, tv as liteTV} from "../../lite.js";

type Assert<T extends true> = T;
type Extends<Left, Right> = Left extends Right ? true : false;

// Case: infer callable props, return type, and VariantProps from basic variants.
const button = tv({
  base: "font-medium",
  variants: {
    color: {
      primary: "text-blue-500",
      secondary: "text-gray-500",
    },
    disabled: {
      true: "opacity-50",
      false: "opacity-100",
    },
  },
});

const buttonClass: string = button({color: "primary", disabled: true});
const buttonProps: VariantProps<typeof button> = {color: "secondary", disabled: false};

void buttonClass;
void buttonProps;

// @ts-expect-error invalid variants remain rejected
button({color: "invalid"});

// @ts-expect-error boolean variants reject their string representation
button({disabled: "true"});

// @ts-expect-error class and className remain mutually exclusive
button({class: "rounded", className: "shadow"});

// Case: preserve parent variants when extending a component once.
const extendedButton = tv({
  extend: button,
  variants: {
    size: {
      sm: "text-sm",
      lg: "text-lg",
    },
  },
});

extendedButton({color: "primary", size: "lg"});

// Case: expose the source component and all return metadata fields.
type ExtendedMetadata = Assert<Extends<typeof extendedButton.extend, typeof button>>;
type ExtendedKeys = Assert<
  Extends<
    keyof TVReturnProps<any, any, any, any, any, any>,
    keyof TVReturnType<any, any, any, any, any, any>
  >
>;

const metadataChecks: [ExtendedMetadata, ExtendedKeys] = [true, true];

void metadataChecks;

// Case: infer slot functions and allow variant overrides per slot.
const slotted = tv({
  slots: {
    base: "flex",
    item: "px-2",
  },
  variants: {
    size: {
      sm: {item: "text-sm"},
      lg: {item: "text-lg"},
    },
  },
});

const slots = slotted({size: "sm"});
const baseSlotClass: string = slots.base();
const itemSlotClass: string = slots.item({size: "lg"});

void baseSlotClass;
void itemSlotClass;

// @ts-expect-error unknown slots remain rejected
slots.missing();

// Case: always expose the implicit base slot for a slotted component.
const implicitBase = tv({
  slots: {
    root: "flex",
    label: "font-medium",
  },
});
const {root, label, ...remainingSlots} = implicitBase();
const implicitBaseClass: string = remainingSlots.base();

type RemainingSlotKeys = Assert<Extends<keyof typeof remainingSlots, "base">>;

const remainingSlotKeys: RemainingSlotKeys = true;

void root;
void label;
void implicitBaseClass;
void remainingSlotKeys;

// Case: distinguish explicit empty slots from an undefined slots option.
const emptySlotsComponent = tv({slots: {}});
const emptySlotsBaseClass: string = emptySlotsComponent().base();
const emptySlotsWithBase = tv({base: "flex", slots: {}});
const configuredEmptyBaseClass: string = emptySlotsWithBase().base();
const undefinedSlotsComponent = tv({slots: undefined});
const undefinedSlotsClass: string = undefinedSlotsComponent();

void emptySlotsBaseClass;
void configuredEmptyBaseClass;
void undefinedSlotsClass;

// Case: preserve the implicit base slot when extending slots.
const extendedImplicitBase = tv({
  extend: implicitBase,
  slots: {
    content: "p-2",
  },
});

extendedImplicitBase().base();

// Case: return a string for a component without slot mode.
const plainComponent = tv({base: "block"});
const plainComponentClass: string = plainComponent();

void plainComponentClass;

// Case: retain all variants, defaults, compounds, and metadata across three extend levels.
const grandparent = tv({
  variants: {
    tone: {
      neutral: "text-gray-500",
    },
  },
});
const parent = tv({
  extend: grandparent,
  variants: {
    size: {
      sm: "text-sm",
    },
  },
});
const child = tv({
  extend: parent,
  variants: {
    weight: {
      bold: "font-bold",
    },
  },
  defaultVariants: {
    tone: "neutral",
    size: "sm",
    weight: "bold",
  },
  compoundVariants: [
    {
      tone: "neutral",
      size: "sm",
      weight: "bold",
      class: "tracking-normal",
    },
  ],
});

type ChildProps = VariantProps<typeof child>;
type ChildKeys = Assert<Extends<"tone" | "size" | "weight", keyof ChildProps>>;

const childProps: ChildProps = {tone: "neutral", size: "sm", weight: "bold"};
const childVariantKeys: Array<"tone" | "size" | "weight"> = child.variantKeys;

child(childProps);

void childVariantKeys;
void (true as ChildKeys);

// Case: merge option keys when the same variant is extended repeatedly.
const optionBase = tv({variants: {color: {primary: ""}}});
const optionParent = tv({
  extend: optionBase,
  variants: {color: {secondary: ""}},
});
const optionChild = tv({
  extend: optionParent,
  variants: {color: {danger: ""}},
});

optionChild({color: "primary"});
optionChild({color: "secondary"});
optionChild({color: "danger"});

// Case: accept undefined as a false condition for boolean compound variants.
tv({
  variants: {
    enabled: {
      true: "opacity-100",
    },
  },
  compoundVariants: [
    {enabled: undefined, class: "opacity-50"},
    {enabled: [false, undefined], class: "opacity-50"},
  ],
});

// Case: reject undefined conditions for non-boolean compound variants.
tv({
  variants: {
    color: {
      primary: "text-blue-500",
    },
  },
  compoundVariants: [
    // @ts-expect-error undefined is only accepted for boolean variant conditions
    {color: ["primary", undefined], class: "underline"},
  ],
});

// Case: preserve the distinct full and lite factory call contracts.
const configuredTV: TV = createTV({twMerge: false});
const liteFactory: TVLite = createLiteTV();

configuredTV({base: "px-2 px-4"})();
liteFactory({base: "px-2 px-4"})();
liteTV({base: "block"})();

// Case: retain multi-level variants through a configured full factory.
const configuredBase = configuredTV({variants: {tone: {neutral: ""}}});
const configuredParent = configuredTV({
  extend: configuredBase,
  variants: {size: {sm: ""}},
});
const configuredChild = configuredTV({
  extend: configuredParent,
  variants: {weight: {bold: ""}},
});

configuredChild({tone: "neutral", size: "sm", weight: "bold"});

// Case: retain multi-level variants through the lite factory.
const liteBase = liteFactory({variants: {tone: {neutral: ""}}});
const liteParent = liteFactory({
  extend: liteBase,
  variants: {size: {sm: ""}},
});
const liteChild = liteFactory({
  extend: liteParent,
  variants: {weight: {bold: ""}},
});

liteChild({tone: "neutral", size: "sm", weight: "bold"});

// @ts-expect-error full createTV keeps its existing required config parameter
createTV();

// @ts-expect-error lite createTV keeps its existing no-argument contract
createLiteTV({twMerge: false});

// @ts-expect-error TVLite has no per-component config argument
liteTV({base: "block"}, {twMerge: false});
