import type { Catalogs, DataRecord, Field, FormSchema, Values } from "../../api/types";
export function titleOf(record: DataRecord, schema: FormSchema) {
  const primary = schema.fields.find((f) => f.key === "name") ?? schema.fields[0];
  const value = primary ? record.values[primary.id] : null;
  return typeof value === "string" && value ? value : "Untitled record";
}
export function relationIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
export function formatDuration(value: unknown) {
  if (typeof value !== "number") {
    return "—";
  }
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours ? `${hours}h` : ""}${hours && minutes ? " " : ""}${minutes || !hours ? `${minutes}m` : ""}`;
}
export function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "—";
  }
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en", { month: "short", day: "2-digit", year: "numeric" });
}
export function displayValue(field: Field, value: unknown, catalogs: Catalogs): string {
  if (value == null || value === "") {
    return "—";
  }
  if (field.type === "relation") {
    const catalog = catalogs[field.config.target_form_id ?? ""];
    return (
      relationIds(value)
        .map((id) => {
          const record = catalog?.records.find((r) => r.id === id);
          return record && catalog ? titleOf(record, catalog.schema) : id.slice(0, 8);
        })
        .join(", ") || "—"
    );
  }
  if (field.type === "duration") {
    return formatDuration(value);
  }
  if (field.type === "date") {
    return formatDate(value);
  }
  if (field.type === "date_time") {
    return typeof value === "string" ? new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }) : "—";
  }
  if (field.type === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}
export function initialValues(schema: FormSchema): Values {
  return Object.fromEntries(
    schema.fields
      .filter((f) => !f.archived_at && f.type !== "attachment")
      .map((f) => [
        f.id,
        f.type === "date"
          ? new Date().toLocaleDateString("en-CA")
          : f.type === "boolean"
            ? f.key === "enabled"
            : f.type === "relation"
              ? []
              : null,
      ]),
  );
}
export function machineKey(name: string) {
  const key = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 56);
  return /^[a-z]/.test(key) ? key : `form_${key}`;
}
