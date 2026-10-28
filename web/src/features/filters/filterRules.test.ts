import { describe, expect, it } from "vitest";

import type { Filter } from "../../api/types";
import { field } from "../../testing/fixtures";
import { changeOperator, conditionError, maxRelationChoices, newCondition, operators } from "./filterRules";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owners = field({ id: "owners", type: "relation" });
const filter = (op: Filter["op"], value: unknown, fieldId = "owners"): Filter => ({ field_id: fieldId, op, value });
describe("operators", () => {
  const ops = (type: Parameters<typeof field>[0]["type"]) => operators(field({ id: "f", type })).map((o) => o.value);
  it("offers only empty checks for attachments", () => {
    expect(ops("attachment")).toEqual(["empty", "not_empty"]);
  });
  it("offers any-of and none-of only for relations", () => {
    expect(ops("relation")).toContain("any_of");
    expect(ops("short_text")).not.toContain("any_of");
  });
  it("offers contains for text and comparisons for numbers", () => {
    expect(ops("url")).toContain("contains");
    expect(ops("decimal")).toEqual(expect.arrayContaining(["gt", "gte", "lt", "lte"]));
    expect(ops("boolean")).not.toContain("gt");
  });
});
describe("newCondition", () => {
  it("starts attachments on an empty check and booleans on Yes", () => {
    expect(newCondition(field({ id: "files", type: "attachment" })).op).toBe("empty");
    expect(newCondition(field({ id: "done", type: "boolean" })).value).toBe(true);
  });
});
describe("changeOperator", () => {
  it("converts relation values between single and multiple choice", () => {
    expect(changeOperator(filter("eq", uuid(1)), owners, "any_of").value).toEqual([uuid(1)]);
    expect(changeOperator(filter("any_of", [uuid(1), uuid(2)]), owners, "eq").value).toBe(uuid(1));
  });
  it("clears the value for empty checks and restores a default afterwards", () => {
    expect(changeOperator(filter("eq", uuid(1)), owners, "empty").value).toBeNull();
    const done = field({ id: "done", type: "boolean" });
    expect(changeOperator(filter("empty", null, "done"), done, "eq").value).toBe(true);
  });
});
describe("conditionError", () => {
  it("accepts up to the relation choice limit and rejects more", () => {
    const ids = (count: number) => Array.from({ length: count }, (_, i) => uuid(i + 1));
    expect(conditionError(filter("any_of", ids(maxRelationChoices)), owners)).toBe("");
    expect(conditionError(filter("any_of", ids(maxRelationChoices + 1)), owners)).not.toBe("");
    expect(conditionError(filter("any_of", []), owners)).not.toBe("");
    expect(conditionError(filter("eq", "not-a-uuid"), owners)).not.toBe("");
  });
  it("rejects unknown fields and unsupported operators", () => {
    expect(conditionError(filter("eq", "x"))).toBe("Choose an available field.");
    expect(conditionError(filter("gt", true, "done"), field({ id: "done", type: "boolean" }))).toBe("Choose a supported operator.");
  });
  it("validates typed values", () => {
    const duration = field({ id: "spent", type: "duration" });
    expect(conditionError(filter("gt", "30", "spent"), duration)).toBe("");
    expect(conditionError(filter("gt", "-1", "spent"), duration)).not.toBe("");
    const amount = field({ id: "amount", type: "decimal" });
    expect(conditionError(filter("eq", "12.50", "amount"), amount)).toBe("");
    expect(conditionError(filter("eq", "1e3", "amount"), amount)).not.toBe("");
    const at = field({ id: "at", type: "date_time" });
    expect(conditionError(filter("gt", "2026-10-16T09:00:00Z", "at"), at)).toBe("");
    expect(conditionError(filter("gt", "2026-10-16T09:00:00", "at"), at)).not.toBe("");
  });
  it("requires a value unless the operator is an empty check", () => {
    const notes = field({ id: "notes", type: "short_text" });
    expect(conditionError(filter("contains", "  ", "notes"), notes)).not.toBe("");
    expect(conditionError(filter("empty", null, "notes"), notes)).toBe("");
  });
});
