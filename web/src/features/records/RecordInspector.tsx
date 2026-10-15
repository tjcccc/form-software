import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, FilePlus2, LoaderCircle, Paperclip, Save, Trash2, X } from "lucide-react";
import { api, ApiError, message } from "../../api/client";
import type { Catalogs, DataRecord, Field, FormSchema, Values } from "../../api/types";
import { FieldIcon } from "../../components/Icons";
import { ErrorNotice } from "../../components/Dialog";
import { initialValues, titleOf } from "./values";
import { RelationPicker } from "./RelationPicker";
export function RecordInspector({
  schema,
  initial,
  catalogs,
  onClose,
  onSaved,
  onArchived,
}: {
  schema: FormSchema;
  initial: DataRecord | null;
  catalogs: Catalogs;
  onClose: () => void;
  onSaved: (record: DataRecord) => void;
  onArchived: () => void;
}) {
  const [record, setRecord] = useState(initial);
  const [values, setValues] = useState<Values>(() => initial?.values ?? initialValues(schema));
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial?.values ?? initialValues(schema)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<DataRecord>();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(values) !== baseline;
  const fields = schema.fields.filter((f) => !f.archived_at);
  function close() {
    if (busy) {
      return;
    }
    if (dirty) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        if (dirty) {
          setConfirmClose(true);
        } else if (!busy) {
          onClose();
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
      }
    };
    const navigate = (event: Event) => {
      if (busy || (dirty && !window.confirm("Discard unsaved record changes?"))) {
        event.preventDefault();
      }
    };
    window.addEventListener("formsw:before-navigate", navigate);
    document.addEventListener("keydown", key);
    window.addEventListener("beforeunload", unload);
    return () => {
      document.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("formsw:before-navigate", navigate);
    };
  }, [dirty, busy, onClose]);
  function accept(next: DataRecord) {
    setRecord(next);
    setValues(next.values);
    setBaseline(JSON.stringify(next.values));
    setConflict(undefined);
    setIssues({});
    setError("");
    onSaved(next);
  }
  function fail(e: unknown) {
    setError(message(e));
    if (e instanceof ApiError) {
      setIssues(Object.fromEntries(e.body.issues.filter((i) => i.field_id).map((i) => [i.field_id!, i.message])));
      if (e.body.current) {
        setConflict(e.body.current as DataRecord);
      }
    }
  }
  async function save() {
    if (busy || conflict) {
      return;
    }
    setBusy(true);
    setError("");
    setIssues({});
    setSaved(false);
    try {
      const next = record
        ? await api.updateRecord(
            record,
            Object.fromEntries(fields.filter((f) => f.type !== "attachment").map((f) => [f.id, values[f.id] ?? null])),
          )
        : await api.createRecord(schema.form.id, values);
      accept(next);
      setSaved(true);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function upload(field: Field, file?: File) {
    if (!record || !file) {
      return;
    }
    if (dirty) {
      setError("Save your changes before uploading a file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Files must be 10 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      accept(await api.upload(record, field.id, file));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function removeFile(id: string) {
    if (!record) {
      return;
    }
    if (dirty) {
      setError("Save your changes before removing a file.");
      return;
    }
    setBusy(true);
    try {
      accept(await api.removeAttachment(record, id));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!record) {
      return;
    }
    setBusy(true);
    try {
      await api.archiveRecord(record);
      onArchived();
    } catch (e) {
      fail(e);
      setConfirmArchive(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="record-inspector" aria-label={record ? "Record inspector" : "New record"}>
      <header className="inspector-heading">
        <span className="eyebrow">{record ? `RECORD / ${record.id.slice(0, 8).toUpperCase()}` : "NEW RECORD"}</span>
        <button className="icon-button" aria-label="Close inspector" onClick={close}>
          <X size={17} />
        </button>
      </header>
      <form
        ref={formRef}
        className="inspector-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="inspector-scroll">
          <div className="inspector-title">
            <span className="inspector-form-name">{schema.form.name}</span>
            <h2>{record ? titleOf(record, schema) : "A new entry."}</h2>
            <p>
              {record
                ? `Created ${new Date(record.created_at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}`
                : "Give this moment a little structure."}
            </p>
          </div>
          {error && <ErrorNotice>{error}</ErrorNotice>}
          {conflict && (
            <div className="conflict-box">
              <strong>A newer version is available.</strong>
              <p>Your edits are kept here. Review the latest record before applying them.</p>
              <details>
                <summary>Compare with the latest version</summary>
                {fields
                  .filter((f) => f.type !== "attachment")
                  .map((f) => (
                    <div className="conflict-field" key={f.id}>
                      <strong>{f.name}</strong>
                      <span>{JSON.stringify(conflict.values[f.id] ?? null)}</span>
                    </div>
                  ))}
              </details>
              <div className="button-row">
                <button type="button" className="button small" onClick={() => accept(conflict)}>
                  Load latest
                </button>
                <button
                  type="button"
                  className="button small"
                  onClick={() => {
                    setRecord(conflict);
                    setBaseline(JSON.stringify(conflict.values));
                    setConflict(undefined);
                    setError("");
                  }}
                >
                  Keep my edits for review
                </button>
              </div>
            </div>
          )}
          <fieldset disabled={busy || !!conflict} className="record-fields">
            {fields.map((field) => (
              <div className={`field-group ${issues[field.id] ? "has-error" : ""}`} key={field.id}>
                <label htmlFor={`field-${field.id}`}>
                  <FieldIcon type={field.type} />
                  {field.name}
                  {field.required && <span className="required-mark">*</span>}
                </label>
                {field.type === "attachment" ? (
                  <div className="attachment-editor">
                    {record?.attachments
                      .filter((a) => a.field_id === field.id)
                      .map((file) => (
                        <div className="attachment-file" key={file.id}>
                          <Paperclip size={13} />
                          <a href={`/api/v1/attachments/${file.id}`} target="_blank" rel="noreferrer">
                            {file.filename}
                            <ArrowUpRight size={12} />
                          </a>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Remove ${file.filename}`}
                            onClick={() => {
                              if (window.confirm(`Remove attachment “${file.filename}”?`)) {
                                void removeFile(file.id);
                              }
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    {record ? (
                      <label className="file-upload">
                        <FilePlus2 size={15} />
                        <span>
                          Attach a file <small>up to 10 MB</small>
                        </span>
                        <input
                          type="file"
                          aria-label={`Upload ${field.name}`}
                          onChange={(event) => {
                            void upload(field, event.target.files?.[0]);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    ) : (
                      <p className="field-hint">Save this record to attach files.</p>
                    )}
                  </div>
                ) : field.type === "relation" ? (
                  <RelationPicker
                    field={field}
                    value={values[field.id]}
                    catalog={catalogs[field.config.target_form_id ?? ""]}
                    onChange={(value) => {
                      setValues((old) => ({ ...old, [field.id]: value }));
                      setSaved(false);
                    }}
                  />
                ) : (
                  <FieldEditor
                    field={field}
                    value={values[field.id]}
                    autoFocus={!record && field.key === "name"}
                    onChange={(value) => {
                      setValues((old) => ({ ...old, [field.id]: value }));
                      setSaved(false);
                    }}
                  />
                )}
                {issues[field.id] && (
                  <span className="field-error" role="alert">
                    {issues[field.id]}
                  </span>
                )}
              </div>
            ))}
          </fieldset>
          {record && (
            <div className="record-metadata">
              <span>Last edited</span>
              <span>{new Date(record.updated_at).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}</span>
              <span>Version</span>
              <span>{String(record.version).padStart(2, "0")}</span>
            </div>
          )}
        </div>
        <footer className="inspector-footer">
          {confirmArchive ? (
            <div className="inline-confirm">
              <span>Archive this record?</span>
              <button type="button" className="text-button" onClick={() => setConfirmArchive(false)}>
                Cancel
              </button>
              <button type="button" className="button danger small" disabled={busy} onClick={() => void archive()}>
                Archive
              </button>
            </div>
          ) : confirmClose ? (
            <div className="inline-confirm">
              <span>Discard unsaved changes?</span>
              <button type="button" className="text-button" onClick={() => setConfirmClose(false)}>
                Keep editing
              </button>
              <button type="button" className="button small" onClick={onClose}>
                Discard
              </button>
            </div>
          ) : (
            <>
              <div className="inspector-save-state">
                {record && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Archive record"
                    disabled={busy}
                    onClick={() => setConfirmArchive(true)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                <span>
                  {dirty ? (
                    "Unsaved changes"
                  ) : saved ? (
                    <>
                      <Check size={12} /> Saved
                    </>
                  ) : record ? (
                    "All changes saved"
                  ) : (
                    "Ready to create"
                  )}
                </span>
              </div>
              <button className="button primary" type="submit" disabled={busy || !!conflict || (!!record && !dirty)}>
                {busy ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}
                {record ? "Save changes" : "Create record"}
              </button>
            </>
          )}
        </footer>
      </form>
    </aside>
  );
}
function FieldEditor({
  field,
  value,
  onChange,
  autoFocus,
}: {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  autoFocus: boolean;
}) {
  const id = `field-${field.id}`;
  if (field.type === "boolean") {
    return (
      <label className="checkbox-control">
        <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span>{value ? "Enabled" : "Disabled"}</span>
      </label>
    );
  }
  if (field.type === "long_text") {
    return (
      <textarea
        id={id}
        rows={4}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="Add a note…"
      />
    );
  }
  const type =
    field.type === "date"
      ? "date"
      : field.type === "date_time"
        ? "datetime-local"
        : field.type === "url"
          ? "url"
          : ["integer", "decimal", "duration"].includes(field.type)
            ? "number"
            : "text";
  let display = value == null ? "" : String(value);
  if (field.type === "date_time" && display) {
    const date = new Date(display);
    display = Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  return (
    <div className="input-with-unit">
      <input
        id={id}
        type={type}
        autoFocus={autoFocus}
        value={display}
        required={field.required}
        step={field.type === "decimal" ? "any" : 1}
        min={field.type === "duration" ? 0 : undefined}
        maxLength={field.type === "short_text" ? 500 : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(
            raw === ""
              ? null
              : field.type === "integer" || field.type === "duration"
                ? Number(raw)
                : field.type === "date_time"
                  ? new Date(raw).toISOString()
                  : raw,
          );
        }}
        placeholder={field.type === "duration" ? "0" : field.type === "url" ? "https://" : "Enter a value…"}
      />
      {field.type === "duration" && <span className="input-unit">minutes</span>}
    </div>
  );
}
