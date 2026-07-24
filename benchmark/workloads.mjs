export const buttonConfig = {
  base: "button inline-flex items-center rounded border font-semibold",
  variants: {
    intent: {
      primary: "bg-blue-500 text-white border-transparent hover:bg-blue-600",
      secondary: "bg-white text-gray-800 border-gray-400 hover:bg-gray-100",
      warning: "bg-yellow-500 text-black border-transparent hover:bg-yellow-600",
      danger: [
        "bg-red-500",
        ["text-white", {hidden: false}],
        "border-transparent hover:bg-red-600",
      ],
    },
    disabled: {
      true: "cursor-not-allowed opacity-50",
      false: "cursor-pointer opacity-100",
    },
    size: {
      sm: "h-8 px-2 text-sm",
      md: "h-10 px-4 text-base",
      lg: "h-12 px-6 text-lg",
    },
  },
  compoundVariants: [
    {intent: "primary", size: "md", className: "uppercase tracking-wide"},
    {intent: "warning", disabled: false, className: "ring-1"},
    {intent: "warning", disabled: true, className: "ring-2"},
    {intent: ["warning", "danger"], className: "border-red-500"},
  ],
  defaultVariants: {
    disabled: false,
    intent: "primary",
    size: "md",
  },
};

export const buttonProps = [
  {},
  {intent: "primary", disabled: true},
  {intent: "secondary", size: "md"},
  {intent: "warning", size: "md", disabled: true},
  {intent: "danger", size: "lg"},
];

export const slotsConfig = {
  slots: {
    base: "inline-flex items-center rounded border",
    icon: "shrink-0",
    label: "truncate",
  },
  variants: {
    intent: {
      primary: {
        base: "bg-blue-500 text-white",
        icon: "text-blue-100",
      },
      secondary: {
        base: "bg-white text-gray-800",
        icon: "text-gray-500",
      },
      danger: {
        base: "bg-red-500 text-white",
        icon: "text-red-100",
      },
    },
    size: {
      sm: {base: "h-8 px-2", icon: "size-3", label: "text-sm"},
      md: {base: "h-10 px-4", icon: "size-4", label: "text-base"},
      lg: {base: "h-12 px-6", icon: "size-5", label: "text-lg"},
    },
    disabled: {
      true: {base: "cursor-not-allowed opacity-50"},
      false: {base: "cursor-pointer opacity-100"},
    },
  },
  compoundVariants: [
    {intent: "primary", size: "md", class: {base: "ring-2", label: "font-medium"}},
    {intent: ["danger", "secondary"], disabled: true, class: {icon: "opacity-60"}},
  ],
  compoundSlots: [{slots: ["icon", "label"], size: ["md", "lg"], class: "leading-none"}],
  defaultVariants: {
    disabled: false,
    intent: "primary",
    size: "md",
  },
};

export const slotsProps = [
  {},
  {intent: "primary", disabled: true},
  {intent: "secondary", size: "md"},
  {intent: "secondary", size: "lg", disabled: true},
  {intent: "danger", size: "lg"},
];

export const customMergeConfig = {
  theme: {
    spacing: ["unit-2", "unit-4", "unit-6"],
  },
  classGroups: {
    "font-size": [{text: ["tiny", "small", "medium", "large"]}],
  },
};

export const customButtonConfig = {
  ...buttonConfig,
  variants: {
    ...buttonConfig.variants,
    size: {
      sm: "h-unit-2 px-unit-2 text-small",
      md: "h-unit-4 px-unit-4 text-medium",
      lg: "h-unit-6 px-unit-6 text-large",
    },
  },
};

export const classInputs = [
  "button",
  ["px-2", "py-2", ["rounded", false, ["shadow"]]],
  {active: true, disabled: false},
  undefined,
  null,
  "trailing",
];

/** String/falsy tokens shared by TV `cx` and cnfast `twJoin`. */
export const tokenInputs = ["px-2", false, null, undefined, "py-2", "", "rounded", "shadow"];

/** Mixed inputs that exercise join + conflict resolution (`cn`). */
export const mergeClassInputs = [
  "button px-2 py-2 text-sm",
  ["px-4", {active: true, hidden: false}],
  undefined,
  "text-lg trailing",
];

/** Token inputs for direct `twMerge` (no object dictionaries). */
export const mergeTokenInputs = [
  "button px-2 py-2 text-sm",
  false,
  null,
  "px-4",
  "text-lg trailing",
];
