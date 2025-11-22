/* eslint-disable no-console */
import Benchmark from "benchmark";
import {cva} from "class-variance-authority";
import {extendTailwindMerge} from "tailwind-merge";

import {tv, cx, cn} from "./src/index.js";

const suite = new Benchmark.Suite();

const COMMON_UNITS = ["small", "medium", "large"];

const twMergeConfig = {
  theme: {
    opacity: ["disabled"],
    spacing: [
      "divider",
      "unit",
      "unit-2",
      "unit-4",
      "unit-6",
      "unit-8",
      "unit-10",
      "unit-12",
      "unit-14",
    ],
    borderWidth: COMMON_UNITS,
    borderRadius: COMMON_UNITS,
  },
  classGroups: {
    shadow: [{shadow: COMMON_UNITS}],
    "font-size": [{text: ["tiny", ...COMMON_UNITS]}],
    "bg-image": ["bg-stripe-gradient"],
    "min-w": [
      {
        "min-w": ["unit", "unit-2", "unit-4", "unit-6", "unit-8", "unit-10", "unit-12", "unit-14"],
      },
    ],
  },
};

// without slots no custom tw-merge config
const noSlots = {
  avatar: tv({
    base: "relative flex shrink-0 overflow-hidden rounded-full",
    variants: {
      size: {
        xs: "h-6 w-6",
        sm: "h-8 w-8",
        md: "h-10 w-10",
        lg: "h-12 w-12",
        xl: "h-14 w-14",
      },
    },
    defaultVariants: {
      size: "md",
    },
    compoundVariants: [
      {
        size: ["xs", "sm"],
        class: "ring-1",
      },
      {
        size: ["md", "lg", "xl", "2xl"],
        class: "ring-2",
      },
    ],
  }),
  image: tv({
    base: "aspect-square h-full w-full",
    variants: {
      withBorder: {
        true: "border-1.5 border-white",
      },
    },
  }),
  fallback: tv({
    base: "flex h-full w-full items-center justify-center rounded-full bg-muted",
    variants: {
      size: {
        xs: "text-xs",
        sm: "text-sm",
        md: "text-base",
        lg: "text-lg",
        xl: "text-xl",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }),
};

// without slots & no tw-merge enabled
const noSlotsNoTwMerge = {
  avatar: tv(
    {
      base: "relative flex shrink-0 overflow-hidden rounded-full",
      variants: {
        size: {
          xs: "h-6 w-6",
          sm: "h-8 w-8",
          md: "h-10 w-10",
          lg: "h-12 w-12",
          xl: "h-14 w-14",
        },
      },
      defaultVariants: {
        size: "md",
      },
      compoundVariants: [
        {
          size: ["xs", "sm"],
          class: "ring-1",
        },
        {
          size: ["md", "lg", "xl", "2xl"],
          class: "ring-2",
        },
      ],
    },
    {
      twMerge: false,
    },
  ),
  image: tv(
    {
      base: "aspect-square h-full w-full",
      variants: {
        withBorder: {
          true: "border-1.5 border-white",
        },
      },
    },
    {
      twMerge: false,
    },
  ),
  fallback: tv(
    {
      base: "flex h-full w-full items-center justify-center rounded-full bg-muted",
      variants: {
        size: {
          xs: "text-xs",
          sm: "text-sm",
          md: "text-base",
          lg: "text-lg",
          xl: "text-xl",
        },
      },
      defaultVariants: {
        size: "md",
      },
    },
    {
      twMerge: false,
    },
  ),
};

// without slots & custom tw-merge config
const noSlotsWithCustomConfig = {
  avatar: tv(
    {
      base: "relative flex shrink-0 overflow-hidden rounded-full",
      variants: {
        size: {
          xs: "h-unit-6 w-unit-6",
          sm: "h-unit-8 w-unit-8",
          md: "h-unit-10 w-unit-10",
          lg: "h-unit-12 w-unit-12",
          xl: "h-unit-14 w-unit-14",
        },
      },
      defaultVariants: {
        size: "md",
      },
      compoundVariants: [
        {
          size: ["xs", "sm"],
          class: "ring-1",
        },
        {
          size: ["md", "lg", "xl", "2xl"],
          class: "ring-2",
        },
      ],
    },
    {
      twMergeConfig,
    },
  ),
  image: tv({
    base: "aspect-square h-full w-full",
    variants: {
      withBorder: {
        true: "border-1.5 border-white",
      },
    },
  }),
  fallback: tv(
    {
      base: "flex h-full w-full items-center justify-center rounded-full bg-muted",
      variants: {
        size: {
          sm: "text-small",
          md: "text-medium",
          lg: "text-large",
        },
      },
      defaultVariants: {
        size: "md",
      },
    },
    {
      twMergeConfig,
    },
  ),
};

// with slots no custom tw-merge config
export const avatar = (twMerge = true) =>
  tv(
    {
      slots: {
        base: "relative flex shrink-0 overflow-hidden rounded-full",
        image: "aspect-square h-full w-full",
        fallback: "flex h-full w-full items-center justify-center rounded-full bg-muted",
      },
      variants: {
        withBorder: {
          true: {
            image: "border-1.5 border-white",
          },
        },
        size: {
          xs: {
            base: "h-6 w-6",
            fallback: "text-xs",
          },
          sm: {
            base: "h-8 w-8",
            fallback: "text-sm",
          },
          md: {
            base: "h-10 w-10",
            fallback: "text-base",
          },
          lg: {
            base: "h-12 w-12",
            fallback: "text-large",
          },
          xl: {
            base: "h-14 w-14",
            fallback: "text-xl",
          },
        },
      },
      defaultVariants: {
        size: "md",
        withBorder: false,
      },
      compoundVariants: [
        {
          size: ["xs", "sm"],
          class: "ring-1",
        },
        {
          size: ["md", "lg", "xl", "2xl"],
          class: "ring-2",
        },
      ],
    },
    {
      twMerge,
    },
  );

// with slots & custom tw-merge config
export const avatarWithCustomConfig = tv(
  {
    slots: {
      base: "relative flex shrink-0 overflow-hidden rounded-full",
      image: "aspect-square h-full w-full",
      fallback: "flex h-full w-full items-center justify-center rounded-full bg-muted",
    },
    variants: {
      withBorder: {
        true: {
          image: "border-1.5 border-white",
        },
      },
      size: {
        sm: {
          base: "h-unit-8 w-unit-8",
          fallback: "text-small",
        },
        md: {
          base: "h-unit-10 w-unit-10",
          fallback: "text-medium",
        },
        lg: {
          base: "h-unit-12 w-unit-12",
          fallback: "text-large",
        },
      },
    },
    defaultVariants: {
      size: "md",
      withBorder: false,
    },
    compoundVariants: [
      {
        size: ["sm"],
        class: "ring-1",
      },
      {
        size: ["md", "lg"],
        class: "ring-2",
      },
    ],
  },
  {
    twMergeConfig,
  },
);

// CVA without tw-merge config
const cvaNoMerge = {
  avatar: cva("relative flex shrink-0 overflow-hidden rounded-full", {
    variants: {
      size: {
        xs: "h-6 w-6",
        sm: "h-8 w-8",
        md: "h-10 w-10",
        lg: "h-12 w-12",
        xl: "h-14 w-14",
      },
    },
    defaultVariants: {
      size: "md",
    },
    compoundVariants: [
      {
        size: ["xs", "sm"],
        class: "ring-1",
      },
      {
        size: ["md", "lg", "xl", "2xl"],
        class: "ring-2",
      },
    ],
  }),
  image: cva("aspect-square h-full w-full", {
    variants: {
      withBorder: {
        true: "border-1.5 border-white",
      },
    },
  }),
  fallback: cva("flex h-full w-full items-center justify-center rounded-full bg-muted", {
    variants: {
      size: {
        xs: "text-xs",
        sm: "text-sm",
        md: "text-base",
        lg: "text-lg",
        xl: "text-xl",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }),
};

const cvaMerge = extendTailwindMerge({extend: twMergeConfig});

// Test data for cx benchmarks
const simpleClasses = ["text-xl", "font-bold", "text-center", "px-4", "py-2"];
const arrayClasses = [["px-4", "py-2"], "bg-blue-500", ["rounded-lg", "shadow-md"]];
const objectClasses = {
  "text-sm": true,
  "font-bold": false,
  "bg-green-200": 1,
  "m-0": 0,
  "px-2": true,
  "py-2": true,
};
const mixedClasses = [
  "text-lg",
  ["px-3", {"hover:bg-yellow-300": true, "focus:outline-none": false}],
  {"rounded-md": true, "shadow-md": null},
  "leading-tight",
];
const nestedArrays = [
  "px-4",
  ["py-2", ["bg-blue-500", ["rounded-lg", false, ["shadow-md", ["text-white"]]]]],
];
const withFalsy = [
  "text-xl",
  false && "font-bold",
  "text-center",
  undefined,
  null,
  0,
  "",
  "px-4",
];

// add tests
suite
  .add("TV without slots & tw-merge (enabled)", function () {
    noSlots.avatar({size: "md"});
    noSlots.fallback();
    noSlots.image();
  })
  .add("TV without slots & tw-merge (disabled)", function () {
    noSlotsNoTwMerge.avatar({size: "md"});
    noSlotsNoTwMerge.fallback();
    noSlotsNoTwMerge.image();
  })
  .add("TV with slots & tw-merge (enabled)", function () {
    const {base, fallback, image} = avatar(true)({size: "md"});

    base();
    fallback();
    image();
  })
  .add("TV with slots & tw-merge (disabled)", function () {
    const {base, fallback, image} = avatar(false)({size: "md"});

    base();
    fallback();
    image();
  })
  .add("TV without slots & custom tw-merge config", function () {
    noSlotsWithCustomConfig.avatar({size: "md"});
    noSlotsWithCustomConfig.fallback();
    noSlotsWithCustomConfig.image();
  })
  .add("TV with slots & custom tw-merge config", function () {
    const {base, fallback, image} = avatarWithCustomConfig({size: "md"});

    base();
    fallback();
    image();
  })
  .add("CVA without slots & tw-merge (enabled)", function () {
    cvaMerge(cvaNoMerge.avatar({size: "md"}));
    cvaMerge(cvaNoMerge.fallback());
    cvaMerge(cvaNoMerge.image());
  })
  .add("CVA without slots & tw-merge (disabled)", function () {
    cvaNoMerge.avatar({size: "md"});
    cvaNoMerge.fallback();
    cvaNoMerge.image();
  })
  .add("cx - simple strings", function () {
    cx(...simpleClasses);
  })
  .add("cx - arrays", function () {
    cx(...arrayClasses);
  })
  .add("cx - objects", function () {
    cx(objectClasses);
  })
  .add("cx - mixed arguments", function () {
    cx(...mixedClasses);
  })
  .add("cx - nested arrays", function () {
    cx(...nestedArrays);
  })
  .add("cx - with falsy values", function () {
    cx(...withFalsy);
  })
  .add("cn - simple strings (with tw-merge)", function () {
    cn(...simpleClasses)({twMerge: true});
  })
  .add("cn - arrays (with tw-merge)", function () {
    cn(...arrayClasses)({twMerge: true});
  })
  .add("cn - objects (with tw-merge)", function () {
    cn(objectClasses)({twMerge: true});
  })
  .add("cn - mixed arguments (with tw-merge)", function () {
    cn(...mixedClasses)({twMerge: true});
  })
  .add("cn - nested arrays (with tw-merge)", function () {
    cn(...nestedArrays)({twMerge: true});
  })
  .add("cn - with falsy values (with tw-merge)", function () {
    cn(...withFalsy)({twMerge: true});
  })
  .add("cn - simple strings (without tw-merge)", function () {
    cn(...simpleClasses)({twMerge: false});
  })

  // add listeners
  .on("cycle", function (event) {
    console.log(String(event.target));
  })
  .on("complete", function () {
    console.log("Fastest is " + this.filter("fastest").map("name"));
  })
  // run async
  .run({async: true});
