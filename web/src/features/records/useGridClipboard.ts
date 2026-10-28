import { useState } from "react";

import { api, ApiError, message } from "../../api/client";
import type { Catalogs, DataRecord, Field, FormSchema, ResolvedLabel, Values, WriteRecords, WrittenRecords } from "../../api/types";
import type { CellRange, CellRef } from "./cellSelection";
import { copyText, parseTsv, toTsv } from "./clipboardText";
import {
  buildWrites,
  type CellWrite,
  clearedValue,
  clipboardType,
  type ClipCell,
  type ClipPayload,
  fillTargets,
  linkIds,
  maxPasteRecords,
  parseClipCell,
  pasteTargets,
  readPayload,
  skipsWrite,
  writeCount,
} from "./gridPaste";

type Pending = { label: string; writes: WriteRecords; newRows: number; select?: [CellRef, CellRef] };
// Copy, cut, paste, and clear for the grid's cell selection. Every write goes through the atomic batch endpoint, so a
// paste either saves completely or not at all; the server validates values and versions.
export function useGridClipboard({
  schema,
  rows,
  fields,
  range,
  catalogs,
  blocked,
  onSaved,
  onChanged,
  onNotice,
  onSelect,
  rowNumber,
  draft,
  onDraftUsed,
  onWritten,
}: {
  schema: FormSchema;
  rows: DataRecord[];
  fields: Field[];
  range: CellRange | undefined;
  catalogs: Catalogs;
  blocked: boolean;
  onSaved: (record: DataRecord) => void;
  onChanged: () => void;
  onNotice: (notice: string) => void;
  onSelect: (anchor: CellRef, focus: CellRef) => void;
  // The number shown in the row-number column, so messages match what people see.
  rowNumber: (record: DataRecord) => number;
  // Values of an empty row appended at the end. A paste onto it becomes the first new record.
  draft?: Values;
  onDraftUsed: () => void;
  // Reports each saved write with the rows as they were before it, for undo.
  onWritten: (label: string, before: DataRecord[], writes: WriteRecords, written: WrittenRecords) => void;
}) {
  const [cut, setCut] = useState<{ token: string; cells: { recordId: string; field: Field }[] }>();
  const [pending, setPending] = useState<Pending>();
  const [busy, setBusy] = useState(false);
  function selected() {
    if (!range) {
      return [];
    }
    return rows.slice(range.top, range.bottom + 1).map((record) => ({ record, fields: fields.slice(range.left, range.right + 1) }));
  }
  function copy(data: DataTransfer, isCut: boolean) {
    const block = selected();
    if (!block.length) {
      return;
    }
    const cells: ClipCell[][] = block.map(({ record, fields }) =>
      fields.map((field) => ({
        text: copyText(field, record, catalogs),
        value: field.type === "attachment" ? undefined : record.values[field.id],
        type: field.type,
        target: field.config.target_form_id ?? null,
      })),
    );
    const token = crypto.randomUUID();
    const payload: ClipPayload = { app: "formsoftware", form: schema.form.id, token, cells };
    data.setData("text/plain", toTsv(cells.map((row) => row.map((cell) => cell.text))));
    data.setData(clipboardType, JSON.stringify(payload));
    setCut(
      isCut ? { token, cells: block.flatMap(({ record, fields }) => fields.map((field) => ({ recordId: record.id, field }))) } : undefined,
    );
    const count = block.length * block[0].fields.length;
    onNotice(
      block.length > maxPasteRecords
        ? `Copied ${block.length} rows. Pasting is limited to ${maxPasteRecords} records at a time.`
        : `${isCut ? "Cut" : "Copied"} ${count} ${count === 1 ? "cell" : "cells"}.`,
    );
  }
  async function paste(data: DataTransfer) {
    if (!range || blocked || busy) {
      return;
    }
    const payload = readPayload(data.getData(clipboardType));
    const clip = payload?.cells ?? parseTsv(data.getData("text/plain")).map((row) => row.map((text) => ({ text })));
    if (!clip.length) {
      return;
    }
    if (clip.length > maxPasteRecords) {
      onNotice(`Paste at most ${maxPasteRecords} rows at a time; the clipboard has ${clip.length}.`);
      return;
    }
    const { targets, newRows, droppedColumns } = pasteTargets(clip, range, rows.length, fields.length);
    const parsed = targets.map((target) => ({
      ...target,
      field: fields[target.col],
      parsed: parseClipCell(fields[target.col], target.cell),
    }));
    setBusy(true);
    try {
      const resolved = await resolveLinks(parsed);
      const writes: CellWrite[] = [];
      const problems: string[] = [];
      let skipped = 0;
      for (const { row, field, cell, parsed: result } of parsed) {
        const outcome =
          "labels" in result ? linkIds(cell.text, result.labels, resolved.get(field.config.target_form_id ?? "") ?? new Map()) : result;
        if ("error" in outcome) {
          problems.push(
            `${rows[row] ? `Row ${rowNumber(rows[row])}` : `New row ${row - rows.length + 1}`}, ${field.name}: ${outcome.error}`,
          );
        } else if (skipsWrite(field, outcome.value)) {
          skipped++;
        } else {
          writes.push({ row, field, value: outcome.value });
        }
      }
      if (problems.length) {
        onNotice(`Nothing was pasted. ${summarize(problems)}`);
        return;
      }
      const clears =
        cut && payload?.token === cut.token && payload.form === schema.form.id
          ? cut.cells.flatMap(({ recordId, field }) => {
              const record = rows.find((r) => r.id === recordId);
              return record && !skipsWrite(field, null) ? [{ record, field }] : [];
            })
          : [];
      const built = buildWrites(writes, rows, clears);
      const label = clears.length ? "cut and paste" : "paste";
      if (draft && built.creates?.length) {
        built.creates[0] = { values: { ...draft, ...built.creates[0].values } };
      }
      if (writeCount(built) > maxPasteRecords) {
        onNotice(`Paste changes at most ${maxPasteRecords} records at a time.`);
        return;
      }
      if (!writeCount(built)) {
        onNotice(skipped ? "Nothing to paste: files and required fields left empty are skipped." : "Nothing to paste.");
        return;
      }
      const last = targets.at(-1);
      const select: Pending["select"] =
        last && rows[range.top]
          ? [
              { recordId: rows[range.top].id, fieldId: fields[range.left].id },
              { recordId: rows[Math.min(last.row, rows.length - 1)].id, fieldId: fields[last.col].id },
            ]
          : undefined;
      const notes = [
        skipped && "Files and empty required fields were skipped.",
        droppedColumns && "Columns past the last field were left out.",
      ];
      // The appended empty row already is the first new row, so only rows beyond it need confirming.
      if (newRows > (draft ? 1 : 0)) {
        setPending({ label, writes: built, newRows, select });
        return;
      }
      await write({ label, writes: built, newRows, select }, notes.filter(Boolean).join(" "));
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    if (blocked || busy) {
      return;
    }
    const block = selected();
    if (!block.length) {
      return;
    }
    const cells = block.flatMap(({ record, fields }) => fields.map((field) => ({ record, field })));
    const writable = cells.filter(({ field }) => !skipsWrite(field, null));
    const writes = buildWrites(
      writable.map(({ record, field }) => ({ row: rows.indexOf(record), field, value: clearedValue(field) })),
      rows,
    );
    if (!writeCount(writes)) {
      onNotice("Files and required fields cannot be cleared here.");
      return;
    }
    if (writeCount(writes) > maxPasteRecords) {
      onNotice(`Clear at most ${maxPasteRecords} records at a time.`);
      return;
    }
    setBusy(true);
    try {
      await write({ label: "clear", writes, newRows: 0 }, writable.length < cells.length ? "Files and required fields were kept." : "");
    } finally {
      setBusy(false);
    }
  }
  // Copies the source rows' values into the rows from the source to `to` (fill handle and Cmd/Ctrl+D). Stored values
  // pass through unchanged, so links and options fill without lookups; cells that already match are not written.
  async function fill(source: CellRange, to: number, selectResult: boolean) {
    if (blocked || busy || source.bottom >= rows.length) {
      return;
    }
    const end = Math.max(0, Math.min(to, rows.length - 1));
    const columns = fields.slice(source.left, source.right + 1);
    const writes: CellWrite[] = [];
    let skipped = 0;
    for (const { row, from } of fillTargets(source, end)) {
      for (const field of columns) {
        const value = rows[from].values[field.id] ?? clearedValue(field);
        if (skipsWrite(field, value)) {
          skipped++;
        } else if (JSON.stringify(rows[row].values[field.id] ?? clearedValue(field)) !== JSON.stringify(value)) {
          writes.push({ row, field, value });
        }
      }
    }
    const built = buildWrites(writes, rows);
    if (!writeCount(built)) {
      onNotice(
        skipped ? "Nothing to fill: files and required fields left empty are skipped." : "Nothing to fill: the cells already match.",
      );
      return;
    }
    if (writeCount(built) > maxPasteRecords) {
      onNotice(`Fill changes at most ${maxPasteRecords} records at a time.`);
      return;
    }
    const top = Math.min(source.top, end);
    const bottom = Math.max(source.bottom, end);
    const select: Pending["select"] = selectResult
      ? [
          { recordId: rows[top].id, fieldId: fields[source.left].id },
          { recordId: rows[bottom].id, fieldId: fields[source.right].id },
        ]
      : undefined;
    setBusy(true);
    try {
      await write({ label: "fill", writes: built, newRows: 0, select }, skipped ? "Files and empty required fields were skipped." : "");
    } finally {
      setBusy(false);
    }
  }
  // Like spreadsheets: a taller selection takes its top row's values; a single row takes the row above.
  function fillDown() {
    if (!range) {
      return;
    }
    if (range.bottom > range.top) {
      void fill({ ...range, bottom: range.top }, range.bottom, false);
    } else if (range.top > 0) {
      void fill({ ...range, top: range.top - 1, bottom: range.top - 1 }, range.top, false);
    }
  }
  async function resolveLinks(parsed: { field: Field; cell: ClipCell; parsed: ReturnType<typeof parseClipCell> }[]) {
    const labels = new Map<string, Set<string>>();
    for (const { field, cell, parsed: result } of parsed) {
      if ("labels" in result && field.config.target_form_id) {
        const set = labels.get(field.config.target_form_id) ?? new Set();
        [cell.text.trim(), ...result.labels].forEach((label) => set.add(label));
        labels.set(field.config.target_form_id, set);
      }
    }
    const resolved = new Map<string, Map<string, ResolvedLabel>>();
    for (const [form, set] of labels) {
      const found = new Map<string, ResolvedLabel>();
      const all = [...set];
      for (let i = 0; i < all.length; i += maxPasteRecords) {
        for (const label of await api.resolveRecords(form, all.slice(i, i + maxPasteRecords))) {
          found.set(label.label, label);
        }
      }
      resolved.set(form, found);
    }
    return resolved;
  }
  async function write(plan: Pending, note: string) {
    try {
      const written = await api.writeRecords(schema.form.id, plan.writes);
      onWritten(plan.label, rows, plan.writes, written);
      written.updated.forEach(onSaved);
      if (written.created.length) {
        if (draft) {
          onDraftUsed();
        }
        onChanged();
      }
      if (plan.writes.updates?.some((u) => cut?.cells.some((c) => c.recordId === u.record_id))) {
        setCut(undefined);
      }
      if (plan.select) {
        onSelect(...plan.select);
      }
      const total = writeCount(plan.writes);
      onNotice(`Saved ${total} ${total === 1 ? "record" : "records"}.${note ? ` ${note}` : ""}`);
    } catch (error) {
      onNotice(describe(error));
      if (error instanceof ApiError && error.status === 409) {
        onChanged();
      }
    }
  }
  function describe(error: unknown) {
    if (!(error instanceof ApiError) || !error.body.records?.length) {
      return message(error);
    }
    const problems = error.body.records.map((issue) => {
      const record = rows.find((r) => r.id === issue.record_id);
      const row = record ? `Row ${rowNumber(record)}` : `New row ${(issue.create_index ?? 0) + 1}`;
      const field = schema.fields.find((f) => f.id === issue.field_id);
      return `${row}${field ? `, ${field.name}` : ""}: ${issue.message}`;
    });
    return `${error.message} ${summarize(problems)}`;
  }
  return {
    busy,
    pending,
    cutCells: cut?.cells,
    copy,
    paste: (data: DataTransfer) => void paste(data),
    clear: () => void clear(),
    fill: (source: CellRange, to: number) => void fill(source, to, true),
    fillDown,
    confirm: async () => {
      const plan = pending;
      setPending(undefined);
      if (plan) {
        setBusy(true);
        try {
          await write(plan, "");
        } finally {
          setBusy(false);
        }
      }
    },
    cancel: () => setPending(undefined),
  };
}
function summarize(problems: string[]) {
  return problems.length > 3 ? `${problems.slice(0, 3).join(" ")} (+${problems.length - 3} more)` : problems.join(" ");
}
