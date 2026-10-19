import type { DataRecord, Field } from "../../api/types";
import { relationIds } from "./values";
export function groupValue(record: DataRecord, field: Field): unknown {
  if (field.type === "relation") {
    return relationIds(record.values[field.id]).sort();
  }
  if (field.type === "attachment") {
    return record.attachments.filter((a) => a.field_id === field.id).length;
  }
  const value = record.values[field.id];
  return value == null || value === "" ? null : value;
}
export function groupKey(value: unknown) {
  return JSON.stringify(value);
}
