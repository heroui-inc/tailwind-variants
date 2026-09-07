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

// Box-drawing table with the look `pnpm benchmark` prints. `styles` colors
// columns by index; `color` applies to bold headers (identity for plain output).
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
      // Borders and the header separator only, no per-row lines.
      drawHorizontalLine: (index, size) => index === 0 || index === 1 || index === size,
    },
  );
};
