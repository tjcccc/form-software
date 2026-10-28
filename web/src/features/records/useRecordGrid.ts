import { useEffect, useState } from "react";

import { api, ApiError, message } from "../../api/client";
import type { DataRecord, Field, FormSchema, ViewConfig } from "../../api/types";
import { clearedValue, maxPasteRecords } from "./gridPaste";
import type { RecordAction } from "./RecordContextMenu";
import type { HistoryEntry } from "./undoHistory";
import { initialValues, titleOf } from "./values";

export function useRecordGrid({
  schema,
  records,
  config,
  onSelect,
  onSaved,
  onChanged,
  onNotice,
  editingBlocked,
  onRecorded,
}: {
  schema: FormSchema;
  records: DataRecord[];
  config: ViewConfig;
  onSelect: (record: DataRecord) => void;
  onSaved: (record: DataRecord) => void;
  onChanged: () => void;
  onNotice: (notice: string) => void;
  editingBlocked: boolean;
  // Receives each saved grid action as an undo step.
  onRecorded: (build: () => HistoryEntry) => void;
}) {
  const [active, setActive] = useState<{ record: DataRecord; field: Field; anchor: HTMLElement; seed?: unknown }>();
  const [menu, setMenu] = useState<{ record: DataRecord; x: number; y: number; anchor: HTMLElement }>();
  const [selected, setSelected] = useState<string[]>([]);
  // A draft without an anchor is appended at the end of manual order.
  const [draft, setDraft] = useState<{ record: DataRecord; anchor?: DataRecord; before: boolean }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosen = records.filter((r) => selected.includes(r.id));
  const all = records.length > 0 && chosen.length === records.length;
  const rows = [...records];
  if (draft) {
    const anchor = draft.anchor ? rows.findIndex((r) => r.id === draft.anchor?.id) : rows.length - 1;
    rows.splice(anchor < 0 ? 0 : anchor + (draft.before ? 0 : 1), 0, draft.record);
  }
  useEffect(() => {
    const navigate = (e: Event) => {
      if (draft || busy) {
        e.preventDefault();
      }
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (draft || busy) {
        e.preventDefault();
      }
    };
    window.addEventListener("formsw:before-navigate", navigate);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("formsw:before-navigate", navigate);
      window.removeEventListener("beforeunload", unload);
    };
  }, [draft, busy]);
  function describe(error: unknown) {
    if (error instanceof ApiError && error.body.records?.length) {
      const reasons = [...new Set(error.body.records.map((issue) => issue.message))];
      return `${error.message} ${reasons.join(" ")}`;
    }
    return error instanceof ApiError && error.body.issues.length
      ? error.body.issues
          .map((issue) => `${schema.fields.find((field) => field.id === issue.field_id)?.name ?? "Record"}: ${issue.message}`)
          .join(" ")
      : message(error);
  }
  // `seed` replaces the cell value when typing started the edit.
  function activate(record: DataRecord, field: Field, anchor: HTMLElement, seed?: unknown) {
    if (busy || editingBlocked) {
      onNotice("Close the record editor before editing cells.");
      return;
    }
    setActive({ record, field, anchor, seed });
  }
  function saved(record: DataRecord) {
    if (record.id === draft?.record.id) {
      setDraft({ ...draft, record });
      return;
    }
    if (active && active.record.id === record.id) {
      const field = active.field;
      const value = (values: DataRecord["values"]) => (field.id in values ? values[field.id] : clearedValue(field));
      onRecorded(() => ({
        label: "edit",
        changes: [
          {
            recordId: record.id,
            version: record.version,
            before: { [field.id]: value(active.record.values) },
            after: { [field.id]: value(record.values) },
          },
        ],
      }));
    }
    onSaved(record);
  }
  function closeCell() {
    const anchor = active?.anchor;
    setActive(undefined);
    anchor?.focus();
  }
  async function action(kind: RecordAction) {
    if (!menu) {
      return;
    }
    const record = menu.record;
    closeMenu();
    if (kind === "open") {
      onSelect(record);
      return;
    }
    if (editingBlocked || busy) {
      onNotice("Close the record editor first.");
      return;
    }
    if (draft) {
      onNotice("Save or cancel the draft row first.");
      return;
    }
    setError("");
    if (kind === "above" || kind === "below") {
      if (config.sort || config.group_by) {
        onNotice("The new row keeps its manual position; active grouping and sorting determine where it appears after saving.");
      }
      setDraft({
        anchor: record,
        before: kind === "above",
        record: { ...record, id: "draft", version: 0, attachments: [], values: initialValues(schema) },
      });
      return;
    }
    if (kind === "delete") {
      await remove([record]);
      return;
    }
    setBusy(true);
    try {
      const copy = await api.duplicateRecord(record);
      onRecorded(() => ({ label: "duplicate", changes: [{ recordId: copy.id, version: copy.version, before: null, after: {} }] }));
      onChanged();
      onNotice(
        config.sort || config.group_by
          ? "Record duplicated. Its position follows the active grouping and sort."
          : "Record duplicated below the original.",
      );
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }
  function closeMenu() {
    const anchor = menu?.anchor;
    setMenu(undefined);
    anchor?.focus();
  }
  async function remove(items: DataRecord[]) {
    if (
      !window.confirm(
        `Delete ${items.length === 1 ? `“${titleOf(items[0], schema)}”` : `${items.length} selected records`}? Records will be archived.`,
      )
    ) {
      return;
    }
    if (items.length > maxPasteRecords) {
      onNotice(`Delete at most ${maxPasteRecords} records at a time.`);
      return;
    }
    setBusy(true);
    setError("");
    // One atomic write, so either every selected record is deleted or none is.
    try {
      const written = await api.writeRecords(schema.form.id, {
        archives: items.map((r) => ({ record_id: r.id, expected_version: r.version })),
      });
      setSelected((old) => old.filter((id) => !items.some((r) => r.id === id)));
      onRecorded(() => ({
        label: items.length === 1 ? "delete" : `delete of ${items.length} records`,
        changes: written.archived.map((r) => ({ recordId: r.id, version: r.version, before: {}, after: null })),
      }));
      onNotice(`${items.length} record${items.length === 1 ? "" : "s"} deleted.`);
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
      onChanged();
    }
  }
  // Adds an empty row at the end of the table, ready for typing or pasting; it saves like any other draft row.
  function appendDraft() {
    if (editingBlocked || busy) {
      onNotice("Close the record editor first.");
      return false;
    }
    if (draft) {
      onNotice("Save or cancel the draft row first.");
      return false;
    }
    setError("");
    const now = new Date().toISOString();
    setDraft({
      before: false,
      record: {
        id: "draft",
        form_id: schema.form.id,
        version: 0,
        values: initialValues(schema),
        attachments: [],
        created_at: now,
        updated_at: now,
        created_by: "",
        updated_by: "",
      },
    });
    return true;
  }
  async function saveDraft() {
    if (!draft || active) {
      onNotice("Finish editing the cell before saving the row.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = draft.anchor
        ? await api.insertRecord(draft.anchor, draft.record.values, draft.before)
        : await api.createRecord(schema.form.id, draft.record.values);
      onRecorded(() => ({ label: "new row", changes: [{ recordId: created.id, version: created.version, before: null, after: {} }] }));
      setDraft(undefined);
      onChanged();
      onNotice(
        config.sort || config.group_by
          ? "Record inserted. Its position follows the active grouping, sort and filters."
          : "Record inserted. Active filters still apply.",
      );
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return {
    active,
    menu,
    setMenu,
    selected,
    setSelected,
    draft,
    setDraft,
    busy,
    error,
    setError,
    chosen,
    all,
    rows,
    activate,
    saved,
    closeCell,
    action,
    closeMenu,
    remove,
    saveDraft,
    appendDraft,
  };
}
