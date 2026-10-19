import { Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Catalogs, Field, Filter as FilterRule } from "../../api/types";
import { FilterRelationPicker } from "./FilterRelationPicker";
import { changeOperator, conditionError, emptyCheck, multipleChoice, newCondition, operators } from "./filterRules";
export function FilterEditor({
  fields,
  filters,
  catalogs,
  onChange,
}: {
  fields: Field[];
  filters: FilterRule[];
  catalogs: Catalogs;
  onChange: (filters: FilterRule[]) => void;
}) {
  const [draft, setDraft] = useState(() =>
    filters.map((filter) => {
      const field = fields.find((f) => f.id === filter.field_id);
      return field?.type === "relation" && filter.op === "contains" ? { ...filter, op: "eq" as const } : filter;
    }),
  );
  const [issues, setIssues] = useState<Record<number, string>>({});
  function update(index: number, filter: FilterRule) {
    setDraft((old) => old.map((f, i) => (i === index ? filter : f)));
    setIssues({});
  }
  function apply() {
    const errors = Object.fromEntries(
      draft
        .map((f, i) => [
          i,
          conditionError(
            f,
            fields.find((field) => field.id === f.field_id),
          ),
        ])
        .filter(([, message]) => message),
    );
    setIssues(errors);
    if (Object.keys(errors).length) {
      return;
    }
    onChange(draft.map((filter) => ({ ...filter, value: emptyCheck(filter.op) ? null : filter.value })));
  }
  return (
    <form
      className="filter-editor"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <p className="filter-intro">
        In this view, show records that match <strong>all</strong> conditions.
      </p>
      {!draft.length && <p className="filter-empty">No conditions. All records are included.</p>}
      <div className="filter-conditions">
        {draft.map((filter, index) => {
          const field = fields.find((f) => f.id === filter.field_id);
          const noValue = emptyCheck(filter.op);
          return (
            <div key={index} className={`filter-rule ${noValue ? "no-value" : ""}`}>
              <span className="filter-join">{index === 0 ? "Where" : "And"}</span>
              <select
                className="filter-field"
                aria-label={`Filter ${index + 1} field`}
                value={filter.field_id}
                onChange={(e) => {
                  const next = fields.find((f) => f.id === e.target.value);
                  if (next) {
                    update(index, newCondition(next));
                  }
                }}
              >
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <select
                className="filter-operator"
                aria-label={`Filter ${index + 1} operator`}
                value={filter.op}
                onChange={(e) => update(index, changeOperator(filter, field, e.target.value as FilterRule["op"]))}
              >
                {operators(field).map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              {!noValue && (
                <div className="filter-value">
                  {field?.type === "relation" ? (
                    <FilterRelationPicker
                      key={`${field.id}:${multipleChoice(filter.op)}`}
                      field={field}
                      value={filter.value}
                      multiple={multipleChoice(filter.op)}
                      catalog={catalogs[field.config.target_form_id ?? ""]}
                      label={`Filter ${index + 1} related records`}
                      invalid={!!issues[index]}
                      onChange={(value) => update(index, { ...filter, value })}
                    />
                  ) : field?.type === "boolean" ? (
                    <select
                      aria-label={`Filter ${index + 1} value`}
                      value={String(filter.value)}
                      onChange={(e) => update(index, { ...filter, value: e.target.value === "true" })}
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  ) : (
                    <input
                      aria-label={`Filter ${index + 1} value`}
                      aria-invalid={!!issues[index]}
                      required
                      type={
                        field?.type === "date"
                          ? "date"
                          : field?.type === "url" && filter.op !== "contains"
                            ? "url"
                            : ["integer", "duration"].includes(field?.type ?? "")
                              ? "number"
                              : "text"
                      }
                      step="1"
                      min={field?.type === "duration" ? 0 : undefined}
                      value={filter.value == null ? "" : String(filter.value)}
                      placeholder={field?.type === "date_time" ? "2026-10-16T09:00:00Z" : "Enter a value…"}
                      onChange={(e) => {
                        const raw = e.target.value;
                        update(index, {
                          ...filter,
                          value: raw !== "" && ["integer", "duration"].includes(field?.type ?? "") ? Number(raw) : raw,
                        });
                      }}
                    />
                  )}
                </div>
              )}
              <button
                type="button"
                className="icon-button filter-remove"
                aria-label={`Remove filter ${index + 1}`}
                onClick={() => {
                  setDraft((old) => old.filter((_, i) => i !== index));
                  setIssues({});
                }}
              >
                <Trash2 size={14} />
              </button>
              {issues[index] && (
                <p className="field-error filter-rule-error" role="alert">
                  {issues[index]}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="text-button filter-add"
        disabled={!fields.length || draft.length >= 20}
        onClick={() => {
          if (fields[0]) {
            setDraft([...draft, newCondition(fields[0])]);
          }
        }}
      >
        <Plus size={14} />
        Add condition
      </button>
      <div className="filter-actions">
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setDraft([]);
            setIssues({});
            onChange([]);
          }}
        >
          Clear
        </button>
        <button type="submit" className="button primary small">
          <Check size={13} />
          Apply filters
        </button>
      </div>
    </form>
  );
}
