import type { Attachment, DataRecord, Field, FormSchema } from "../api/types";
export const formId = "00000000-0000-4000-8000-000000000001";
export function field(overrides: Partial<Field> & Pick<Field, "id" | "type">): Field {
  return { form_id: formId, key: overrides.id, name: overrides.id, position: 0, required: false, config: {}, ...overrides };
}
export function record(
  values: Record<string, unknown>,
  attachments: Attachment[] = [],
  id = "00000000-0000-4000-8000-0000000000aa",
): DataRecord {
  return {
    id,
    form_id: formId,
    version: 1,
    values,
    attachments,
    created_at: "2026-10-28T00:00:00Z",
    updated_at: "2026-10-28T00:00:00Z",
    created_by: "user",
    updated_by: "user",
  };
}
export function attachment(fieldId: string, id: string): Attachment {
  return { id, field_id: fieldId, record_id: "record", filename: `${id}.txt`, content_type: "text/plain", sha256: "", size_bytes: 1 };
}
export function schema(fields: Field[]): FormSchema {
  return {
    form: {
      id: formId,
      workspace_id: "workspace",
      key: "tasks",
      name: "Tasks",
      description: "",
      icon: "",
      kind: "standard",
      record_count: 0,
    },
    fields,
  };
}
