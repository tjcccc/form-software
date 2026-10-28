import type { DataRecord, RecordPage } from "../../api/types";
import { groupKey } from "../records/grouping";

export const loadChunk = 500;
export const maxLoadedRecords = 5000;
type RecordGroup = NonNullable<RecordPage["groups"]>[number];
export type LoadedRecords = RecordPage & { groups: RecordGroup[]; truncated: boolean };
// Pages through a whole view. Offset cursors can shift while inserts land, so records are deduplicated by ID, and
// each page only reports the groups it contains, so group counts are merged across pages.
export async function loadRecords(
  fetchPage: (cursor: number, limit: number) => Promise<RecordPage>,
  signal: AbortSignal,
  onFirst?: (page: LoadedRecords) => void,
): Promise<LoadedRecords> {
  const records = new Map<string, DataRecord>();
  const groups = new Map<string, RecordGroup>();
  let cursor: number | null = 0;
  let total = 0;
  while (cursor != null && records.size < maxLoadedRecords) {
    const page = await fetchPage(cursor, Math.min(loadChunk, maxLoadedRecords - records.size));
    if (signal.aborted) {
      throw new DOMException("The record load was replaced.", "AbortError");
    }
    for (const record of page.records) {
      records.set(record.id, record);
    }
    for (const group of page.groups ?? []) {
      groups.set(groupKey(group.value), group);
    }
    total = page.total;
    const first = cursor === 0;
    cursor = page.records.length ? (page.next_cursor ?? null) : null;
    if (first && cursor != null) {
      onFirst?.(result());
    }
  }
  return result();
  function result(): LoadedRecords {
    const loaded = [...records.values()];
    return { records: loaded, groups: [...groups.values()], total, next_cursor: null, truncated: loaded.length < total };
  }
}
