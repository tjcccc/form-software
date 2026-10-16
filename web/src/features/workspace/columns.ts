import type { Field, FormSchema, ViewConfig } from "../../api/types";
export function orderedFields(schema: FormSchema, config: ViewConfig) {
  const active = schema.fields.filter((f) => !f.archived_at);
  const configured = config.columns.map((c) => active.find((f) => f.id === c.field_id)).filter((f): f is Field => !!f);
  return [...configured, ...active.filter((f) => !configured.some((c) => c.id === f.id))];
}
export function columnLayouts(schema: FormSchema, config: ViewConfig) {
  return orderedFields(schema, config).map(
    (f) =>
      config.columns.find((c) => c.field_id === f.id) ?? {
        field_id: f.id,
        hidden: false,
        width: f.key === "name" ? 350 : f.type === "long_text" ? 320 : f.type === "duration" ? 118 : 156,
      },
  );
}
export function visibleFields(schema: FormSchema, config: ViewConfig) {
  const columns = columnLayouts(schema, config);
  return orderedFields(schema, config).filter((f) => !columns.find((c) => c.field_id === f.id)?.hidden);
}
export function withColumnWidth(schema: FormSchema, config: ViewConfig, fieldId: string, width: number): ViewConfig {
  return { ...config, columns: columnLayouts(schema, config).map((c) => (c.field_id === fieldId ? { ...c, width } : c)) };
}
