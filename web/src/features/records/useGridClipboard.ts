import { useState } from "react";

import { api, ApiError, message } from "../../api/client";
import type { Catalogs, DataRecord, Field, FormSchema, ResolvedLabel, WriteRecords } from "../../api/types";
import type { CellRange, CellRef } from "./cellSelection";
import { copyText, parseTsv, toTsv } from "./clipboardText";
import {
  buildWrites,
  type CellWrite,
  clearedValue,
  clipboardType,
  type ClipCell,
  type ClipPayload,
  linkIds,
  maxPasteRecords,
  parseClipCell,
  pasteTargets,
  readPayload,
  skipsWrite,
  writeCount,
} from "./gridPaste";

type Pending = { writes: WriteRecords; newRows: number; select?: [CellRef, CellRef] };
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
      if (newRows) {
        setPending({ writes: built, newRows, select });
        return;
      }
      await write({ writes: built, newRows, select }, notes.filter(Boolean).join(" "));
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    if (blocked || busy) {
      return;
    }
    const block = selected();
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
      await write({ writes, newRows: 0 }, writable.length < cells.length ? "Files and required fields were kept." : "");
    } finally {
      setBusy(false);
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
      written.updated.forEach(onSaved);
      if (written.created.length) {
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
