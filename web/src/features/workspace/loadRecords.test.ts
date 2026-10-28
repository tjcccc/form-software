import { describe, expect, it, vi } from "vitest";

import type { RecordPage } from "../../api/types";
import { record } from "../../testing/fixtures";
import { loadRecords, maxLoadedRecords } from "./loadRecords";

const row = (n: number) => record({ n }, [], `r${n}`);
function pages(total: number, shift = 0) {
  return vi.fn(async (cursor: number, limit: number): Promise<RecordPage> => {
    // `shift` simulates a record inserted ahead of the cursor between requests.
    const start = cursor === 0 ? 0 : cursor - shift;
    const end = Math.min(start + limit, total);
    const records = Array.from({ length: Math.max(0, end - start) }, (_, i) => row(start + i));
    return { records, groups: [], total, next_cursor: end < total ? cursor + records.length : null };
  });
}
describe("loadRecords", () => {
  it("pages through the whole view and reports the first page early", async () => {
    const fetch = pages(1200);
    const first = vi.fn();
    const loaded = await loadRecords(fetch, new AbortController().signal, first);
    expect(loaded.records).toHaveLength(1200);
    expect(loaded.truncated).toBe(false);
    expect(fetch.mock.calls.map(([cursor]) => cursor)).toEqual([0, 500, 1000]);
    expect(first).toHaveBeenCalledOnce();
    expect(first.mock.calls[0][0].records).toHaveLength(500);
  });
  it("does not report a single page early", async () => {
    const first = vi.fn();
    await loadRecords(pages(30), new AbortController().signal, first);
    expect(first).not.toHaveBeenCalled();
  });
  it("deduplicates records repeated when pages shift", async () => {
    const loaded = await loadRecords(pages(700, 2), new AbortController().signal);
    expect(new Set(loaded.records.map((r) => r.id)).size).toBe(loaded.records.length);
  });
  it("stops at the load cap and marks the view as truncated", async () => {
    const fetch = pages(maxLoadedRecords + 1);
    const loaded = await loadRecords(fetch, new AbortController().signal);
    expect(loaded.records).toHaveLength(maxLoadedRecords);
    expect(loaded.truncated).toBe(true);
  });
  it("merges group counts reported by different pages", async () => {
    const fetch = vi.fn(async (cursor: number): Promise<RecordPage> =>
      cursor === 0
        ? { records: [row(0)], groups: [{ value: "a", count: 1 }], total: 2, next_cursor: 1 }
        : { records: [row(1)], groups: [{ value: "b", count: 1 }], total: 2, next_cursor: null },
    );
    const loaded = await loadRecords(fetch, new AbortController().signal);
    expect(loaded.groups.map((g) => g.value)).toEqual(["a", "b"]);
  });
  it("stops when the load is replaced", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async (cursor: number, limit: number) => {
      controller.abort();
      return pages(1200)(cursor, limit);
    });
    await expect(loadRecords(fetch, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
