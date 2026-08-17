/*
 * Class-name parser for the built-in merger.
 *
 * @see https://github.com/dcastil/tailwind-merge
 * @see https://github.com/dcastil/tailwind-merge/blob/main/LICENSE.md
 */

import type {AnyConfig, ParsedClassName} from "./types.js";

export const IMPORTANT_MODIFIER = "!";

const CHAR_MODIFIER_SEPARATOR = 58; // ":"
const CHAR_POSTFIX_SEPARATOR = 47; // "/"
const CHAR_OPEN_BRACKET = 91; // "["
const CHAR_CLOSE_BRACKET = 93; // "]"
const CHAR_OPEN_PAREN = 40; // "("
const CHAR_CLOSE_PAREN = 41; // ")"
const CHAR_IMPORTANT = 33; // "!"

// One result shape keeps the parser monomorphic.
const createResultObject = (
  modifiers: string[],
  hasImportantModifier: boolean,
  baseClassName: string,
  maybePostfixModifierPosition?: number,
  isExternal?: boolean,
): ParsedClassName => ({
  modifiers,
  hasImportantModifier,
  baseClassName,
  maybePostfixModifierPosition,
  isExternal,
});

/** Parse a class name into modifiers, base name, and postfix position. */
export const parseClassName = (className: string): ParsedClassName => {
  const modifiers: string[] = [];

  let bracketDepth = 0;
  let parenDepth = 0;
  let modifierStart = 0;
  let postfixModifierPosition: number | undefined;

  const len = className.length;
  for (let index = 0; index < len; index++) {
    const charCode = className.charCodeAt(index);

    if (bracketDepth === 0 && parenDepth === 0) {
      if (charCode === CHAR_MODIFIER_SEPARATOR) {
        modifiers.push(className.slice(modifierStart, index));
        modifierStart = index + 1;
        continue;
      }

      if (charCode === CHAR_POSTFIX_SEPARATOR) {
        postfixModifierPosition = index;
        continue;
      }
    }

    if (charCode === CHAR_OPEN_BRACKET) bracketDepth++;
    else if (charCode === CHAR_CLOSE_BRACKET) bracketDepth--;
    else if (charCode === CHAR_OPEN_PAREN) parenDepth++;
    else if (charCode === CHAR_CLOSE_PAREN) parenDepth--;
  }

  const baseClassNameWithImportantModifier =
    modifiers.length === 0 ? className : className.slice(modifierStart);

  let baseClassName = baseClassNameWithImportantModifier;
  let hasImportantModifier = false;

  const lastIndex = baseClassNameWithImportantModifier.length - 1;
  if (baseClassNameWithImportantModifier.charCodeAt(lastIndex) === CHAR_IMPORTANT) {
    baseClassName = baseClassNameWithImportantModifier.slice(0, -1);
    hasImportantModifier = true;
  } else if (
    // Tailwind CSS v3: important modifier at the start of the base class (legacy).
    baseClassNameWithImportantModifier.charCodeAt(0) === CHAR_IMPORTANT
  ) {
    baseClassName = baseClassNameWithImportantModifier.slice(1);
    hasImportantModifier = true;
  }

  const maybePostfixModifierPosition =
    postfixModifierPosition && postfixModifierPosition > modifierStart
      ? postfixModifierPosition - modifierStart
      : undefined;

  return createResultObject(
    modifiers,
    hasImportantModifier,
    baseClassName,
    maybePostfixModifierPosition,
  );
};

/** Wrap the core parser with optional `prefix` and `experimentalParseClassName`. */
export const createParseClassName = (config: AnyConfig) => {
  let parse = parseClassName;

  if (config.prefix) {
    const fullPrefix = config.prefix + ":";
    const previous = parse;

    parse = (className: string) =>
      className.startsWith(fullPrefix)
        ? previous(className.slice(fullPrefix.length))
        : createResultObject([], false, className, undefined, true);
  }

  if (config.experimentalParseClassName) {
    const previous = parse;
    const experimentalParseClassName = config.experimentalParseClassName;

    parse = (className: string) =>
      experimentalParseClassName({className, parseClassName: previous});
  }

  return parse;
};
