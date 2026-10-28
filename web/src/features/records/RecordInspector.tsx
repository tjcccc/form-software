import { ArrowUpRight, Check, FilePlus2, LoaderCircle, Paperclip, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, ApiError, message } from "../../api/client";
import type { Catalogs, DataRecord, Field, FormSchema, Values } from "../../api/types";
import { ErrorNotice } from "../../components/Dialog";
import { FieldIcon } from "../../components/Icons";
import { FieldEditor } from "./FieldEditor";
import { emptyValue } from "./gridPaste";
import { RelationPicker } from "./RelationPicker";
import { changesFromSave, type HistoryEntry } from "./undoHistory";
import { initialValues, titleOf } from "./values";
export function RecordInspector({
  schema,
  initial,
  catalogs,
  onClose,
  onSaved,
  onArchived,
  onRecorded,
}: {
  schema: FormSchema;
  initial: DataRecord | null;
  catalogs: Catalogs;
  onClose: () => void;
  onSaved: (record: DataRecord) => void;
  onArchived: () => void;
  onRecorded: (build: () => HistoryEntry) => void;
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
    const reasons = e instanceof ApiError ? [...new Set(e.body.records?.map((issue) => issue.message) ?? [])] : [];
    setError([message(e), ...reasons].join(" "));
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
      const before = record;
      onRecorded(() =>
        before
          ? {
              label: "record edit",
              changes: changesFromSave(
                before,
                next,
                fields.filter((f) => f.type !== "attachment").map((f) => f.id),
                (id) => emptyValue(schema, id),
              ),
            }
          : { label: "new record", changes: [{ recordId: next.id, version: next.version, before: null, after: {} }] },
      );
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
      // Through the batch archive, which returns the version that undo needs.
      const written = await api.writeRecords(schema.form.id, { archives: [{ record_id: record.id, expected_version: record.version }] });
      onRecorded(() => ({
        label: "delete",
        changes: written.archived.map((r) => ({ recordId: r.id, version: r.version, before: {}, after: null })),
      }));
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
                  <FieldIcon type={field.type} config={field.config} />
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
                    onBusyChange={setBusy}
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
                {field.description && <span className="field-hint">{field.description}</span>}
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
