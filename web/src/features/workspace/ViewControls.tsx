import { ArrowDown, ArrowUp, Check, ChevronDown, Columns3, Filter, Group, ListFilter, Plus, Save, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { message } from "../../api/client";
import type { FormSchema, View, ViewConfig } from "../../api/types";
import { FieldIcon } from "../../components/Icons";
import { Popover } from "../../components/Popover";
import { clampColumnWidth, columnLayouts, maxColumnWidth, minColumnWidth } from "./columns";
export function ViewControls({
  schema,
  views,
  viewId,
  config,
  onView,
  onChange,
  onSaved,
  onDesigner,
  onNotice,
  onResize,
  onFilter,
}: {
  schema: FormSchema;
  views: View[];
  viewId: string;
  config: ViewConfig;
  onView: (id: string) => void;
  onChange: (config: ViewConfig) => void;
  onSaved: (name: string) => Promise<void>;
  onDesigner: () => void;
  onNotice: (message: string) => void;
  onResize: (fieldId: string, width: number) => void;
  onFilter: () => void;
}) {
  const [viewName, setViewName] = useState("");
  const [busy, setBusy] = useState(false);
  const fields = schema.fields.filter((f) => !f.archived_at);
  const current = views.find((v) => v.id === viewId);
  const changed = current && JSON.stringify(current.config) !== JSON.stringify(config);
  async function save(name: string) {
    setBusy(true);
    try {
      await onSaved(name);
      onNotice("View saved.");
      setViewName("");
    } catch (e) {
      onNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="view-controls">
      <Popover
        label={
          <>
            <ListFilter size={15} />
            <span>{current?.name ?? "All records"}</span>
            {changed && <span className="unsaved-dot" title="Unsaved view changes" />}
            <ChevronDown size={12} />
          </>
        }
      >
        <p className="popover-label">SAVED VIEWS</p>
        {views.map((view) => (
          <button className="menu-item" key={view.id} onClick={() => onView(view.id)}>
            <span>{view.name}</span>
            {viewId === view.id && <Check size={14} />}
          </button>
        ))}
        <div className="popover-divider" />
        <form
          className="save-view-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save(viewName);
          }}
        >
          <input
            aria-label="New view name"
            placeholder="Name a new view…"
            required
            maxLength={100}
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
          />
          <button className="icon-button" aria-label="Save new view" disabled={busy || !viewName.trim()}>
            <Plus size={15} />
          </button>
        </form>
        {changed && current && (
          <button className="menu-item" disabled={busy} onClick={() => void save(current.name)}>
            <Save size={14} />
            Save changes to this view
          </button>
        )}
      </Popover>
      <span className="toolbar-divider" />
      <button type="button" className={`tool-button ${config.filters.length ? "active" : ""}`} aria-haspopup="dialog" onClick={onFilter}>
        <Filter size={14} />
        <span>Filter</span>
        {config.filters.length > 0 && <span className="control-count">{config.filters.length}</span>}
      </button>
      <Popover
        active={!!config.sort}
        label={
          <>
            <SlidersHorizontal size={14} />
            <span>Sort</span>
            {config.sort && <span className="control-count">1</span>}
          </>
        }
      >
        <p className="popover-label">SORT RECORDS</p>
        <div className="popover-fields">
          <select
            aria-label="Sort field"
            value={config.sort?.field_id ?? ""}
            onChange={(e) =>
              onChange({
                ...config,
                sort: e.target.value ? { field_id: e.target.value, descending: config.sort?.descending ?? false } : null,
              })
            }
          >
            <option value="">Manual row order</option>
            {fields.map((f) => (
              <option value={f.id} key={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {config.sort && (
            <select
              aria-label="Sort direction"
              value={String(config.sort.descending)}
              onChange={(e) => onChange({ ...config, sort: { field_id: config.sort!.field_id, descending: e.target.value === "true" } })}
            >
              <option value="false">Ascending ↑</option>
              <option value="true">Descending ↓</option>
            </select>
          )}
        </div>
      </Popover>
      <Popover
        active={!!config.group_by}
        label={
          <>
            <Group size={14} />
            <span>Group</span>
            {config.group_by && <span className="control-count">1</span>}
          </>
        }
      >
        <p className="popover-label">GROUP RECORDS</p>
        <select
          aria-label="Group field"
          value={config.group_by ?? ""}
          onChange={(e) => onChange({ ...config, group_by: e.target.value || null })}
        >
          <option value="">No grouping</option>
          {fields.map((f) => (
            <option value={f.id} key={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <p className="picker-hint">Groups cover the filtered collection. Multi-record relations group by their complete set of links.</p>
      </Popover>
      <Popover
        label={
          <>
            <Columns3 size={15} />
            <span>Fields</span>
          </>
        }
      >
        <p className="popover-label">VISIBLE FIELDS</p>
        <div className="column-settings">
          {[...fields]
            .sort((a, b) => {
              const ai = config.columns.findIndex((c) => c.field_id === a.id);
              const bi = config.columns.findIndex((c) => c.field_id === b.id);
              return (ai === -1 ? 1000 + a.position : ai) - (bi === -1 ? 1000 + b.position : bi);
            })
            .map((field, index, ordered) => {
              const column = columnLayouts(schema, config).find((c) => c.field_id === field.id);
              const hidden = column?.hidden ?? index >= 6;
              function update(patch: Partial<ViewConfig["columns"][number]>) {
                const columns = ordered.map(
                  (f, i) =>
                    config.columns.find((c) => c.field_id === f.id) ?? {
                      field_id: f.id,
                      hidden: i >= 6,
                      width: f.key === "name" ? 350 : 156,
                    },
                );
                onChange({ ...config, columns: columns.map((c) => (c.field_id === field.id ? { ...c, ...patch } : c)) });
              }
              function move(delta: number) {
                const columns = ordered.map(
                  (f, i) =>
                    config.columns.find((c) => c.field_id === f.id) ?? {
                      field_id: f.id,
                      hidden: i >= 6,
                      width: f.key === "name" ? 350 : 156,
                    },
                );
                [columns[index], columns[index + delta]] = [columns[index + delta], columns[index]];
                onChange({ ...config, columns });
              }
              return (
                <div className="column-setting" key={field.id}>
                  <label>
                    <input type="checkbox" checked={!hidden} onChange={() => update({ hidden: !hidden })} />
                    <FieldIcon type={field.type} config={field.config} />
                    <span>{field.name}</span>
                  </label>
                  <input
                    className="width-input"
                    type="number"
                    aria-label={`${field.name} column width`}
                    key={`${field.id}:${column?.width}`}
                    defaultValue={column?.width ?? 156}
                    min={minColumnWidth}
                    max={maxColumnWidth}
                    step={10}
                    onBlur={(e) => {
                      const next = clampColumnWidth(Number(e.currentTarget.value));
                      e.currentTarget.value = String(next);
                      if (next !== column?.width) {
                        onResize(field.id, next);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                  />
                  <button
                    className="icon-button"
                    aria-label={`Move ${field.name} column up`}
                    disabled={index === 0}
                    onClick={() => move(-1)}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Move ${field.name} column down`}
                    disabled={index === ordered.length - 1}
                    onClick={() => move(1)}
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
              );
            })}
        </div>
        <div className="popover-divider" />
        <button className="menu-item" onClick={onDesigner}>
          <SlidersHorizontal size={14} />
          Edit form structure
        </button>
      </Popover>
    </div>
  );
}
