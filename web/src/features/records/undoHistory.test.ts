import { describe, expect, it } from "vitest";

import type { WrittenRecords } from "../../api/types";
import { record } from "../../testing/fixtures";
import { changesFromWrite, type HistoryEntry, maxHistory, push, reversal, withVersions } from "./undoHistory";

const written = (overrides: Partial<WrittenRecords>): WrittenRecords => ({
  updated: [],
  created: [],
  archived: [],
  restored: [],
  ...overrides,
});
describe("changesFromWrite", () => {
  it("keeps only touched fields, filling fields missing before the write with their empty value", () => {
    const before = record({ name: "Old", note: "keep" }, [], "a");
    const after = { ...record({ name: "New", note: "keep", links: ["x"] }, [], "a"), version: 2 };
    const changes = changesFromWrite(
      [before],
      { updates: [{ record_id: "a", expected_version: 1, values: { name: "New", links: ["x"] } }] },
      written({ updated: [after] }),
      (id) => (id === "links" ? [] : null),
    );
    expect(changes).toEqual([{ recordId: "a", version: 2, before: { name: "Old", links: [] }, after: { name: "New", links: ["x"] } }]);
  });
  it("records creates as coming into existence and archives as leaving it", () => {
    const changes = changesFromWrite(
      [],
      {},
      written({ created: [{ ...record({}, [], "c"), version: 1 }], archived: [{ id: "d", version: 4 }] }),
    );
    expect(changes).toEqual([
      { recordId: "c", version: 1, before: null, after: {} },
      { recordId: "d", version: 4, before: {}, after: null },
    ]);
  });
});
describe("reversal", () => {
  const entry: HistoryEntry = {
    label: "paste",
    changes: [
      { recordId: "a", version: 2, before: { name: "Old" }, after: { name: "New" } },
      { recordId: "c", version: 1, before: null, after: {} },
      { recordId: "d", version: 4, before: {}, after: null },
    ],
  };
  it("undo restores earlier values, archives created records, and restores archived ones", () => {
    expect(reversal(entry, "undo")).toEqual({
      updates: [{ record_id: "a", expected_version: 2, values: { name: "Old" } }],
      creates: [],
      archives: [{ record_id: "c", expected_version: 1 }],
      restores: [{ record_id: "d", expected_version: 4 }],
    });
  });
  it("redo reapplies later values and reverses the archive and restore", () => {
    expect(reversal(entry, "redo")).toEqual({
      updates: [{ record_id: "a", expected_version: 2, values: { name: "New" } }],
      creates: [],
      archives: [{ record_id: "d", expected_version: 4 }],
      restores: [{ record_id: "c", expected_version: 1 }],
    });
  });
  it("carries the versions a replay produced, so the next replay expects them", () => {
    const moved = withVersions(
      entry,
      written({
        updated: [{ ...record({}, [], "a"), version: 3 }],
        archived: [{ id: "c", version: 2 }],
        restored: [{ ...record({}, [], "d"), version: 5 }],
      }),
    );
    expect(moved.changes.map((c) => c.version)).toEqual([3, 2, 5]);
  });
});
describe("consecutive steps on one record", () => {
  it("the older step expects the version the newer step's undo produced", () => {
    const paste: HistoryEntry = { label: "paste", changes: [{ recordId: "a", version: 2, before: { n: "1" }, after: { n: "2" } }] };
    const edit: HistoryEntry = { label: "edit", changes: [{ recordId: "a", version: 3, before: { n: "2" }, after: { n: "3" } }] };
    expect(reversal(edit, "undo").updates?.[0].expected_version).toBe(3);
    const undone = written({ updated: [{ ...record({ n: "2" }, [], "a"), version: 4 }] });
    expect(reversal(withVersions(paste, undone), "undo").updates?.[0]).toEqual({ record_id: "a", expected_version: 4, values: { n: "1" } });
  });
});
describe("push", () => {
  it("drops empty steps and keeps only the latest steps", () => {
    const step = (n: number): HistoryEntry => ({ label: String(n), changes: [{ recordId: "a", version: n, before: {}, after: {} }] });
    expect(push([], { label: "none", changes: [] })).toEqual([]);
    const full = Array.from({ length: maxHistory }, (_, i) => step(i));
    expect(push(full, step(99)).map((e) => e.label)).toHaveLength(maxHistory);
    expect(push(full, step(99)).at(-1)?.label).toBe("99");
  });
});
