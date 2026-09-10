import type {TVConfig, VariantProps} from "../../index.js";
import type {Assert, IsEqual as Equals} from "./test-utils.js";

import {createTV, tv} from "../../index.js";
import {tv as liteTV} from "../../lite.js";

const button = tv({
  base: "inline-flex",
  variants: {
    color: {primary: "bg-blue-600", danger: "bg-red-600"},
    size: {sm: "text-sm", lg: "text-lg"},
  },
  defaultVariants: {color: "primary"},
});

// Case: no trace API leaks onto the return type; the component is just callable.
const className: string = button({color: "primary"});

void className;

// Case: the props a consumer derives carry only the variant axes.
type ButtonVariants = VariantProps<typeof button>;
type ButtonPropsContract = Assert<Equals<keyof ButtonVariants, "color" | "size">>;

const buttonPropsContract: ButtonPropsContract = true;

void buttonPropsContract;

// Case: slot generators are plain callables, without any trace attachment.
const card = tv({
  slots: {base: "flex", title: "font-medium"},
  variants: {size: {sm: {title: "text-sm"}}},
});

const titleClass: string = card({size: "sm"}).title();
const withProps: string = card({size: "sm"}).title({size: "sm"});

void titleClass;
void withProps;

// Case: the lite entrypoint keeps the same callable contract.
const liteClass: string = liteTV({base: "px-2"})();

void liteClass;

// Case: debug is a plain boolean.
const debugOn: TVConfig = {debug: true};
const debugOff: TVConfig = {debug: false};
const debugUnset: TVConfig = {};

void debugOn;
void debugOff;
void debugUnset;

// Case: debug composes with the existing merge configuration.
createTV({twMerge: true, debug: true});
tv({base: "px-2"}, {twMerge: false, debug: true});

// @ts-expect-error debug.console was removed
const invalidConsole: TVConfig = {debug: {console: false}};

// @ts-expect-error debug.trace was removed
const invalidTrace: TVConfig = {debug: {trace: true}};

// @ts-expect-error debug.browserOnly was removed
const invalidBrowserOnly: TVConfig = {debug: {browserOnly: "server"}};

// @ts-expect-error debug must be a boolean
const invalidShorthand: TVConfig = {debug: "yes"};

void invalidConsole;
void invalidTrace;
void invalidBrowserOnly;
void invalidShorthand;

// @ts-expect-error the name option was removed
tv({name: "Button", base: "px-2"});

// @ts-expect-error trace() was removed from the return type
button.trace();
