import { ArrowDown, ArrowUp, CornerDownLeft, Plus, SearchX, Check, Paperclip } from "lucide-react";
import { FieldIcon } from "../../components/Icons";
import type { Catalogs, DataRecord, Field, FormSchema, ViewConfig } from "../../api/types";
import { displayValue, relationIds, titleOf } from "./values";
function visibleFields(schema: FormSchema, config: ViewConfig) {
  const active = schema.fields.filter((f) => !f.archived_at);
  const configured = config.columns.map((c) => active.find((f) => f.id === c.field_id)).filter((f): f is Field => !!f);
  const ordered = [...configured, ...active.filter((f) => !configured.some((c) => c.id === f.id))];
  return ordered.filter((f, index) => {
    const column = config.columns.find((c) => c.field_id === f.id);
    return column ? !column.hidden : index < 6;
  });
}
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
  onSort,
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
  onSort: (field: Field) => void;
}) {
  const fields = visibleFields(schema, config);
  return (
    <div className="table-scroll" aria-busy={loading}>
      <table className="record-table">
        <colgroup>
          <col className="row-number-col" />
          {fields.map((f) => (
            <col
              key={f.id}
              style={{
                width:
                  config.columns.find((c) => c.field_id === f.id)?.width ??
                  (f.key === "name" ? 350 : f.type === "long_text" ? 320 : f.type === "duration" ? 118 : 156),
              }}
            />
          ))}
          <col className="table-end-col" />
        </colgroup>
        <thead>
          <tr>
            <th className="row-index" scope="col">
              <span className="sr-only">Record number</span>
              <span aria-hidden="true">#</span>
            </th>
            {fields.map((field) => (
              <th
                key={field.id}
                scope="col"
                aria-sort={config.sort?.field_id === field.id ? (config.sort.descending ? "descending" : "ascending") : "none"}
              >
                <button
                  className="column-heading"
                  disabled={field.type === "relation" || field.type === "attachment"}
                  onClick={() => onSort(field)}
                >
                  <FieldIcon type={field.type} />
                  <span>{field.name}</span>
                  {config.sort?.field_id === field.id && (config.sort.descending ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}
                </button>
              </th>
            ))}
            <th aria-label="End of columns" />
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={record.id} className={selectedId === record.id ? "selected" : ""} aria-selected={selectedId === record.id}>
              <td className="row-index">{String(offset + index + 1).padStart(2, "0")}</td>
              {fields.map((field, fieldIndex) => (
                <td
                  key={field.id}
                  className={`${fieldIndex === 0 ? "primary-cell" : ""} ${field.type === "duration" || field.type === "integer" || field.type === "decimal" ? "numeric-cell" : ""}`}
                >
                  <button
                    className="cell-button"
                    onClick={() => onSelect(record)}
                    aria-label={`Open ${titleOf(record, schema)}, ${field.name}`}
                  >
                    <Cell field={field} record={record} catalogs={catalogs} />
                    {fieldIndex === 0 && <CornerDownLeft size={13} className="row-enter" />}
                  </button>
                </td>
              ))}
              <td />
            </tr>
          ))}
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
      <div className="table-remainder" aria-hidden="true">
        <span>Space for what comes next.</span>
      </div>
    </div>
  );
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
  if (field.type === "boolean") {
    return <span className={`boolean-cell ${value ? "checked" : ""}`}>{value ? <Check size={13} /> : "—"}</span>;
  }
  return (
    <span className={field.type === "date" || field.type === "duration" ? "mono-value" : field.type === "long_text" ? "muted-value" : ""}>
      {displayValue(field, value, catalogs)}
    </span>
  );
}
