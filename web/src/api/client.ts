import type {
  ApiErrorBody,
  CreateField,
  CreateForm,
  DataRecord,
  Field,
  Form,
  FormSchema,
  ImportPreview,
  ImportRequest,
  RecordPage,
  Session,
  UpdateField,
  Values,
  View,
  ViewConfig,
} from "./types";
export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.body = body;
  }
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({
      code: "request",
      message: response.status === 413 ? "This file is too large." : `Request failed (${response.status}).`,
      issues: [],
      current: null,
    }));
    if (response.status === 401) {
      window.dispatchEvent(new Event("formsw:unauthorized"));
    }
    throw new ApiError(response.status, body);
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
export const api = {
  session: () => request<Session>("/workspaces/current"),
  login: async (username: string, password: string) => {
    const result = await request<{ session: Session }>("/auth/login", json("POST", { username, password }));
    return result.session;
  },
  logout: () => request<void>("/auth/session", { method: "DELETE" }),
  forms: (signal?: AbortSignal) => request<Form[]>("/forms", { signal }),
  createForm: (input: CreateForm) => request<FormSchema>("/forms", json("POST", input)),
  updateForm: (id: string, input: { name?: string; description?: string; archived?: boolean }) =>
    request<Form>(`/forms/${id}`, json("PATCH", input)),
  schema: (id: string, signal?: AbortSignal) => request<FormSchema>(`/forms/${id}/schema`, { signal }),
  createField: (id: string, input: CreateField) => request<Field>(`/forms/${id}/fields`, json("POST", input)),
  duplicateField: (id: string) => request<Field>(`/fields/${id}/duplicate`, { method: "POST" }),
  updateField: (id: string, input: UpdateField) => request<Field>(`/fields/${id}`, json("PATCH", input)),
  records: (id: string, params: URLSearchParams = new URLSearchParams(), signal?: AbortSignal) =>
    request<RecordPage>(`/forms/${id}/records?${params}`, { signal }),
  record: (id: string, signal?: AbortSignal) => request<DataRecord>(`/records/${id}`, { signal }),
  createRecord: (id: string, values: Values) => request<DataRecord>(`/forms/${id}/records`, json("POST", { values })),
  insertRecord: (anchor: DataRecord, values: Values, before: boolean) =>
    request<DataRecord>(`/records/${anchor.id}/insert`, json("POST", { values, before, expected_version: anchor.version })),
  duplicateRecord: (record: DataRecord) =>
    request<DataRecord>(`/records/${record.id}/duplicate`, json("POST", { expected_version: record.version })),
  updateRecord: (record: DataRecord, values: Values) =>
    request<DataRecord>(`/records/${record.id}`, json("PATCH", { values, expected_version: record.version })),
  archiveRecord: (record: DataRecord) => request<void>(`/records/${record.id}`, json("DELETE", { expected_version: record.version })),
  views: (id: string, signal?: AbortSignal) => request<View[]>(`/forms/${id}/views`, { signal }),
  saveView: (id: string, name: string, config: ViewConfig) => request<View>(`/forms/${id}/views`, json("POST", { name, config })),
  updateColumnWidth: (viewId: string, fieldId: string, width: number) =>
    request<View>(`/views/${viewId}/columns/${fieldId}/width`, json("PATCH", { width })),
  upload: (record: DataRecord, fieldId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<DataRecord>(`/records/${record.id}/attachments?field_id=${fieldId}&expected_version=${record.version}`, {
      method: "POST",
      body,
    });
  },
  removeAttachment: (record: DataRecord, id: string) =>
    request<DataRecord>(`/attachments/${id}`, json("DELETE", { expected_version: record.version })),
  previewImport: (input: ImportRequest) => request<ImportPreview>("/imports/csv/preview", json("POST", input)),
  commitImport: (input: ImportRequest) => request<{ created: number }>("/imports/csv/commit", json("POST", input)),
};
export function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
export function aborted(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
