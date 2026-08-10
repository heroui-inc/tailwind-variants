import {table} from "table";

const identity = (value) => value;

const BORDER = {
  topBody: "─",
  topJoin: "┬",
  topLeft: "┌",
  topRight: "┐",
  bottomBody: "─",
  bottomJoin: "┴",
  bottomLeft: "└",
  bottomRight: "┘",
  bodyLeft: "│",
  bodyRight: "│",
  bodyJoin: "│",
  headerJoin: "┬",
  joinBody: "─",
  joinLeft: "├",
  joinRight: "┤",
  joinJoin: "┼",
};

/**
 * Renders a box-drawing table via the `table` package — the same look
 * `pnpm benchmark` prints to the terminal. Used for terminal output (with ANSI
 * styles) and for markdown code fences on the PR comment / Actions job summary
 * (plain, no styles).
 *
 * @param {Array<Record<string, string>>} rows  row objects keyed by header.
 * @param {{
 *   styles?: Array<(text: string) => string>,
 *   boldHeaders?: boolean,
 *   color?: (value: string, code: number) => string,
 * }} [options]  `color` applies to bold headers; omit it (or pass identity) for
 * plain output. `styles` colors individual columns.
 */
export const renderBoxTable = (rows, {styles = [], boldHeaders = false, color = identity} = {}) => {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const styleHeader = (value) => (boldHeaders ? color(value, 1) : value);
  const styleCell = (value, column) => (styles[column] ?? identity)(value);

  return table(
    [
      headers.map(styleHeader),
      ...rows.map((row) => headers.map((header, column) => styleCell(row[header], column))),
    ],
    {
      border: BORDER,
      columnDefault: {paddingLeft: 1, paddingRight: 1},
      // Top border, separator under the header, and bottom border only — no
      // per-row separators, matching the compact look of `pnpm benchmark`.
      drawHorizontalLine: (index, size) => index === 0 || index === 1 || index === size,
    },
  );
};
