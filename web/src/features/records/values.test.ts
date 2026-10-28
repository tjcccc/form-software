import { describe, expect, it } from "vitest";

import { field, record, schema } from "../../testing/fixtures";
import { displayValue, formatDuration, machineKey, titleOf } from "./values";

describe("formatDuration", () => {
  it("formats whole minutes as hours and minutes", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(null)).toBe("—");
  });
});
describe("machineKey", () => {
  it("derives a lowercase key that starts with a letter", () => {
    expect(machineKey("  Work Logs! ")).toBe("work_logs");
    expect(machineKey("2026 budget")).toBe("form_2026_budget");
  });
  it("caps the key at 56 characters", () => {
    expect(machineKey("a".repeat(80))).toHaveLength(56);
  });
});
describe("titleOf", () => {
  it("uses the primary name field and falls back for blank titles", () => {
    const tasks = schema([field({ id: "notes", type: "long_text" }), field({ id: "title", key: "name", type: "short_text" })]);
    expect(titleOf(record({ title: "Ship v1" }), tasks)).toBe("Ship v1");
    expect(titleOf(record({ title: "" }), tasks)).toBe("Untitled record");
  });
});
describe("displayValue", () => {
  const targetId = "00000000-0000-4000-8000-000000000002";
  const people = schema([field({ id: "person", key: "name", type: "short_text" })]);
  const owners = field({ id: "owners", type: "relation", config: { target_form_id: targetId } });
  const linked = record({ person: "Ada" }, [], "11111111-2222-4333-8444-555555555555");
  it("shows related record titles, or a short ID when the record is not loaded", () => {
    const catalogs = { [targetId]: { schema: people, records: [linked] } };
    expect(displayValue(owners, [linked.id, "99999999-0000-4000-8000-000000000000"], catalogs)).toBe("Ada, 99999999");
    expect(displayValue(owners, [], catalogs)).toBe("—");
  });
  it("formats empty values, booleans, and ratings", () => {
    expect(displayValue(field({ id: "notes", type: "short_text" }), "", {})).toBe("—");
    expect(displayValue(field({ id: "done", type: "boolean" }), false, {})).toBe("No");
    expect(displayValue(field({ id: "score", type: "integer", config: { rating: { max: 5, icon: "star", color: "ochre" } } }), 3, {})).toBe(
      "3 / 5",
    );
  });
});
