import { Check, Paperclip, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";

import { api, ApiError, message } from "../../api/client";
import type { Catalogs, DataRecord, Field } from "../../api/types";
import { FieldEditor } from "./FieldEditor";
import { RelationPicker } from "./RelationPicker";

export function InlineCellEditor({
  field,
  initial,
  anchor,
  catalogs,
  draft,
  onSaved,
  onClose,
}: {
  field: Field;
  initial: DataRecord;
  anchor: HTMLElement;
  catalogs: Catalogs;
  draft: boolean;
  onSaved: (record: DataRecord) => void;
  onClose: () => void;
}) {
  const [record, setRecord] = useState(initial);
  const [value, setValue] = useState(initial.values[field.id]);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<DataRecord>();
  const [busy, setBusy] = useState(false);
  const [, reposition] = useState(0);
  const locked = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(value) !== JSON.stringify(record.values[field.id]);
  const rect = anchor.getBoundingClientRect();
  const expanded = !!field.config.rating || ["long_text", "relation", "attachment"].includes(field.type);
  const width = Math.min(window.innerWidth - 16, expanded ? Math.max(rect.width, 330) : rect.width);

  async function save() {
    if (locked.current || conflict) {
      return false;
    }
    if (!dirty || field.type === "attachment") {
      flushSync(onClose);
      return true;
    }
    locked.current = true;
    setBusy(true);
    try {
      const next = draft
        ? { ...record, values: { ...record.values, [field.id]: value } }
        : await api.updateRecord(record, { [field.id]: value });
      flushSync(() => {
        onSaved(next);
        onClose();
      });
      return true;
    } catch (e) {
      setError(e instanceof ApiError && e.body.issues.length ? e.body.issues.map((i) => i.message).join(" ") : message(e));
      if (e instanceof ApiError && e.body.current) {
        setConflict(e.body.current as DataRecord);
      }
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const move = () => reposition((v) => v + 1);
    document.addEventListener("scroll", move, true);
    window.addEventListener("resize", move);
    return () => {
      document.removeEventListener("scroll", move, true);
      window.removeEventListener("resize", move);
    };
  }, []);
  useEffect(() => {
    const input =
      ref.current?.querySelector<HTMLElement>("input:not([type=file]), textarea") ?? ref.current?.querySelector<HTMLElement>("button");
    input?.focus();
    if (input instanceof HTMLInputElement && ["text", "url", "number"].includes(input.type)) {
      input.select();
    }
  }, []);
  useEffect(() => {
    if (error && !busy) {
      ref.current?.querySelector<HTMLElement>(conflict ? "button:not(:disabled)" : "input, textarea, button")?.focus();
    }
  }, [error, busy, conflict]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!locked.current) {
        onClose();
      }
    };
    document.addEventListener("keydown", escape, true);
    const outside = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) {
        return;
      }
      // Finish this write before activating another cell, preserving failed drafts.
      event.preventDefault();
      event.stopImmediatePropagation();
      const context = event.type === "contextmenu";
      const target = context ? (event.target as HTMLElement) : (event.target as HTMLElement).closest<HTMLElement>("button, input, a");
      void save().then((ok) => {
        if (ok && target?.isConnected) {
          target.focus();
          if (context) {
            target.dispatchEvent(
              new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY }),
            );
          } else {
            target.click();
          }
        }
      });
    };
    const navigate = (event: Event) => {
      if (dirty || busy) {
        event.preventDefault();
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
      }
    };
    document.addEventListener("click", outside, true);
    document.addEventListener("contextmenu", outside, true);
    window.addEventListener("formsw:before-navigate", navigate);
    window.addEventListener("beforeunload", unload);
    return () => {
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("click", outside, true);
      document.removeEventListener("contextmenu", outside, true);
      window.removeEventListener("formsw:before-navigate", navigate);
      window.removeEventListener("beforeunload", unload);
    };
  });
  async function attachment(action: () => Promise<DataRecord>) {
    if (locked.current) {
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await action();
      setRecord(next);
      onSaved(next);
    } catch (e) {
      setError(message(e));
      if (e instanceof ApiError && e.body.current) {
        setConflict(e.body.current as DataRecord);
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return createPortal(
    <div
      ref={ref}
      className={`inline-cell-editor ${expanded ? "expanded" : ""}`}
      role="dialog"
      aria-label={`Edit ${field.name}`}
      style={{
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: Math.max(8, expanded ? Math.min(rect.top, window.innerHeight - 360) : Math.min(rect.top, window.innerHeight - 90)),
        width,
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          (field.type !== "long_text" || event.ctrlKey || event.metaKey) &&
          field.type !== "relation" &&
          field.type !== "attachment"
        ) {
          event.preventDefault();
          void save();
        }
        if (event.key === "Tab" && !expanded) {
          event.preventDefault();
          const row = anchor.closest("tr");
          const buttons = [...(row?.querySelectorAll<HTMLButtonElement>(".cell-button") ?? [])];
          const next = buttons[buttons.indexOf(anchor as HTMLButtonElement) + (event.shiftKey ? -1 : 1)];
          void save().then((ok) => {
            if (ok) {
              (next ?? anchor).focus();
              next?.click();
            }
          });
        }
      }}
    >
      <div className="inline-cell-heading">
        <span>{field.name}</span>
        <span>{busy ? "SAVING…" : draft ? "DRAFT" : "INLINE EDIT"}</span>
      </div>
      <fieldset disabled={busy || !!conflict}>
        {field.type === "relation" ? (
          <RelationPicker
            field={field}
            value={value}
            catalog={catalogs[field.config.target_form_id ?? ""]}
            onChange={setValue}
            onBusyChange={(next) => {
              locked.current = next;
              setBusy(next);
            }}
            autoOpen
          />
        ) : field.type === "attachment" ? (
          <div className="inline-files">
            {record.attachments
              .filter((a) => a.field_id === field.id)
              .map((a) => (
                <div key={a.id}>
                  <a href={`/api/v1/attachments/${a.id}`} download>
                    {a.filename}
                  </a>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${a.filename}`}
                    onClick={() => {
                      if (window.confirm(`Remove ${a.filename}?`)) {
                        void attachment(() => api.removeAttachment(record, a.id));
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            {draft ? (
              <p>Save the record before adding files.</p>
            ) : (
              <label className="button">
                <Paperclip size={13} /> Add file
                <input
                  type="file"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void attachment(() => api.upload(record, field.id, file));
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        ) : (
          <FieldEditor field={field} value={value} onChange={setValue} autoFocus />
        )}
      </fieldset>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {conflict && (
        <div className="inline-conflict">
          <p>This record changed elsewhere. Your draft is kept above.</p>
          <button
            className="text-button"
            onClick={() => {
              onSaved(conflict);
              onClose();
            }}
          >
            Discard draft and load latest
          </button>
        </div>
      )}
      <div className="inline-cell-actions">
        <span>
          {field.type === "long_text"
            ? "⌘/Ctrl + Enter to save"
            : field.type === "relation"
              ? "Click away to save · Esc to cancel"
              : field.type === "attachment"
                ? "Files save immediately"
                : "Enter to save · Esc to cancel"}
        </span>
        <button className="icon-button" aria-label="Cancel cell edit" disabled={busy} onClick={onClose}>
          <X size={13} />
        </button>
        <button className="icon-button" aria-label="Save cell" disabled={busy || !!conflict} onClick={() => void save()}>
          <Check size={14} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
