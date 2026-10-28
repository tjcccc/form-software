import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Paperclip, Plus, SearchX, Trash2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Catalogs, DataRecord, Field, FormSchema, RecordPage, ViewConfig } from "../../api/types";
import { FieldIcon } from "../../components/Icons";
import { ColumnMenu } from "../workspace/ColumnMenu";
import { columnLayouts, visibleFields } from "../workspace/columns";
import type { ColumnAction } from "../workspace/useFieldActions";
import type { CellRef } from "./cellSelection";
import { ColumnResizeHandle } from "./ColumnResizeHandle";
import { clearedValue } from "./gridPaste";
import { headingHeight, offsetsOf, rowHeight, segments, type WindowRange, windowRange } from "./gridWindow";
import { groupKey, groupValue } from "./grouping";
import { InlineCellEditor } from "./InlineCellEditor";
import { Rating } from "./Rating";
import { RecordContextMenu } from "./RecordContextMenu";
import { changesFromWrite } from "./undoHistory";
import { useCellSelection } from "./useCellSelection";
import { useGridClipboard } from "./useGridClipboard";
import { useRecordGrid } from "./useRecordGrid";
import { useUndoHistory } from "./useUndoHistory";
import { displayValue, relationIds, titleOf } from "./values";
export function RecordTable({
  schema,
  records,
  config,
  catalogs,
  selectedId,
  loading,
  endRequest,
  onSelect,
  onNew,
  onFieldAction,
  onAddField,
  groups,
  onSaved,
  onChanged,
  onNotice,
  editingBlocked,
  canResize,
  onResize,
}: {
  schema: FormSchema;
  records: DataRecord[];
  config: ViewConfig;
  catalogs: Catalogs;
  selectedId?: string;
  loading: boolean;
  // Bumped when the view should open scrolled to its last row.
  endRequest: number;
  onSelect: (record: DataRecord) => void;
  onNew: () => void;
  onAddField: () => void;
  onFieldAction: (field: Field, action: ColumnAction) => void;
  groups: RecordPage["groups"];
  onSaved: (record: DataRecord) => void;
  onChanged: () => void;
  onNotice: (notice: string) => void;
  editingBlocked: boolean;
  canResize: boolean;
  onResize: (fieldId: string, width: number) => void;
}) {
  const history = useUndoHistory({ formId: schema.form.id, enabled: !editingBlocked, onSaved, onChanged, onNotice });
  const {
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
  } = useRecordGrid({
    schema,
    records,
    config,
    onSelect,
    onSaved,
    onChanged,
    onNotice,
    editingBlocked,
    onRecorded: history.record,
  });
  const [columnMenu, setColumnMenu] = useState<{ field: Field; anchor: HTMLElement; x: number; y: number }>();
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const groupedField = schema.fields.find((f) => f.id === config.group_by && !f.archived_at);
  const selectAll = useRef<HTMLInputElement>(null);
  const fields = visibleFields(schema, config);
  // Required fields stay reachable while an insertion is being completed.
  if (draft) {
    for (const f of schema.fields) {
      if (f.required && !f.archived_at && !fields.some((v) => v.id === f.id)) {
        fields.push(f);
      }
    }
  }
  const collapseKeyOf = (record: DataRecord) => `${groupedField?.id}:${groupKey(groupedField ? groupValue(record, groupedField) : null)}`;
  const visibleRows = rows.filter((record) => !collapsed.includes(collapseKeyOf(record)));
  const cells = useCellSelection({
    axes: { rows: visibleRows.map((r) => r.id), columns: fields.map((f) => f.id) },
    editing: !!active,
    onEdit: (cell, element, typed) => {
      const record = rows.find((r) => r.id === cell.recordId);
      const field = fields.find((f) => f.id === cell.fieldId);
      if (record && field) {
        activate(record, field, element, typed ? seedFor(field, typed) : undefined);
      }
    },
    onCopy: (data, cut) => clipboard.copy(data, cut),
    onPaste: (data) => clipboard.paste(data),
    onClear: () => clipboard.clear(),
  });
  const clipboard = useGridClipboard({
    schema,
    rows: visibleRows.filter((r) => r.id !== "draft"),
    fields,
    range: cells.range,
    catalogs,
    blocked: !!draft?.anchor || editingBlocked || busy,
    onSaved,
    onChanged,
    onNotice,
    onSelect: cells.selectCells,
    rowNumber: (record) => (position.get(record.id) ?? 0) + 1,
    draft: draft && !draft.anchor ? draft.record.values : undefined,
    onDraftUsed: () => setDraft(undefined),
    onWritten: (label, before, writes, written) =>
      history.record(() => ({ label, changes: changesFromWrite(before, writes, written, (id) => emptyValue(schema, id)) })),
  });
  const cutKeys = new Set(clipboard.cutCells?.map((c) => `${c.recordId}:${c.field.id}`));
  const items: GridItem[] = [];
  const position = new Map(records.map((r, i) => [r.id, i]));
  const loadedIn = new Map<string, number>();
  if (groupedField) {
    for (const r of records) {
      const key = groupKey(groupValue(r, groupedField));
      loadedIn.set(key, (loadedIn.get(key) ?? 0) + 1);
    }
  }
  rows.forEach((record, index) => {
    const collapseKey = collapseKeyOf(record);
    if (groupedField) {
      const value = groupValue(record, groupedField);
      const key = groupKey(value);
      if (index === 0 || key !== groupKey(groupValue(rows[index - 1], groupedField))) {
        const count = groups?.find((g) => groupKey(g.value) === key)?.count ?? 0;
        items.push({ kind: "heading", record, value, key, collapseKey, count, loaded: loadedIn.get(key) ?? 0 });
      }
    }
    if (!collapsed.includes(collapseKey)) {
      items.push({ kind: "row", record });
    }
  });
  const offsets = offsetsOf(items.map((item) => (item.kind === "heading" ? headingHeight : rowHeight)));
  const itemOf = new Map(items.flatMap((item, index) => (item.kind === "row" ? [[item.record.id, index] as const] : [])));
  const rowOf = new Map(visibleRows.map((r, i) => [r.id, i]));
  const pinned = [
    cells.selection?.anchor.recordId,
    cells.selection?.focus.recordId,
    active?.record.id,
    draft?.record.id,
    menu?.record.id,
  ].map((id) => (id ? (itemOf.get(id) ?? -1) : -1));
  const scroller = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLTableSectionElement>(null);
  const [range, setRange] = useState<WindowRange>({ start: 0, end: 40 });
  function measure() {
    if (scroller.current && body.current) {
      const top = scroller.current.getBoundingClientRect().top - body.current.getBoundingClientRect().top;
      const next = windowRange(offsets, top, scroller.current.clientHeight);
      setRange((old) => (old.start === next.start && old.end === next.end ? old : next));
    }
  }
  useLayoutEffect(measure);
  const latestMeasure = useRef(measure);
  useLayoutEffect(() => {
    latestMeasure.current = measure;
  });
  useEffect(() => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => latestMeasure.current());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (endRequest && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [endRequest]);
  const layouts = columnLayouts(schema, config);
  const widthOf = (field: Field) => liveWidths[field.id] ?? layouts.find((c) => c.field_id === field.id)?.width ?? 156;
  function clearPreview(id: string) {
    setLiveWidths((old) => Object.fromEntries(Object.entries(old).filter(([key]) => key !== id)));
  }
  useEffect(() => {
    if (selectAll.current) {
      selectAll.current.indeterminate = chosen.length > 0 && !all;
    }
  }, [chosen.length, all]);

  return (
    <div className="table-scroll" ref={scroller} aria-busy={loading || busy || clipboard.busy} onScroll={measure}>
      {(chosen.length > 0 || draft || error || busy || clipboard.busy || clipboard.pending) && (
        <div className="record-selection-bar" role="region" aria-label="Record selection and draft actions">
          {clipboard.pending ? (
            <>
              <span className="eyebrow">PASTE</span>
              <span>
                This paste adds {clipboard.pending.newRows} new {clipboard.pending.newRows === 1 ? "row" : "rows"} below the table.
              </span>
              <button className="button primary" disabled={clipboard.busy} onClick={() => void clipboard.confirm()}>
                Add rows and paste
              </button>
              <button className="text-button" onClick={clipboard.cancel}>
                Cancel
              </button>
            </>
          ) : draft ? (
            <>
              <span className="eyebrow">NEW ROW · {!draft.anchor ? "AT THE END" : draft.before ? "ABOVE" : "BELOW"}</span>
              <span>{draft.anchor ? "Fill the cells, then save." : "Type or paste into the cells, then save."}</span>
              <button className="button primary" disabled={busy} onClick={() => void saveDraft()}>
                Save record
              </button>
              <button
                className="icon-button"
                aria-label="Cancel inserted row"
                disabled={busy}
                onClick={() => {
                  setDraft(undefined);
                  setError("");
                }}
              >
                <X size={14} />
              </button>
            </>
          ) : chosen.length > 0 ? (
            <>
              <strong>{chosen.length} selected</strong>
              <button className="text-button danger" disabled={busy || editingBlocked} onClick={() => void remove(chosen)}>
                <Trash2 size={13} /> Delete selected
              </button>
              <button className="text-button" onClick={() => setSelected([])}>
                Clear selection
              </button>
            </>
          ) : null}
          {(busy || clipboard.busy) && <span role="status">Saving…</span>}
          {error && (
            <span className="field-error" role="alert">
              {error}
            </span>
          )}
        </div>
      )}

      <table
        className={`record-table ${config.freeze_first !== false ? "freeze-first" : ""}`}
        aria-rowcount={items.length + 1}
        style={{ width: 100 + fields.reduce((total, field) => total + widthOf(field), 0), minWidth: 0 }}
      >
        <colgroup>
          <col className="row-number-col" />
          {fields.map((f) => (
            <col key={f.id} style={{ width: widthOf(f) }} />
          ))}
          <col className="table-end-col" />
        </colgroup>
        <thead>
          <tr>
            <th className="row-index" scope="col">
              <input
                ref={selectAll}
                type="checkbox"
                className="row-select select-all"
                aria-label="Select all loaded records"
                checked={all}
                disabled={!records.length || busy}
                onChange={() => setSelected(all ? [] : records.map((r) => r.id))}
              />
              <span className="row-number" aria-hidden="true">
                #
              </span>
            </th>
            {fields.map((field, index) => (
              <th
                key={field.id}
                scope="col"
                className={`resizable-column ${index === 0 ? "first-data-column" : ""}`}
                title={field.description || undefined}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!active) {
                    setColumnMenu({ field, anchor: e.currentTarget.querySelector(".column-menu-button")!, x: e.clientX, y: e.clientY });
                  }
                }}
                aria-sort={config.sort?.field_id === field.id ? (config.sort.descending ? "descending" : "ascending") : "none"}
              >
                <button
                  className="column-heading"
                  aria-label={`Select ${field.name} column`}
                  disabled={loading || !!active}
                  onClick={() => cells.selectColumn(field.id)}
                >
                  <FieldIcon type={field.type} config={field.config} />
                  <span>{field.name}</span>
                  {config.sort?.field_id === field.id && (config.sort.descending ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}
                </button>
                <button
                  className="column-menu-button"
                  aria-label={`${field.name} column menu`}
                  aria-haspopup="menu"
                  disabled={busy || loading}
                  onClick={(e) => {
                    const r = e.currentTarget.closest("th")!.getBoundingClientRect();
                    setColumnMenu({ field, anchor: e.currentTarget, x: r.left, y: r.bottom });
                  }}
                >
                  <ChevronDown size={12} />
                </button>
                <ColumnResizeHandle
                  name={field.name}
                  width={widthOf(field)}
                  disabled={!canResize || busy || !!active}
                  onPreview={(width) => setLiveWidths((old) => ({ ...old, [field.id]: width }))}
                  onCommit={(width) => onResize(field.id, width)}
                  onCancel={() => clearPreview(field.id)}
                />
              </th>
            ))}
            <th scope="col">
              <button
                type="button"
                className="add-column-button"
                aria-label="Add field"
                title="Add field"
                disabled={busy || loading || editingBlocked}
                onClick={onAddField}
              >
                <Plus size={17} strokeWidth={1.5} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody ref={body}>
          {segments(offsets, range, pinned).map((part, order) => {
            if ("gap" in part) {
              return (
                <tr className="grid-spacer" key={`gap:${order}`} aria-hidden="true">
                  <td colSpan={fields.length + 2} style={{ height: part.gap }} />
                </tr>
              );
            }
            const index = part.index;
            const item = items[index];
            if (item.kind === "heading" && groupedField) {
              const { value } = item;
              const closed = collapsed.includes(item.collapseKey);
              return (
                <tr className="group-heading" key={`heading:${item.record.id}`} aria-rowindex={index + 2}>
                  <th colSpan={fields.length + 2} scope="rowgroup">
                    <button
                      className="group-toggle"
                      aria-expanded={!closed}
                      onClick={() =>
                        setCollapsed((old) => (closed ? old.filter((k) => k !== item.collapseKey) : [...old, item.collapseKey]))
                      }
                    >
                      {closed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      <span className="eyebrow">{groupedField.name}</span>
                      <strong>
                        {groupedField.type === "attachment"
                          ? `${value} files`
                          : value == null || (Array.isArray(value) && !value.length)
                            ? "Empty"
                            : displayValue(groupedField, value, catalogs)}
                      </strong>
                      <span className="group-count">
                        {item.loaded === item.count ? item.count : `${item.loaded} loaded / ${item.count} total`}
                        {draft && groupKey(groupValue(draft.record, groupedField)) === item.key ? " + draft" : ""}
                      </span>
                    </button>
                  </th>
                </tr>
              );
            }
            const { record } = item;
            return (
              <tr
                key={record.id}
                aria-rowindex={index + 2}
                className={`${selectedId === record.id || selected.includes(record.id) ? "selected" : ""} ${record.id === "draft" ? "draft-row" : ""}`}
                aria-selected={selected.includes(record.id)}
                onContextMenu={(event) => {
                  if (record.id === "draft" || active) {
                    return;
                  }
                  event.preventDefault();
                  setMenu({
                    record,
                    x: event.clientX,
                    y: event.clientY,
                    anchor: (event.target as HTMLElement).closest<HTMLElement>("button, input") ?? event.currentTarget,
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                    event.preventDefault();
                    const rect = event.target instanceof HTMLElement ? event.target.getBoundingClientRect() : null;
                    if (rect && record.id !== "draft") {
                      setMenu({
                        record,
                        x: rect.left,
                        y: rect.bottom,
                        anchor: (event.target as HTMLElement).closest<HTMLElement>("button, input") ?? event.currentTarget,
                      });
                    }
                  }
                }}
              >
                <td className="row-index">
                  {record.id === "draft" ? (
                    <span className="eyebrow">+</span>
                  ) : (
                    <>
                      <span className="row-number">{String((position.get(record.id) ?? 0) + 1).padStart(2, "0")}</span>
                      <input
                        type="checkbox"
                        className="row-select"
                        aria-label={`Select record ${(position.get(record.id) ?? 0) + 1}`}
                        checked={selected.includes(record.id)}
                        disabled={busy}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSelected((old) => (checked ? [...old, record.id] : old.filter((id) => id !== record.id)));
                        }}
                      />
                    </>
                  )}
                </td>
                {fields.map((field, fieldIndex) => (
                  <td
                    key={field.id}
                    className={`${fieldIndex === 0 ? "primary-cell first-data-column" : ""} ${field.type === "duration" || field.type === "integer" || field.type === "decimal" ? "numeric-cell" : ""}`}
                  >
                    <button
                      className="cell-button"
                      aria-label={`${titleOf(record, schema)}, ${field.name}`}
                      aria-disabled={busy || clipboard.busy || undefined}
                      data-cut={cutKeys.has(`${record.id}:${field.id}`) || undefined}
                      {...cells.cellProps(
                        { recordId: record.id, fieldId: field.id } satisfies CellRef,
                        rowOf.get(record.id) ?? -1,
                        fieldIndex,
                      )}
                    >
                      <Cell field={field} record={record} catalogs={catalogs} />
                    </button>
                    {!active && cells.selection?.anchor.recordId === record.id && cells.selection.anchor.fieldId === field.id && (
                      <textarea className="cell-input" {...cells.inputProps(`Selected cell: ${titleOf(record, schema)}, ${field.name}`)} />
                    )}
                  </td>
                ))}
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>
      {!loading && !records.length && (
        <div className="table-empty">
          <SearchX size={26} strokeWidth={1.2} />
          <h3>No records here yet.</h3>
          <p>Add a record, or adjust your search and filters.</p>
          <button className="button" onClick={onNew}>
            <Plus size={15} /> New record
          </button>
        </div>
      )}
      {loading && !records.length ? (
        <div className="table-loading">
          <span className="loading-line" />
          Loading records…
        </div>
      ) : (
        <button
          className="add-row"
          onClick={() => {
            // Selecting the new row's first cell lets typing or pasting start right away.
            if (appendDraft() && fields[0]) {
              cells.selectCells({ recordId: "draft", fieldId: fields[0].id }, { recordId: "draft", fieldId: fields[0].id });
            }
          }}
        >
          <Plus size={14} />
          <span>Add a record</span>
        </button>
      )}
      {active && (
        <InlineCellEditor
          key={`${active.record.id}:${active.field.id}`}
          field={active.field}
          initial={active.record}
          anchor={active.anchor}
          catalogs={catalogs}
          draft={active.record.id === "draft"}
          seed={active.seed}
          onSaved={saved}
          onClose={closeCell}
        />
      )}
      {columnMenu && (
        <ColumnMenu
          field={columnMenu.field}
          first={fields[0]?.id === columnMenu.field.id}
          config={config}
          anchor={columnMenu.anchor}
          x={columnMenu.x}
          y={columnMenu.y}
          onAction={(action) => onFieldAction(columnMenu.field, action)}
          onClose={() => setColumnMenu(undefined)}
        />
      )}
      {menu && <RecordContextMenu x={menu.x} y={menu.y} onAction={(kind) => void action(kind)} onClose={closeMenu} />}
      <div className="table-remainder" aria-hidden="true">
        <span>Space for what comes next.</span>
      </div>
    </div>
  );
}
type GridItem =
  | { kind: "heading"; record: DataRecord; value: unknown; key: string; collapseKey: string; count: number; loaded: number }
  | { kind: "row"; record: DataRecord };
// The stored form of an empty value, for fields missing from a record's values.
function emptyValue(schema: FormSchema, fieldId: string) {
  const field = schema.fields.find((f) => f.id === fieldId);
  return field ? clearedValue(field) : null;
}
// Typed or composed text replaces the value of text and number cells; other types just open their editor.
function seedFor(field: Field, typed: string): unknown {
  if (["short_text", "long_text", "url"].includes(field.type)) {
    return typed;
  }
  if (field.config.rating) {
    return undefined;
  }
  if ((field.type === "integer" || field.type === "duration") && /^\d+$/.test(typed)) {
    return Number(typed);
  }
  return field.type === "decimal" && /^-?\d+(\.\d*)?$/.test(typed) ? typed : undefined;
}
function Cell({ field, record, catalogs }: { field: Field; record: DataRecord; catalogs: Catalogs }) {
  const value = record.values[field.id];
  if (field.type === "attachment") {
    const attachments = record.attachments.filter((a) => a.field_id === field.id);
    return attachments.length ? (
      <span className="attachment-count">
        <Paperclip size={13} />
        {attachments.length} file{attachments.length === 1 ? "" : "s"}
      </span>
    ) : (
      <span className="empty-cell">—</span>
    );
  }
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) {
    return <span className="empty-cell">—</span>;
  }
  if (field.type === "relation") {
    const catalog = catalogs[field.config.target_form_id ?? ""];
    return (
      <span className="relation-cells">
        {relationIds(value).map((id) => {
          const related = catalog?.records.find((r) => r.id === id);
          const colorField = catalog?.schema.fields.find((f) => f.key === "color");
          const color = related && colorField ? related.values[colorField.id] : null;
          const validColor = ["blue", "purple", "ochre", "green", "red"].includes(String(color)) ? String(color) : "neutral";
          return (
            <span key={id} className={`record-tag tag-${validColor}`}>
              {catalog?.schema.form.kind === "options" && <span className="tag-dot" />}
              {related && catalog ? titleOf(related, catalog.schema) : id.slice(0, 8)}
            </span>
          );
        })}
      </span>
    );
  }
  if (field.config.rating) {
    return <Rating field={field} value={value} />;
  }
  if (field.type === "boolean") {
    return <span className={`boolean-cell ${value ? "checked" : ""}`}>{value ? <Check size={13} /> : "—"}</span>;
  }
  return (
    <span className={field.type === "date" || field.type === "duration" ? "mono-value" : field.type === "long_text" ? "muted-value" : ""}>
      {displayValue(field, value, catalogs)}
    </span>
  );
}
