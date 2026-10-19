import type { Field, Filter } from "../../api/types";
export const emptyCheck = (op: Filter["op"]) => op === "empty" || op === "not_empty";
export const multipleChoice = (op: Filter["op"]) => op === "any_of" || op === "none_of";
export function operators(field?: Field): { value: Filter["op"]; label: string }[] {
  const empty: { value: Filter["op"]; label: string }[] = [
    { value: "empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" },
  ];
  if (field?.type === "attachment") {
    return empty;
  }
  const base: { value: Filter["op"]; label: string }[] = [
    { value: "eq", label: "is" },
    { value: "ne", label: "is not" },
  ];
  if (field?.type === "relation") {
    return [...base, { value: "any_of", label: "is any of" }, { value: "none_of", label: "is none of" }, ...empty];
  }
  if (field?.type === "boolean") {
    return [...base, ...empty];
  }
  if (["short_text", "long_text", "url"].includes(field?.type ?? "")) {
    return [...base, { value: "contains", label: "contains" }, ...empty];
  }
  return [
    ...base,
    { value: "gt", label: "is greater than" },
    { value: "gte", label: "is at least" },
    { value: "lt", label: "is less than" },
    { value: "lte", label: "is at most" },
    ...empty,
  ];
}
export function newCondition(field: Field): Filter {
  return { field_id: field.id, op: field.type === "attachment" ? "empty" : "eq", value: field.type === "boolean" ? true : "" };
}
export function changeOperator(filter: Filter, field: Field | undefined, op: Filter["op"]): Filter {
  let value = filter.value;
  if (emptyCheck(op)) {
    value = null;
  } else if (field?.type === "relation") {
    if (multipleChoice(op)) {
      value = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
    } else {
      value = Array.isArray(value) ? (value[0] ?? "") : typeof value === "string" ? value : "";
    }
  } else if (emptyCheck(filter.op)) {
    value = field?.type === "boolean" ? true : "";
  }
  return { ...filter, op, value };
}
export function conditionError(filter: Filter, field?: Field) {
  if (!field) {
    return "Choose an available field.";
  }
  if (!operators(field).some((op) => op.value === filter.op)) {
    return "Choose a supported operator.";
  }
  if (emptyCheck(filter.op)) {
    return "";
  }
  if (field.type === "relation") {
    const ids = multipleChoice(filter.op) ? filter.value : [filter.value];
    return Array.isArray(ids) &&
      ids.length > 0 &&
      ids.length <= 100 &&
      ids.every((id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      ? ""
      : "Select at least one related record.";
  }
  if (filter.value == null || String(filter.value).trim() === "") {
    return "Enter a value or use an empty check.";
  }
  if (field.type === "boolean") {
    return typeof filter.value === "boolean" ? "" : "Choose Yes or No.";
  }
  if (["integer", "duration"].includes(field.type)) {
    const number = Number(filter.value);
    if (!Number.isSafeInteger(number) || (field.type === "duration" && number < 0)) {
      return "Enter a valid whole number.";
    }
  }
  if (field.type === "decimal" && (String(filter.value).length > 64 || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(filter.value)))) {
    return "Enter an exact decimal value.";
  }
  if (
    field.type === "date_time" &&
    (!/([zZ]|[+-]\d{2}:\d{2})$/.test(String(filter.value)) || Number.isNaN(Date.parse(String(filter.value))))
  ) {
    return "Include a timezone, for example 2026-10-16T09:00:00Z.";
  }
  return "";
}
