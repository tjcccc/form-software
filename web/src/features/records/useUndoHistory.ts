import { useEffect, useRef, useState } from "react";

import { api, ApiError, message } from "../../api/client";
import type { DataRecord, WrittenRecords } from "../../api/types";
import { type Direction, type HistoryEntry, push, reversal, withVersions } from "./undoHistory";

// Session undo and redo for grid actions on one form. Each step is replayed through the atomic batch endpoint with
// the versions it left behind; when any record changed since, the step is refused and dropped instead of
// overwriting the newer data.
export function useUndoHistory({
  formId,
  enabled,
  onSaved,
  onChanged,
  onNotice,
}: {
  formId: string;
  enabled: boolean;
  onSaved: (record: DataRecord) => void;
  onChanged: () => void;
  onNotice: (notice: string) => void;
}) {
  const [stacks, setStacks] = useState<{ undo: HistoryEntry[]; redo: HistoryEntry[] }>({ undo: [], redo: [] });
  const [busy, setBusy] = useState(false);
  // Key repeat can deliver several presses before a re-render, so replays are guarded synchronously.
  const running = useRef(false);
  const [form, setForm] = useState(formId);
  if (form !== formId) {
    setForm(formId);
    setStacks({ undo: [], redo: [] });
  }
  // Recording is secondary to the save it follows: a step that cannot be built is left out of the history (an
  // older step on the same record is then refused on replay) instead of failing a save that already succeeded.
  function record(build: () => HistoryEntry) {
    let entry: HistoryEntry;
    try {
      entry = build();
    } catch (error) {
      console.warn("Could not record this change for undo.", error);
      return;
    }
    setStacks((old) => ({ undo: push(old.undo, entry), redo: entry.changes.length ? [] : old.redo }));
  }
  async function replay(direction: Direction) {
    const source = direction === "undo" ? stacks.undo : stacks.redo;
    const entry = source.at(-1);
    if (!entry || running.current || !enabled) {
      if (!entry && enabled) {
        onNotice(direction === "undo" ? "Nothing to undo." : "Nothing to redo.");
      }
      return;
    }
    const verb = direction === "undo" ? "Undid" : "Redid";
    running.current = true;
    setBusy(true);
    try {
      const written: WrittenRecords = await api.writeRecords(formId, reversal(entry, direction));
      written.updated.forEach(onSaved);
      if (written.archived.length || written.restored.length) {
        onChanged();
      }
      // Every step that touches these records now expects their new versions.
      setStacks((old) => {
        const undo = old.undo.filter((e) => e !== entry).map((e) => withVersions(e, written));
        const redo = old.redo.filter((e) => e !== entry).map((e) => withVersions(e, written));
        const moved = withVersions(entry, written);
        return direction === "undo" ? { undo, redo: push(redo, moved) } : { undo: push(undo, moved), redo };
      });
      onNotice(`${verb} ${entry.label}.`);
    } catch (error) {
      const refused = error instanceof ApiError && (error.status === 409 || error.status === 422 || error.status === 404);
      if (refused) {
        setStacks((old) => ({ undo: old.undo.filter((e) => e !== entry), redo: old.redo.filter((e) => e !== entry) }));
        onChanged();
      }
      onNotice(
        error instanceof ApiError && error.status === 409
          ? `Could not ${direction} ${entry.label}: a record changed since, so nothing was changed.`
          : `Could not ${direction} ${entry.label}. ${message(error)}`,
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const latest = useRef(replay);
  useEffect(() => {
    latest.current = replay;
  });
  // Cmd/Ctrl+Z undoes and Shift+Cmd/Ctrl+Z or Ctrl+Y redoes, except inside text fields, which keep their own
  // undo. The grid's hidden keyboard field is not a text field.
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable='true']") && !target.classList.contains("cell-input");
      if (event.defaultPrevented || typing || event.altKey || !(event.metaKey || event.ctrlKey)) {
        return;
      }
      const key = event.key.toLowerCase();
      const redo = (key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey && !event.metaKey);
      if (key === "z" || redo) {
        event.preventDefault();
        void latest.current(redo ? "redo" : "undo");
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, []);
  return { record, busy, canUndo: stacks.undo.length > 0, canRedo: stacks.redo.length > 0 };
}
