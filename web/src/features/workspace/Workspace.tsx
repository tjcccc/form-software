import {
  ArrowDownToLine,
  ChevronRight,
  CircleHelp,
  Command,
  House,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Table2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DataRecord, Form, Session } from "../../api/types";
import { Dialog, ErrorNotice } from "../../components/Dialog";
import { Popover } from "../../components/Popover";
import { FilterEditor } from "../filters/FilterEditor";
import { newCondition } from "../filters/filterRules";
import { CsvImport } from "../records/CsvImport";
import { RecordInspector } from "../records/RecordInspector";
import { RecordTable } from "../records/RecordTable";
import { formatDuration } from "../records/values";
import { FieldDialog } from "../schema/FieldDialog";
import { SchemaDesigner } from "../schema/SchemaDesigner";
import { useFieldActions } from "./useFieldActions";
import { useWorkspace } from "./useWorkspace";
import { ViewControls } from "./ViewControls";
export function Workspace({
  formId,
  forms,
  session,
  onFormsChanged,
  onNavigateForm,
}: {
  formId: string;
  forms: Form[];
  session: Session;
  onFormsChanged: () => void;
  onNavigateForm: (id: string) => void;
}) {
  const state = useWorkspace(formId);
  const { schema, page, config, catalogs, loading } = state;
  const [inspecting, setInspecting] = useState<DataRecord | null | undefined>();
  const [designer, setDesigner] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [help, setHelp] = useState(false);
  const [notice, setNotice] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const onClose = () => setInspecting(undefined);
  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      // The grid claims keys it handles (typing on a selected cell edits it), so they do not trigger shortcuts.
      if (
        event.defaultPrevented ||
        editing ||
        target.closest(".inline-cell-editor, .record-context-menu") ||
        document.querySelector("dialog[open]") ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key.toLowerCase() === "n" && inspecting === undefined) {
        event.preventDefault();
        setInspecting(null);
      }
      if (event.key === "?") {
        event.preventDefault();
        setHelp(true);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [inspecting]);
  function changed() {
    state.refresh();
    onFormsChanged();
  }
  function select(record: DataRecord) {
    if (inspecting && inspecting.id !== record.id) {
      setNotice("Close the current record before opening another.");
      return;
    }
    if (inspecting === null) {
      setNotice("Save or close your new record first.");
      return;
    }
    setInspecting(record);
  }
  const fields = useFieldActions({
    schema,
    config,
    onConfig: state.changeConfig,
    onChanged: changed,
    onNavigate: onNavigateForm,
    onNotice: setNotice,
    blocked: inspecting !== undefined,
  });
  const duration = schema?.fields.find((f) => f.type === "duration" && !f.archived_at);
  const totalMinutes = duration
    ? page.records.reduce((total, r) => total + (typeof r.values[duration.id] === "number" ? (r.values[duration.id] as number) : 0), 0)
    : 0;
  const form = schema?.form ?? forms.find((f) => f.id === formId);
  return (
    <main className="workspace">
      <header className="workspace-topbar">
        <div className="breadcrumbs">
          <House size={13} />
          <span>{session.workspace.name}</span>
          <ChevronRight size={11} />
          <strong>{form?.name ?? "Loading"}</strong>
        </div>
        <div className="topbar-actions">
          <span className={`connection-status ${state.error ? "has-error" : ""}`}>
            <span />
            {state.error ? "Needs attention" : loading ? "Updating" : "Connected"}
          </span>
          <span className="toolbar-divider" />
          <button className="icon-button" aria-label="Keyboard shortcuts" onClick={() => setHelp(true)}>
            <CircleHelp size={16} />
          </button>
        </div>
      </header>
      <div className="workspace-content">
        <section className="form-heading">
          <div>
            <div className="form-eyebrow">
              <span className="eyebrow">{form?.kind === "options" ? "OPTION LIST" : "YOUR COLLECTION"}</span>
              <span className="form-index">/{String(Math.max(1, forms.findIndex((f) => f.id === formId) + 1)).padStart(2, "0")}</span>
            </div>
            <h1>
              {form?.name ?? "Opening your workspace…"}
              <span className="heading-period">.</span>
            </h1>
            <p>{form?.description || "A place to keep the details that matter."}</p>
          </div>
          <div className="heading-actions">
            <button className="button" disabled={!schema || inspecting !== undefined} onClick={() => setImporting(true)}>
              <ArrowDownToLine size={15} />
              Import
            </button>
            <button className="button primary" disabled={!schema || inspecting !== undefined} onClick={() => setInspecting(null)}>
              <Plus size={16} />
              New record<kbd>N</kbd>
            </button>
          </div>
        </section>
        <section className="data-workspace" aria-label="Records">
          <div className="table-tabs">
            <div className="table-tab">
              <Table2 size={15} />
              <span>Table</span>
              <span className="tab-count">{page.total}</span>
            </div>
            <div className="table-tabs-right">
              <div
                className={`column-width-status ${state.widths.error ? "has-error" : ""}`}
                role={state.widths.error ? "alert" : "status"}
              >
                {state.widths.pending ? (
                  "Saving widths…"
                ) : state.widths.error ? (
                  <>
                    <span title={state.widths.error}>Width not saved</span>
                    <button className="text-button" onClick={state.widths.retry}>
                      Retry
                    </button>
                  </>
                ) : state.widths.saved ? (
                  "Widths saved"
                ) : null}
              </div>
              <button className="text-button" disabled={!schema || inspecting !== undefined} onClick={() => setDesigner(true)}>
                <Settings2 size={14} />
                Edit structure
              </button>
              <Popover align="right" label={<MoreHorizontal size={18} />}>
                <button className="menu-item" onClick={state.refresh}>
                  <RefreshCw size={14} />
                  Refresh records
                </button>
                <button className="menu-item" onClick={() => setHelp(true)}>
                  <Command size={14} />
                  Keyboard shortcuts
                </button>
              </Popover>
            </div>
          </div>
          <div className="table-toolbar">
            {schema ? (
              <ViewControls
                schema={schema}
                views={state.views}
                viewId={state.viewId}
                config={config}
                onView={state.selectView}
                onChange={state.changeConfig}
                onSaved={state.saveView}
                onResize={state.resizeColumn}
                onDesigner={() => {
                  if (inspecting === undefined) {
                    setDesigner(true);
                  } else {
                    setNotice("Close the record before changing its schema.");
                  }
                }}
                onNotice={setNotice}

                onFilter={() => setFiltering(true)}
              />
            ) : (
              <span className="eyebrow">LOADING SCHEMA…</span>
            )}
            <div className="table-search">
              <Search size={14} />
              <input
                ref={searchRef}
                value={state.query}
                onChange={(e) => state.setQuery(e.target.value)}
                placeholder="Search records…"
                aria-label="Search records"
              />
              {state.query ? (
                <button className="icon-button" aria-label="Clear search" onClick={() => state.setQuery("")}>
                  <X size={12} />
                </button>
              ) : (
                <kbd>/</kbd>
              )}
            </div>
          </div>
          {state.error && (
            <div className="workspace-error">
              <ErrorNotice>
                {state.error}
                <button className="text-button" onClick={state.refresh}>
                  Retry
                </button>
              </ErrorNotice>
            </div>
          )}
          <div className="table-and-inspector">
            {schema && (
              <RecordTable
                schema={schema}
                records={page.records}
                config={config}
                catalogs={catalogs}
                loading={loading}
                selectedId={inspecting?.id}
                endRequest={state.endRequest}
                onSelect={select}
                onNew={() => {
                  if (inspecting === undefined) {
                    setInspecting(null);
                  } else {
                    setNotice("Close the current record first.");
                  }
                }}
                groups={page.groups}
                onFieldAction={(field, action) => void fields.action(field, action)}
                onAddField={fields.add}
                editingBlocked={inspecting !== undefined}
                canResize={!!state.viewId}
                onResize={state.resizeColumn}
                onSaved={state.replaceRecord}
                onChanged={changed}
                onNotice={setNotice}
              />
            )}
            {schema && inspecting !== undefined && (
              <RecordInspector
                key={inspecting?.id ?? "new"}
                schema={schema}
                initial={inspecting}
                catalogs={catalogs}
                onClose={onClose}
                onSaved={() => {
                  changed();
                }}
                onArchived={() => {
                  onClose();
                  changed();
                  setNotice("Record archived.");
                }}
              />
            )}
          </div>
          <footer className="table-footer">
            <div className="table-summary">
              <span className="footer-square" />
              <strong>{page.total}</strong>
              <span>{page.total === 1 ? "record" : "records"}</span>
              {duration && (
                <>
                  <span className="footer-separator" />
                  <span>Duration</span>
                  <strong>{formatDuration(totalMinutes)}</strong>
                </>
              )}
            </div>
            {page.truncated && (
              <div className="load-limit" role="status">
                Showing the first {page.records.length.toLocaleString()} of {page.total.toLocaleString()}. Filter the view to see the rest.
              </div>
            )}
          </footer>
        </section>
        <footer className="workspace-bottom">
          <span>STRUCTURE FOR THE EVERYDAY.</span>
          <span>
            FormSoftware <span className="bottom-slash">/</span> 0.6.0
          </span>
        </footer>
      </div>
      {schema && fields.dialog && (
        <FieldDialog
          formId={formId}
          forms={forms}
          state={fields.dialog}
          onClose={() => fields.setDialog(undefined)}
          onSaved={(field) => fields.placed(field, fields.dialog?.anchor, fields.dialog?.before)}
        />
      )}
      {schema && (filtering || fields.filterField) && (
        <Dialog
          wide
          title={fields.filterField ? `Filter by ${fields.filterField.name}.` : "Filter records."}
          eyebrow="FILTER RECORDS"
          onClose={() => {
            setFiltering(false);
            fields.setFilterField(undefined);
          }}
        >
          <div className="filter-dialog-body">
            <FilterEditor
              fields={schema.fields.filter((f) => !f.archived_at)}
              filters={
                !fields.filterField || config.filters.some((f) => f.field_id === fields.filterField?.id)
                  ? config.filters
                  : [...config.filters, newCondition(fields.filterField)]
              }
              catalogs={catalogs}
              onChange={(filters) => {
                state.changeConfig({ ...config, filters });
                setFiltering(false);
                fields.setFilterField(undefined);
              }}
            />
          </div>
        </Dialog>
      )}
      {schema && designer && (
        <SchemaDesigner
          schema={schema}
          forms={forms}
          onClose={() => setDesigner(false)}
          onChanged={changed}
          onArchived={() => {
            setDesigner(false);
            changed();
          }}
        />
      )}
      {schema && importing && (
        <CsvImport
          schema={schema}
          onClose={() => setImporting(false)}
          onImported={(count) => {
            setImporting(false);
            changed();
            setNotice(`${count} records imported.`);
          }}
        />
      )}
      {help && (
        <Dialog title="Keep your hands on the keys." eyebrow="KEYBOARD SHORTCUTS" onClose={() => setHelp(false)}>
          <div className="shortcut-list">
            {[
              ["Find a record", "/"],
              ["Create a record", "N"],
              ["Save the open record / note cell", "⌘ / Ctrl + Enter"],
              ["Save cell / edit next cell", "Enter / Tab"],
              ["Copy / cut / paste cells", "⌘ / Ctrl + C / X / V"],
              ["Clear selected cells", "Delete"],
              ["Record actions", "Shift + F10"],
              ["Close a panel", "Esc"],
              ["Show this guide", "?"],
            ].map(([label, shortcut]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{shortcut}</kbd>
              </div>
            ))}
          </div>
          <p className="shortcut-note">
            Click a cell to select it; click it again, press Enter, or start typing to edit. Arrow keys move, Shift extends the selection,
            and Escape cancels an edit. Right-click a row for its editor and record actions.
          </p>
        </Dialog>
      )}
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice("")}>
            <X size={13} />
          </button>
        </div>
      )}
    </main>
  );
}
