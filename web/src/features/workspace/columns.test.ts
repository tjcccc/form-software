import { describe, expect, it } from "vitest";

import type { ViewConfig } from "../../api/types";
import { field, schema } from "../../testing/fixtures";
import { clampColumnWidth, columnLayouts, orderedFields, visibleFields, withColumnWidth } from "./columns";

const name = field({ id: "name", key: "name", type: "short_text" });
const notes = field({ id: "notes", type: "long_text" });
const due = field({ id: "due", type: "date" });
const archived = field({ id: "old", type: "short_text", archived_at: "2026-10-01T00:00:00Z" });
const tasks = schema([name, notes, due, archived]);
const view = (columns: ViewConfig["columns"]): ViewConfig => ({ columns, filters: [] });
describe("clampColumnWidth", () => {
  it("rounds and clamps to the server's 100–800px range", () => {
    expect(clampColumnWidth(99.4)).toBe(100);
    expect(clampColumnWidth(100.4)).toBe(100);
    expect(clampColumnWidth(800.4)).toBe(800);
    expect(clampColumnWidth(801)).toBe(800);
  });
});
describe("column layouts", () => {
  it("puts configured columns first, then other active fields, skipping archived ones", () => {
    const fields = orderedFields(tasks, view([{ field_id: "due", hidden: false, width: 200 }]));
    expect(fields.map((f) => f.id)).toEqual(["due", "name", "notes"]);
  });
  it("defaults unconfigured columns to visible with type-based widths", () => {
    expect(columnLayouts(tasks, view([]))).toEqual([
      { field_id: "name", hidden: false, width: 350 },
      { field_id: "notes", hidden: false, width: 320 },
      { field_id: "due", hidden: false, width: 156 },
    ]);
  });
  it("respects explicit hidden flags", () => {
    expect(visibleFields(tasks, view([{ field_id: "notes", hidden: true, width: 320 }])).map((f) => f.id)).toEqual(["name", "due"]);
  });
  it("materializes implicit layouts when one width changes, keeping order and other settings", () => {
    const next = withColumnWidth(tasks, view([{ field_id: "notes", hidden: true, width: 300 }]), "due", 240);
    expect(next.columns).toEqual([
      { field_id: "notes", hidden: true, width: 300 },
      { field_id: "name", hidden: false, width: 350 },
      { field_id: "due", hidden: false, width: 240 },
    ]);
  });
});
