import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { aborted, api, message } from "../../api/client";
import type { DataRecord, Field, RelationCatalog } from "../../api/types";
import { titleOf } from "../records/values";
export function FilterRelationPicker({
  field,
  value,
  multiple,
  catalog,
  label,
  invalid,
  onChange,
}: {
  field: Field;
  value: unknown;
  multiple: boolean;
  catalog?: RelationCatalog;
  label: string;
  invalid: boolean;
  onChange: (value: string | string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number }>();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; records: DataRecord[] }>();
  const [known, setKnown] = useState<DataRecord[]>([]);
  const [error, setError] = useState("");
  const cache = useRef(new Map<string, DataRecord>());
  const ref = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = multiple
    ? Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string")
      : []
    : typeof value === "string" && value
      ? [value]
      : [];
  const selectedKey = selected.join(",");
  const target = field.config.target_form_id;
  const choices = result?.query === query ? result.records : query === "" ? (catalog?.records ?? []) : [];
  const records = [...known, ...(result?.records ?? []), ...(catalog?.records ?? [])];
  const name = (id: string) => {
    const record = records.find((r) => r.id === id);
    return record && catalog ? titleOf(record, catalog.schema) : id.slice(0, 8);
  };
  useEffect(() => {
    if (!open || !target) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .records(target, new URLSearchParams({ q: query, limit: "100" }), controller.signal)
        .then((page) => {
          if (controller.signal.aborted) {
            return;
          }
          for (const record of page.records) {
            cache.current.set(record.id, record);
          }
          setResult({ query, records: page.records });
          setKnown((old) => [...old.filter((r) => !page.records.some((n) => n.id === r.id)), ...page.records]);
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
  useEffect(() => {
    if (!target || !selectedKey) {
      return;
    }
    const controller = new AbortController();
    const missing = selectedKey.split(",").filter((id) => !cache.current.has(id) && !catalog?.records.some((r) => r.id === id));
    if (!missing.length) {
      return;
    }
    Promise.allSettled(missing.map((id) => api.record(id, controller.signal))).then((results) => {
      if (controller.signal.aborted) {
        return;
      }
      const records = results.flatMap((result) => (result.status === "fulfilled" && result.value.form_id === target ? [result.value] : []));
      for (const record of records) {
        cache.current.set(record.id, record);
      }
      setKnown((old) => [...old.filter((r) => !records.some((n) => n.id === r.id)), ...records]);
      if (records.length !== missing.length) {
        setError("A selected record is unavailable. Remove it or choose another.");
      }
    });
    return () => controller.abort();
  }, [target, selectedKey, catalog]);
  useEffect(() => {
    if (!open) {
      return;
    }
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const place = () => {
      const rect = toggle.current!.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 32);
      const below = window.innerHeight - rect.bottom - 20;
      const above = rect.top - 20;
      const height = Math.min(350, Math.max(below, above));
      setPosition({
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
        top: below >= Math.min(350, above) ? rect.bottom + 4 : Math.max(16, rect.top - height - 4),
        width,
        maxHeight: height,
      });
    };
    place();
    ref.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) {
        place();
      }
    };
    document.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", scroll, true);
    };
  }, [open]);
  function choose(id: string) {
    if (multiple) {
      onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);
    } else {
      onChange(id);
      setOpen(false);
      toggle.current?.focus();
    }
  }
  return (
    <div
      ref={ref}
      className="filter-choice"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          toggle.current?.focus();
        }
        if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)')];
          if (!buttons.length) {
            return;
          }
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0 && (e.key === "Home" || e.key === "End")) {
            return;
          }
          e.preventDefault();
          buttons[
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
          ]?.focus();
        }
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="filter-choice-toggle"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-invalid={invalid}
        title={selected.map(name).join(", ")}
        onClick={() => setOpen(!open)}
      >
        <span>{selected.length ? selected.map(name).join(", ") : multiple ? "Select records…" : "Select a record…"}</span>
        {multiple && selected.length > 0 && <span className="control-count">{selected.length}</span>}
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="filter-choice-panel" style={position}>
          <div className="picker-search">
            <Search size={13} />
            <input
              aria-label={`Search ${field.name} choices`}
              placeholder="Search records…"
              maxLength={500}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (choices[0] && !(multiple && selected.length >= 100 && !selected.includes(choices[0].id))) {
                    choose(choices[0].id);
                  }
                }
              }}
            />
          </div>
          {selected.length > 0 && (
            <div className="filter-choice-selected">
              {selected.map((id) => (
                <span key={id} className="filter-selected-tag">
                  <span>{name(id)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${name(id)}`}
                    onClick={() => onChange(multiple ? selected.filter((v) => v !== id) : "")}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div
            id={listId}
            role="listbox"
            aria-label={`${field.name} choices`}
            aria-multiselectable={multiple}
            className="filter-choice-options"
          >
            {choices.map((record) => (
              <button
                key={record.id}
                type="button"
                role="option"
                aria-selected={selected.includes(record.id)}
                disabled={multiple && selected.length >= 100 && !selected.includes(record.id)}
                onClick={() => choose(record.id)}
              >
                <span>{catalog ? titleOf(record, catalog.schema) : record.id.slice(0, 8)}</span>
                {selected.includes(record.id) && <Check size={13} />}
              </button>
            ))}
            {!choices.length && <p className="picker-empty">{result?.query === query ? "No matching records." : "Searching…"}</p>}
          </div>
          <p className="picker-hint">
            {multiple ? "Choose up to 100 records · " : ""}Searches all linked records, including disabled choices.
          </p>
        </div>
      )}
    </div>
  );
}
