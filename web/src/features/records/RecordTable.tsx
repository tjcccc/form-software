import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Paperclip, Plus, SearchX, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

import type { Catalogs, DataRecord, Field, FormSchema, RecordPage, ViewConfig } from "../../api/types";
import { FieldIcon } from "../../components/Icons";
import { ColumnMenu } from "../workspace/ColumnMenu";
import { columnLayouts, visibleFields } from "../workspace/columns";
import type { ColumnAction } from "../workspace/useFieldActions";
import type { CellRef } from "./cellSelection";
import { ColumnResizeHandle } from "./ColumnResizeHandle";
import { groupKey, groupValue } from "./grouping";
import { InlineCellEditor } from "./InlineCellEditor";
import { Rating } from "./Rating";
import { RecordContextMenu } from "./RecordContextMenu";
import { useCellSelection } from "./useCellSelection";
import { useRecordGrid } from "./useRecordGrid";
import { displayValue, relationIds, titleOf } from "./values";
export function RecordTable({
  schema,
  records,
  config,
  catalogs,
  selectedId,
  loading,
  offset,
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
  offset: number;
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
  } = useRecordGrid({
    schema,
    records,
    config,
    onSelect,
    onSaved,
    onChanged,
    onNotice,
    editingBlocked,
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
  });
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
    <div className="table-scroll" aria-busy={loading || busy}>
      {(chosen.length > 0 || draft || error || busy) && (
        <div className="record-selection-bar" role="region" aria-label="Record selection and draft actions">
          {draft ? (
            <>
              <span className="eyebrow">NEW ROW · {draft.before ? "ABOVE" : "BELOW"}</span>
              <span>Fill the cells, then save.</span>
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
          {busy && <span role="status">Saving…</span>}
          {error && (
            <span className="field-error" role="alert">
              {error}
            </span>
          )}
        </div>
      )}

      <table
        className={`record-table ${config.freeze_first !== false ? "freeze-first" : ""}`}
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
                aria-label="Select all records on this page"
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
        <tbody>
          {rows.map((record, index) => {
            const value = groupedField ? groupValue(record, groupedField) : null;
            const key = groupKey(value);
            const start = !!groupedField && (index === 0 || key !== groupKey(groupValue(rows[index - 1], groupedField)));
            const count = groups?.find((g) => groupKey(g.value) === key)?.count ?? 0;
            const onPage = groupedField ? records.filter((r) => groupKey(groupValue(r, groupedField)) === key).length : 0;
            const collapseKey = collapseKeyOf(record);
            const rowIndex = visibleRows.indexOf(record);
            const closed = collapsed.includes(collapseKey);
            return (
              <Fragment key={record.id}>
                {start && (
                  <tr className="group-heading">
                    <th colSpan={fields.length + 2} scope="rowgroup">
                      <button
                        className="group-toggle"
                        aria-expanded={!closed}
                        onClick={() => setCollapsed((old) => (closed ? old.filter((k) => k !== collapseKey) : [...old, collapseKey]))}
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
                          {onPage === count ? count : `${onPage} on page / ${count} total`}
                          {draft && groupKey(groupValue(draft.record, groupedField)) === key ? " + draft" : ""}
                        </span>
                      </button>
                    </th>
                  </tr>
                )}
                {!closed && (
                  <tr
                    key={record.id}
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
                          <span className="row-number">
                            {String(offset + records.findIndex((r) => r.id === record.id) + 1).padStart(2, "0")}
                          </span>
                          <input
                            type="checkbox"
                            className="row-select"
                            aria-label={`Select record ${offset + index + 1}`}
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
                          aria-disabled={busy || undefined}
                          {...cells.cellProps({ recordId: record.id, fieldId: field.id } satisfies CellRef, rowIndex, fieldIndex)}
                        >
                          <Cell field={field} record={record} catalogs={catalogs} />
                        </button>
                      </td>
                    ))}
                    <td />
                  </tr>
                )}
              </Fragment>
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
        <button className="add-row" onClick={onNew}>
          <Plus size={14} />
          <span>Add a record</span>
          <kbd>N</kbd>
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
// Typing on a selected cell seeds text and number editors; other types just open their editor.
function seedFor(field: Field, typed: string): unknown {
  if (["short_text", "long_text", "url"].includes(field.type)) {
    return typed;
  }
  if (/^\d$/.test(typed) && !field.config.rating) {
    return field.type === "decimal" ? typed : field.type === "integer" || field.type === "duration" ? Number(typed) : undefined;
  }
  return undefined;
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
