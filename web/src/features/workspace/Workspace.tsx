import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
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
import type { DataRecord, Field, Form, Session } from "../../api/types";
import { useWorkspace } from "./useWorkspace";
import { RecordTable } from "../records/RecordTable";
import { RecordInspector } from "../records/RecordInspector";
import { SchemaDesigner } from "../schema/SchemaDesigner";
import { CsvImport } from "../records/CsvImport";
import { ViewControls } from "./ViewControls";
import { Dialog, ErrorNotice } from "../../components/Dialog";
import { Popover } from "../../components/Popover";
import { formatDuration } from "../records/values";
export function Workspace({
  formId,
  forms,
  session,
  onFormsChanged,
}: {
  formId: string;
  forms: Form[];
  session: Session;
  onFormsChanged: () => void;
}) {
  const state = useWorkspace(formId);
  const { schema, page, config, catalogs, loading } = state;
  const [inspecting, setInspecting] = useState<DataRecord | null | undefined>();
  const [designer, setDesigner] = useState(false);
  const [importing, setImporting] = useState(false);
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
      if (editing || document.querySelector("dialog[open]") || event.ctrlKey || event.metaKey || event.altKey) {
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
  function sort(field: Field) {
    const current = config.sort;
    state.changeConfig({
      ...config,
      sort:
        current?.field_id === field.id
          ? current.descending
            ? null
            : { field_id: field.id, descending: true }
          : { field_id: field.id, descending: false },
    });
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
                catalogs={catalogs}
                onView={state.selectView}
                onChange={state.changeConfig}
                onSaved={state.saveView}
                onDesigner={() => {
                  if (inspecting === undefined) {
                    setDesigner(true);
                  } else {
                    setNotice("Close the record before changing its schema.");
                  }
                }}
                onNotice={setNotice}
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
                offset={state.cursor}
                onSelect={select}
                onNew={() => {
                  if (inspecting === undefined) {
                    setInspecting(null);
                  } else {
                    setNotice("Close the current record first.");
                  }
                }}
                onSort={sort}
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
                  <span>Duration on this page</span>
                  <strong>{formatDuration(totalMinutes)}</strong>
                </>
              )}
            </div>
            <div className="pagination">
              <span>
                {page.records.length ? `${state.cursor + 1}–${state.cursor + page.records.length}` : "0"} of {page.total}
              </span>
              <button
                className="icon-button"
                aria-label="Previous page"
                disabled={loading || state.cursor === 0}
                onClick={() => state.setCursor(Math.max(0, state.cursor - 50))}
              >
                <ArrowLeft size={13} />
              </button>
              <button
                className="icon-button"
                aria-label="Next page"
                disabled={loading || page.next_cursor == null}
                onClick={() => state.setCursor(page.next_cursor ?? 0)}
              >
                <ArrowRight size={13} />
              </button>
            </div>
          </footer>
        </section>
        <footer className="workspace-bottom">
          <span>STRUCTURE FOR THE EVERYDAY.</span>
          <span>
            FormSoftware <span className="bottom-slash">/</span> 0.2
          </span>
        </footer>
      </div>
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
              ["Save the open record", "⌘ / Ctrl + Enter"],
              ["Close a panel", "Esc"],
              ["Show this guide", "?"],
            ].map(([label, shortcut]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{shortcut}</kbd>
              </div>
            ))}
          </div>
          <p className="shortcut-note">Tab moves between controls. Enter opens the focused record.</p>
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
