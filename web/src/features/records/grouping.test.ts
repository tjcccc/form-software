import { describe, expect, it } from "vitest";

import { attachment, field, record } from "../../testing/fixtures";
import { groupKey, groupValue } from "./grouping";

// These keys must match push_group in crates/persistence/src/records.rs, or group header counts fall back to zero.
describe("groupValue", () => {
  it("groups relations by their sorted ID set", () => {
    const owners = field({ id: "owners", type: "relation" });
    const a = groupValue(record({ owners: ["b0000000-0000-4000-8000-000000000000", "a0000000-0000-4000-8000-000000000000"] }), owners);
    const b = groupValue(record({ owners: ["a0000000-0000-4000-8000-000000000000", "b0000000-0000-4000-8000-000000000000"] }), owners);
    expect(groupKey(a)).toBe(groupKey(b));
    expect(groupValue(record({}), owners)).toEqual([]);
  });
  it("groups attachments by file count for the field", () => {
    const files = field({ id: "files", type: "attachment" });
    const row = record({}, [attachment("files", "one"), attachment("files", "two"), attachment("other", "three")]);
    expect(groupValue(row, files)).toBe(2);
  });
  it("treats missing and empty scalar values as the same null group", () => {
    const status = field({ id: "status", type: "short_text" });
    expect(groupValue(record({ status: "" }), status)).toBeNull();
    expect(groupValue(record({}), status)).toBeNull();
    expect(groupValue(record({ status: false }), field({ id: "status", type: "boolean" }))).toBe(false);
  });
});
