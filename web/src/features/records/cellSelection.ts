// Grid cell selection, keyed by record and field IDs so it survives re-renders. The anchor is the active
// cell (it holds focus and is what Enter edits); the focus is the far corner of a range.
export type CellRef = { recordId: string; fieldId: string };
export type CellSelection = { anchor: CellRef; focus: CellRef };
export type GridAxes = { rows: string[]; columns: string[] };
export type CellRange = { top: number; bottom: number; left: number; right: number };

export const cellKey = (cell: CellRef) => `${cell.recordId}:${cell.fieldId}`;
export const sameCell = (a?: CellRef, b?: CellRef) => !!a && !!b && a.recordId === b.recordId && a.fieldId === b.fieldId;
export const single = (cell: CellRef): CellSelection => ({ anchor: cell, focus: cell });
export const isSingle = (selection: CellSelection) => sameCell(selection.anchor, selection.focus);

function indexOf(axes: GridAxes, cell: CellRef) {
  return { row: axes.rows.indexOf(cell.recordId), col: axes.columns.indexOf(cell.fieldId) };
}
const at = (axes: GridAxes, row: number, col: number): CellRef => ({ recordId: axes.rows[row], fieldId: axes.columns[col] });
const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

// Drops a selection whose cells are no longer visible, for example after a refresh, page change, or collapsed group.
export function reconcile(selection: CellSelection | undefined, axes: GridAxes) {
  if (!selection) {
    return undefined;
  }
  const anchor = indexOf(axes, selection.anchor);
  const focus = indexOf(axes, selection.focus);
  return anchor.row < 0 || anchor.col < 0 || focus.row < 0 || focus.col < 0 ? undefined : selection;
}
export function rangeOf(selection: CellSelection, axes: GridAxes): CellRange {
  const anchor = indexOf(axes, selection.anchor);
  const focus = indexOf(axes, selection.focus);
  return {
    top: Math.min(anchor.row, focus.row),
    bottom: Math.max(anchor.row, focus.row),
    left: Math.min(anchor.col, focus.col),
    right: Math.max(anchor.col, focus.col),
  };
}
export function contains(range: CellRange, row: number, col: number) {
  return row >= range.top && row <= range.bottom && col >= range.left && col <= range.right;
}
// Moving without extending starts from the anchor and collapses the range; extending moves the focus corner.
// A jump goes to the edge of the grid in the direction of travel.
export function move(
  selection: CellSelection,
  axes: GridAxes,
  rows: number,
  cols: number,
  { extend = false, jump = false }: { extend?: boolean; jump?: boolean } = {},
): CellSelection {
  const from = indexOf(axes, extend ? selection.focus : selection.anchor);
  const lastRow = axes.rows.length - 1;
  const lastCol = axes.columns.length - 1;
  const row = jump && rows ? (rows < 0 ? 0 : lastRow) : clamp(from.row + rows, lastRow);
  const col = jump && cols ? (cols < 0 ? 0 : lastCol) : clamp(from.col + cols, lastCol);
  const next = at(axes, row, col);
  return extend ? { anchor: selection.anchor, focus: next } : single(next);
}
export function selectColumn(axes: GridAxes, fieldId: string): CellSelection | undefined {
  const col = axes.columns.indexOf(fieldId);
  return axes.rows.length && col >= 0 ? { anchor: at(axes, 0, col), focus: at(axes, axes.rows.length - 1, col) } : undefined;
}
export function selectAll(axes: GridAxes): CellSelection | undefined {
  return axes.rows.length && axes.columns.length
    ? { anchor: at(axes, 0, 0), focus: at(axes, axes.rows.length - 1, axes.columns.length - 1) }
    : undefined;
}
