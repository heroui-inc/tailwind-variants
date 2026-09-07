import type {TVCustomConfig} from "../../config-entry.js";
import type {
  TV,
  TVCompoundSlots,
  TVLite,
  TVReturnProps,
  TVReturnType,
  VariantProps,
} from "../../index.js";
import type {TVConfig, TVLiteConfig, TwMergeFn} from "../../lite.js";
import type {Assert, Extends, IsEqual} from "./test-utils.js";

import {tv as customTV} from "../../config-entry.js";
import {createTV, tv} from "../../index.js";
import {createCN, createTV as createLiteTV, tv as liteTV} from "../../lite.js";

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

// Case: multi-parent extend merges variant axes from each parent into VariantProps.
const focusable = tv({
  base: "focus-visible:ring-2",
  variants: {
    focus: {
      visible: "ring-2",
      none: "ring-0",
    },
  },
});
const animated = tv({
  base: "transition-all",
  variants: {
    motion: {
      normal: "duration-150",
      slow: "duration-300",
    },
  },
});
const multiExtended = tv({
  extend: [focusable, animated],
  base: "inline-flex",
  variants: {
    size: {
      sm: "text-sm",
      lg: "text-lg",
    },
  },
});

const multiProps: VariantProps<typeof multiExtended> = {
  focus: "visible",
  motion: "slow",
  size: "lg",
};

multiExtended(multiProps);

// @ts-expect-error variant keys not on any parent or the child are rejected
multiExtended({tone: "neutral"});

type MultiExtendMetadata = Assert<
  Extends<typeof multiExtended.extend, readonly [typeof focusable, typeof animated]>
>;

const multiExtendChecks: MultiExtendMetadata = true;

void multiProps;
void multiExtendChecks;

// Case: overlapping parent variant axes union their option keys in VariantProps.
const sizeLeft = tv({
  variants: {
    size: {
      sm: "text-sm",
      md: "text-base",
    },
  },
});
const sizeRight = tv({
  variants: {
    size: {
      sm: "py-1",
      lg: "text-lg",
    },
  },
});
const sizeMerged = tv({
  extend: [sizeLeft, sizeRight],
});

const sizeMergedProps: VariantProps<typeof sizeMerged> = {size: "lg"};

sizeMerged({size: "sm"});
sizeMerged({size: "md"});
sizeMerged(sizeMergedProps);

type SizeMergedSize = NonNullable<VariantProps<typeof sizeMerged>["size"]>;
// Overlapping parent axes must resolve to the exact option union (not `string`).
type SizeMergedSizeChecks = [
  Assert<IsEqual<SizeMergedSize, "sm" | "md" | "lg">>,
  Assert<Extends<"sm", SizeMergedSize>>,
  Assert<Extends<"md", SizeMergedSize>>,
  Assert<Extends<"lg", SizeMergedSize>>,
];

const sizeMergedSizeChecks: SizeMergedSizeChecks = [true, true, true, true];

void sizeMergedSizeChecks;

// @ts-expect-error overlapping merged size rejects options outside the union
sizeMerged({size: "xl"});

// Case: defaultVariants may target variant keys inherited from parents.
tv({
  extend: [focusable, animated],
  defaultVariants: {
    focus: "visible",
    motion: "slow",
  },
});

tv({
  extend: [focusable, animated],
  defaultVariants: {
    // @ts-expect-error defaultVariants reject invalid values on inherited parent axes
    focus: "nope",
  },
});

tv({
  extend: [focusable, animated],
  defaultVariants: {
    // @ts-expect-error defaultVariants reject keys absent from parents and child (Exact)
    tone: "neutral",
  },
});

// Case: multi-parent slots appear on the returned slot map.
const frameSlots = tv({
  slots: {
    base: "rounded-xl",
    title: "font-medium",
  },
});
const mediaSlots = tv({
  slots: {
    base: "border",
    media: "aspect-video",
  },
});
const multiSlotted = tv({
  extend: [frameSlots, mediaSlots],
  slots: {
    title: "text-base",
  },
});

const multiSlotResult = multiSlotted();

multiSlotResult.base();
multiSlotResult.title();
multiSlotResult.media();

// @ts-expect-error unknown slots remain rejected after multi-parent slot merge
multiSlotResult.footer();

// Case: child compoundVariants may condition on parent variant axes.
tv({
  extend: [focusable, animated],
  compoundVariants: [{focus: "visible", motion: "slow", class: "combo"}],
});

tv({
  extend: [focusable, animated],
  // @ts-expect-error compoundVariants reject invalid values on inherited parent axes
  compoundVariants: [{focus: "nope", class: "nope"}],
});

// Case: child compoundSlots may condition on parent variant axes and inherited slots.
const sizedSlots = tv({
  slots: {
    base: "slot-base",
    icon: "slot-icon",
  },
  variants: {
    size: {
      sm: {},
      lg: {},
    },
  },
});
const tonalOnly = tv({
  variants: {
    tone: {
      neutral: "",
      info: "",
    },
  },
});

type MultiParentCompoundSlots = TVCompoundSlots<
  undefined,
  typeof sizedSlots.slots,
  undefined,
  typeof sizedSlots.variants & typeof tonalOnly.variants
>;

const multiParentCompoundSlots: MultiParentCompoundSlots = [
  {slots: ["base", "icon"], size: "sm", tone: "info", class: "cs-combo"},
];

const multiParentCompoundSlotsBad: MultiParentCompoundSlots = [
  // @ts-expect-error compoundSlots reject unknown slots after multi-parent merge
  {slots: ["footer"], size: "sm", class: "nope"},
];

// Factory accepts child compoundSlots conditioned on parent axes/slots without redeclaring them.
tv({
  extend: [sizedSlots, tonalOnly],
  compoundSlots: [{slots: ["base", "icon"], size: "sm", tone: "info", class: "cs-combo"}],
});

void multiParentCompoundSlots;
void multiParentCompoundSlotsBad;

tv({
  // @ts-expect-error extend requires a non-empty TVExtendList
  extend: [],
  base: "inline-flex",
});

tv({
  // @ts-expect-error extend arrays reject non-tv values
  extend: [focusable, "not-a-component"],
  base: "inline-flex",
});

// Case: lite multi-parent extend keeps the same VariantProps merge behavior.
const liteFocusable = liteTV({
  variants: {
    focus: {
      visible: "ring-2",
      none: "ring-0",
    },
  },
});
const liteAnimated = liteTV({
  variants: {
    motion: {
      normal: "duration-150",
      slow: "duration-300",
    },
  },
});
const liteMultiExtended = liteTV({
  extend: [liteFocusable, liteAnimated],
  variants: {
    size: {
      sm: "text-sm",
      lg: "text-lg",
    },
  },
});

const liteMultiProps: VariantProps<typeof liteMultiExtended> = {
  focus: "visible",
  motion: "slow",
  size: "lg",
};

liteMultiExtended(liteMultiProps);

// @ts-expect-error lite multi-extend also rejects unknown variant keys
liteMultiExtended({tone: "neutral"});

void sizeMergedProps;
void multiSlotResult;
void liteMultiProps;

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

// Case: return a string for a component without slots.
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

// @ts-expect-error full createTV requires a config object
createTV();

const liteWithMerge: TVLite = createLiteTV({twMerge: (classList) => classList});

void liteWithMerge;

liteTV({base: "block"}, {twMerge: false});
liteTV({base: "block"}, {twMerge: (classList) => classList});

// @ts-expect-error lite factory does not accept twMergeConfig
createLiteTV({twMergeConfig: {}});

// @ts-expect-error lite factory does not accept debug
createLiteTV({debug: true});

// @ts-expect-error lite per-call config does not accept twMergeConfig
liteTV({base: "block"}, {twMergeConfig: {}});

const identity: TwMergeFn = (classList) => classList;
const liteConfig: TVLiteConfig = {twMerge: identity};
const _fullConfig: TVConfig = {twMerge: identity, debug: false};

void createLiteTV(liteConfig);
void _fullConfig;

const boundCn = createCN({twMerge: identity});
const boundOut: string = boundCn("px-2", "px-4");

void boundOut;

// @ts-expect-error createCN does not accept twMergeConfig
createCN({twMergeConfig: {}});

// Case: single-signature TV contextually types wrapper parameters; no
// annotations or assertions needed, and the return type stays checked.
const _myTV: TV = (options, config) => {
  return tv(options, {
    ...config,
    twMerge: config?.twMerge ?? false,
  });
};

void _myTV;

// Case: the config entry's TV carries twMergeConfig through a wrapper.
const _myCustomTV: TV<TVCustomConfig> = (options, config) => {
  return customTV(options, {
    ...config,
    twMerge: config?.twMerge ?? false,
    twMergeConfig: {
      ...config?.twMergeConfig,
      classGroups: {
        ...config?.twMergeConfig?.classGroups,
      },
      theme: {
        ...config?.twMergeConfig?.theme,
      },
    },
  });
};

void _myCustomTV;
