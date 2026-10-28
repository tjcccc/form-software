import type { DataRecord, Values, WriteRecords, WrittenRecords } from "../../api/types";

// One record's state before and after a grid action. `null` means archived (or not yet created); `version` is the
// record's current version, which the next undo or redo expects, so a record changed elsewhere is never overwritten.
export type RecordChange = { recordId: string; version: number; before: Values | null; after: Values | null };
export type HistoryEntry = { label: string; changes: RecordChange[] };
export type Direction = "undo" | "redo";
export const maxHistory = 50;

function pick(values: Values, keys: string[], empty: (fieldId: string) => unknown): Values {
  return Object.fromEntries(keys.map((key) => [key, key in values ? values[key] : empty(key)]));
}
// Records a batch write. Updates keep only the fields the write touched, read from the records as they were loaded.
export function changesFromWrite(
  loaded: DataRecord[],
  writes: WriteRecords,
  written: WrittenRecords,
  empty: (fieldId: string) => unknown = () => null,
): RecordChange[] {
  const byId = new Map(loaded.map((r) => [r.id, r]));
  const touched = new Map((writes.updates ?? []).map((u) => [u.record_id, Object.keys(u.values)]));
  return [
    ...written.updated.flatMap((record) => {
      const before = byId.get(record.id);
      const keys = touched.get(record.id) ?? [];
      return before
        ? [
            {
              recordId: record.id,
              version: record.version,
              before: pick(before.values, keys, empty),
              after: pick(record.values, keys, empty),
            },
          ]
        : [];
    }),
    ...written.created.map((record) => ({ recordId: record.id, version: record.version, before: null, after: {} })),
    ...written.archived.map((record) => ({ recordId: record.id, version: record.version, before: {}, after: null })),
    ...written.restored.map((record) => ({ recordId: record.id, version: record.version, before: null, after: {} })),
  ];
}
// Records a single-record save (an inline cell edit or a record editor save), keeping only the given fields whose
// value the save changed; an unchanged save records nothing.
export function changesFromSave(
  before: DataRecord,
  after: DataRecord,
  keys: string[],
  empty: (fieldId: string) => unknown = () => null,
): RecordChange[] {
  const changed = keys.filter((key) => {
    const was = pick(before.values, [key], empty)[key];
    const is = pick(after.values, [key], empty)[key];
    return JSON.stringify(was) !== JSON.stringify(is);
  });
  return changed.length
    ? [
        {
          recordId: after.id,
          version: after.version,
          before: pick(before.values, changed, empty),
          after: pick(after.values, changed, empty),
        },
      ]
    : [];
}
// The write that moves every record of the entry to its earlier (undo) or later (redo) state. Restoring brings a
// record back as it was archived, so created and archived records carry no values of their own.
export function reversal(entry: HistoryEntry, direction: Direction): WriteRecords {
  const writes: Required<WriteRecords> = { updates: [], creates: [], archives: [], restores: [] };
  for (const change of entry.changes) {
    const from = direction === "undo" ? change.after : change.before;
    const to = direction === "undo" ? change.before : change.after;
    const target = { record_id: change.recordId, expected_version: change.version };
    if (from && to) {
      writes.updates.push({ ...target, values: to });
    } else if (from) {
      writes.archives.push(target);
    } else if (to) {
      writes.restores.push(target);
    }
  }
  return writes;
}
// The same entry with the versions the reversal produced, ready for the opposite stack.
export function withVersions(entry: HistoryEntry, written: WrittenRecords): HistoryEntry {
  const versions = new Map<string, number>([
    ...written.updated.map((r) => [r.id, r.version] as const),
    ...written.restored.map((r) => [r.id, r.version] as const),
    ...written.archived.map((r) => [r.id, r.version] as const),
  ]);
  return { ...entry, changes: entry.changes.map((c) => ({ ...c, version: versions.get(c.recordId) ?? c.version })) };
}
export function push(stack: HistoryEntry[], entry: HistoryEntry) {
  return entry.changes.length ? [...stack, entry].slice(-maxHistory) : stack;
}
