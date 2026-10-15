import { useRef, useState } from "react";
import { ArrowRight, Check, Download, FileUp, Upload, X } from "lucide-react";
import { api, message } from "../../api/client";
import type { FormSchema, ImportPreview, ImportRequest } from "../../api/types";
import { Dialog, ErrorNotice } from "../../components/Dialog";
import { machineKey } from "./values";
export function CsvImport({
  schema,
  onClose,
  onImported,
}: {
  schema: FormSchema;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ImportPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const fields = schema.fields.filter((f) => !f.archived_at && f.type !== "attachment");
  function input(): ImportRequest {
    return {
      form_id: schema.form.id,
      csv,
      mapping: Object.entries(mapping)
        .filter(([, id]) => id)
        .map(([column, field_id]) => ({ column, field_id })),
    };
  }
  async function load(file?: File) {
    if (!file) {
      return;
    }
    if (file.size > 1024 * 1024) {
      setError("CSV files must be 1 MB or smaller.");
      return;
    }
    setBusy(true);
    setError("");
    setPreview(undefined);
    try {
      const source = await file.text();
      const result = await api.previewImport({ form_id: schema.form.id, csv: source, mapping: [] });
      setCsv(source);
      setFilename(file.name);
      setColumns(result.columns);
      const next = Object.fromEntries(
        result.columns.map((column) => [
          column,
          fields.find((f) => machineKey(f.name) === machineKey(column) || f.key === machineKey(column))?.id ?? "",
        ]),
      );
      setMapping(next);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function validate() {
    setBusy(true);
    setError("");
    try {
      setPreview(await api.previewImport(input()));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setError("");
    try {
      const result = await api.commitImport(input());
      onImported(result.created);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function report() {
    if (!preview) {
      return;
    }
    const rows = [
      "row,field,error",
      ...preview.rows.flatMap((row) =>
        row.issues.map((issue) =>
          [row.row, schema.fields.find((f) => f.id === issue.field_id)?.name ?? "", issue.message]
            .map((v) => `"${String(v).replaceAll('"', '""')}"`)
            .join(","),
        ),
      ),
    ];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "import-errors.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const invalid = preview?.rows.filter((row) => row.issues.length) ?? [];
  return (
    <Dialog
      title="Bring your records along."
      eyebrow="CSV IMPORT"
      wide
      onClose={() => {
        if (!busy) {
          onClose();
        }
      }}
    >
      <div className="import-body">
        <p className="dialog-intro">Map your columns, review every row, then import into {schema.form.name}.</p>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            void load(e.target.files?.[0]);
          }}
        />
        <button className="import-dropzone" disabled={busy} onClick={() => fileRef.current?.click()}>
          <FileUp size={25} strokeWidth={1.3} />
          <strong>{filename || "Choose a CSV file"}</strong>
          <span>{filename ? "Choose another file" : "Up to 500 records · 1 MB · UTF-8"}</span>
        </button>
        {columns.length > 0 && (
          <>
            <div className="section-heading">
              <h3>Column mapping</h3>
              <span className="eyebrow">CSV COLUMN → FORM FIELD</span>
            </div>
            <div className="import-mappings">
              {columns.map((column) => (
                <div key={column} className="import-mapping">
                  <span>{column}</span>
                  <ArrowRight size={14} />
                  <select
                    aria-label={`Map ${column}`}
                    disabled={busy}
                    value={mapping[column] ?? ""}
                    onChange={(e) => {
                      setMapping((old) => ({ ...old, [column]: e.target.value }));
                      setPreview(undefined);
                    }}
                  >
                    <option value="">Skip this column</option>
                    {fields.map((f) => (
                      <option key={f.id} value={f.id} disabled={Object.entries(mapping).some(([key, id]) => key !== column && id === f.id)}>
                        {f.name}
                        {f.required ? " *" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="import-guidance">
              Dates: YYYY-MM-DD. Durations: whole minutes. Relations: exact existing names or record UUIDs; separate multiple values with{" "}
              <code>|</code>. Import adds new records.
            </div>
          </>
        )}
        {preview && (
          <div className={`import-preview ${preview.valid ? "valid" : "invalid"}`}>
            <div className="import-preview-heading">
              {preview.valid ? <Check size={18} /> : <X size={18} />}
              <strong>
                {preview.valid
                  ? `${preview.rows.length} records ready to import`
                  : `${invalid.length} of ${preview.rows.length} rows need attention`}
              </strong>
            </div>
            {invalid.length > 0 && (
              <>
                <ul className="import-errors">
                  {invalid.slice(0, 8).map((row) => (
                    <li key={row.row}>
                      <span>Row {row.row}</span>
                      <div>
                        {row.issues.map((issue, i) => (
                          <p key={i}>
                            {schema.fields.find((f) => f.id === issue.field_id)?.name}: {issue.message}
                          </p>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
                <button className="text-button" onClick={report}>
                  <Download size={13} />
                  Download full error report
                </button>
              </>
            )}
            {preview.valid && <p>All rows validated. Related records resolved without creating new choices.</p>}
          </div>
        )}
      </div>
      <footer className="dialog-footer">
        <button className="button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        {preview?.valid ? (
          <button className="button primary" disabled={busy} onClick={() => void commit()}>
            <Upload size={14} />
            {busy ? "Importing…" : `Import ${preview.rows.length} records`}
          </button>
        ) : (
          <button className="button primary" disabled={busy || !columns.length} onClick={() => void validate()}>
            <Check size={14} />
            {busy ? "Checking…" : "Validate & preview"}
          </button>
        )}
      </footer>
    </Dialog>
  );
}
