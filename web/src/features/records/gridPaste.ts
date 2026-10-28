import type { DataRecord, Field, ResolvedLabel, Values, WriteRecords } from "../../api/types";
import type { CellRange } from "./cellSelection";
import { type ParsedCell, parseText } from "./clipboardText";

export const maxPasteRecords = 500;
export const clipboardType = "application/x-formsoftware-cells";
// A copied cell: its text, plus the stored value when it came from this grid, so same-type pastes stay lossless.
export type ClipCell = { text: string; value?: unknown; type?: Field["type"]; target?: string | null };
export type ClipPayload = { app: "formsoftware"; form: string; token: string; cells: ClipCell[][] };
export type PasteTarget = { row: number; col: number; cell: ClipCell };
// One copied value fills the whole selection; a block repeats to fill a larger selection; otherwise the block pastes
// from the selection's top-left cell. Rows past the end become new records; columns past the end are dropped.
export function pasteTargets(clip: ClipCell[][], range: CellRange, rowCount: number, columnCount: number) {
  const height = clip.length;
  const width = Math.max(0, ...clip.map((row) => row.length));
  const rangeHeight = range.bottom - range.top + 1;
  const rangeWidth = range.right - range.left + 1;
  const fill = (rangeHeight > 1 || rangeWidth > 1) && rangeHeight >= height && rangeWidth >= width;
  const rows = fill ? rangeHeight : height;
  const columns = Math.min(fill ? rangeWidth : width, columnCount - range.left);
  const targets: PasteTarget[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const cell = clip[r % height]?.[c % width];
      if (cell) {
        targets.push({ row: range.top + r, col: range.left + c, cell });
      }
    }
  }
  return {
    targets,
    newRows: Math.max(0, range.top + rows - rowCount),
    droppedColumns: (fill ? rangeWidth : width) > columns,
  };
}
// Stored values pass through only between fields of the same type (and, for links, the same target form).
export function parseClipCell(field: Field, cell: ClipCell): ParsedCell {
  const sameLinks = field.type !== "relation" || cell.target === field.config.target_form_id;
  if (cell.type === field.type && cell.value !== undefined && sameLinks && !(field.config.rating && typeof cell.value !== "number")) {
    return { value: cell.value };
  }
  return parseText(field, cell.text);
}
// Cells that a paste or a clear never writes: files upload separately, and a required field is not cleared.
export function skipsWrite(field: Field, value: unknown) {
  return field.type === "attachment" || (field.required && isEmpty(value));
}
export function clearedValue(field: Field) {
  return field.type === "relation" ? [] : field.type === "boolean" ? false : null;
}
function isEmpty(value: unknown) {
  return value == null || value === "" || value === false || (Array.isArray(value) && !value.length);
}
// Resolves link labels from `resolveRecords` results. The whole cell text is tried first, so names containing commas
// still match; record IDs pass through for the server to check.
export function linkIds(text: string, labels: string[], resolved: Map<string, ResolvedLabel>): { value: string[] } | { error: string } {
  const whole = resolved.get(text.trim());
  if (whole?.record_id && whole.matches === 1) {
    return { value: [whole.record_id] };
  }
  const ids: string[] = [];
  for (const label of labels) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(label)) {
      ids.push(label.toLowerCase());
      continue;
    }
    const match = resolved.get(label);
    if (!match?.record_id || match.matches !== 1) {
      return { error: match && match.matches > 1 ? `“${label}” matches ${match.matches} records.` : `Nothing is named “${label}”.` };
    }
    ids.push(match.record_id);
  }
  return { value: [...new Set(ids)] };
}
export type CellWrite = { row: number; field: Field; value: unknown };
// Merges cell writes into one update per existing record and one create per new row. Cut sources that the paste
// does not overwrite are cleared in the same write.
export function buildWrites(writes: CellWrite[], rows: DataRecord[], clears: { record: DataRecord; field: Field }[] = []): WriteRecords {
  const updates = new Map<string, { record: DataRecord; values: Values }>();
  const creates = new Map<number, Values>();
  for (const { row, field, value } of writes) {
    const record = rows[row];
    if (record) {
      const entry = updates.get(record.id) ?? { record, values: {} };
      entry.values[field.id] = value;
      updates.set(record.id, entry);
    } else {
      creates.set(row, { ...creates.get(row), [field.id]: value });
    }
  }
  for (const { record, field } of clears) {
    const entry = updates.get(record.id) ?? { record, values: {} };
    if (!(field.id in entry.values)) {
      entry.values[field.id] = clearedValue(field);
      updates.set(record.id, entry);
    }
  }
  return {
    updates: [...updates.values()].map(({ record, values }) => ({ record_id: record.id, expected_version: record.version, values })),
    creates: [...creates.entries()].sort(([a], [b]) => a - b).map(([, values]) => ({ values })),
  };
}
export function writeCount(writes: WriteRecords) {
  return (writes.updates?.length ?? 0) + (writes.creates?.length ?? 0);
}
export function readPayload(text: string): ClipPayload | undefined {
  try {
    const payload = JSON.parse(text) as ClipPayload;
    const valid =
      payload?.app === "formsoftware" &&
      typeof payload.form === "string" &&
      typeof payload.token === "string" &&
      Array.isArray(payload.cells) &&
      payload.cells.every((row) => Array.isArray(row) && row.every((cell) => typeof cell?.text === "string"));
    return valid ? payload : undefined;
  } catch {
    return undefined;
  }
}
