import { useEffect, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { api, aborted, message } from "../../api/client";
import type { DataRecord, Field, RelationCatalog } from "../../api/types";
import { relationIds, titleOf } from "./values";
export function RelationPicker({
  field,
  value,
  catalog,
  onChange,
}: {
  field: Field;
  value: unknown;
  catalog?: RelationCatalog;
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<DataRecord[]>([]);
  const [chosen, setChosen] = useState<DataRecord[]>([]);
  const [error, setError] = useState("");
  const selected = relationIds(value);
  const target = field.config.target_form_id;
  useEffect(() => {
    if (!open || !target) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api
        .records(target, new URLSearchParams({ q: query, limit: "100" }), controller.signal)
        .then((page) => {
          setOptions(page.records);
          setError("");
        })
        .catch((e) => {
          if (!aborted(e)) {
            setError(message(e));
          }
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, target, query]);
  const known = [...chosen, ...options, ...(catalog?.records ?? [])];
  const enabled = catalog?.schema.fields.find((f) => f.key === "enabled");
  function choose(record: DataRecord) {
    setChosen((old) => [...old.filter((r) => r.id !== record.id), record]);
    onChange(
      selected.includes(record.id)
        ? selected.filter((id) => id !== record.id)
        : field.config.cardinality === "many"
          ? [...selected, record.id]
          : [record.id],
    );
    if (field.config.cardinality === "one") {
      setOpen(false);
    }
  }
  return (
    <div className="relation-editor">
      <div className="relation-input">
        <button id={`field-${field.id}`} type="button" className="relation-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span>
            {selected.length
              ? selected
                  .map((id) => {
                    const record = known.find((r) => r.id === id);
                    return record && catalog ? titleOf(record, catalog.schema) : id.slice(0, 8);
                  })
                  .join(", ")
              : "Choose a record…"}
          </span>
          <ChevronDown size={14} />
        </button>
        {selected.length > 0 && (
          <button type="button" className="icon-button" aria-label={`Clear ${field.name}`} onClick={() => onChange([])}>
            <X size={13} />
          </button>
        )}
      </div>
      {open && (
        <div className="relation-options">
          <div className="picker-search">
            <Search size={14} />
            <input
              autoFocus
              placeholder="Search related records…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={`Search ${field.name}`}
            />
          </div>
          {error && <p className="field-error">{error}</p>}
          <div className="picker-options">
            {options.map((record) => {
              const disabled = !!enabled && record.values[enabled.id] === false && !selected.includes(record.id);
              return (
                <button type="button" key={record.id} disabled={disabled} className="picker-option" onClick={() => choose(record)}>
                  <span>
                    {catalog ? titleOf(record, catalog.schema) : record.id.slice(0, 8)}
                    {disabled ? " (disabled)" : ""}
                  </span>
                  {selected.includes(record.id) && <Check size={14} />}
                </button>
              );
            })}
            {!options.length && <p className="picker-empty">No matching records.</p>}
          </div>
          <p className="picker-hint">Searches existing records · up to 100 results</p>
        </div>
      )}
    </div>
  );
}
