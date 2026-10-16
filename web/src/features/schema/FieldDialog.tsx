import { useState } from "react";
import { Save } from "lucide-react";
import { Dialog, ErrorNotice } from "../../components/Dialog";
import { api, message } from "../../api/client";
import type { Field, FieldType, Form } from "../../api/types";
import { machineKey } from "../records/values";
export type FieldDialogState = { field?: Field; anchor?: Field; before?: boolean; descriptionOnly?: boolean };
export function FieldDialog({
  formId,
  forms,
  state,
  onClose,
  onSaved,
}: {
  formId: string;
  forms: Form[];
  state: FieldDialogState;
  onClose: () => void;
  onSaved: (field: Field) => void;
}) {
  const [name, setName] = useState(state.field?.name ?? "");
  const [description, setDescription] = useState(state.field?.description ?? "");
  const [type, setType] = useState<FieldType>(state.field?.type ?? "short_text");
  const [required, setRequired] = useState(state.field?.required ?? false);
  const [target, setTarget] = useState("");
  const [many, setMany] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      const field = state.field
        ? await api.updateField(state.field.id, { name, description, required })
        : await api.createField(formId, {
            name,
            description,
            key: `${machineKey(name).slice(0, 48)}_${crypto.randomUUID().slice(0, 8)}`,
            type,
            required: type === "attachment" ? false : required,
            position: state.anchor ? state.anchor.position + (state.before ? 0 : 1) : undefined,
            config:
              type === "relation" ? { target_form_id: target, cardinality: many ? "many" : "one", presentation: "record_picker" } : {},
          });
      onSaved(field);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={state.descriptionOnly ? "Describe this field." : state.field ? "Edit field." : "Make room for a field."}
      eyebrow={state.field?.name ?? "NEW FIELD"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <fieldset className="dialog-fields" disabled={busy}>
          {!state.descriptionOnly && (
            <>
              <div className="field-group">
                <label htmlFor="column-name">Field name</label>
                <input id="column-name" autoFocus required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field-group">
                <label htmlFor="column-type">Type</label>
                <select id="column-type" value={type} disabled={!!state.field} onChange={(e) => setType(e.target.value as FieldType)}>
                  {(
                    [
                      "short_text",
                      "long_text",
                      "integer",
                      "decimal",
                      "boolean",
                      "date",
                      "date_time",
                      "duration",
                      "url",
                      "relation",
                      "attachment",
                    ] as FieldType[]
                  ).map((kind) => (
                    <option key={kind} value={kind}>
                      {kind.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                {state.field && <span className="field-hint">Existing types and relation targets stay fixed to preserve stored data.</span>}
              </div>
              {!state.field && type === "relation" && (
                <>
                  <div className="field-group">
                    <label htmlFor="column-target">Linked form</label>
                    <select id="column-target" required value={target} onChange={(e) => setTarget(e.target.value)}>
                      <option value="">Choose a form…</option>
                      {forms.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="checkbox-control">
                    <input type="checkbox" checked={many} onChange={(e) => setMany(e.target.checked)} />
                    Allow multiple records
                  </label>
                </>
              )}
              <label className="checkbox-control">
                <input
                  type="checkbox"
                  checked={required}
                  disabled={type === "attachment" || state.field?.key === "name"}
                  onChange={(e) => setRequired(e.target.checked)}
                />
                Required
              </label>
            </>
          )}
          <div className="field-group">
            <label htmlFor="column-description">
              Description <span className="optional">optional</span>
            </label>
            <textarea
              id="column-description"
              autoFocus={state.descriptionOnly}
              rows={4}
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain its meaning, units, or how it should be used."
            />
            <span className="field-hint">Shown in the column header tooltip and record editor.</span>
          </div>
        </fieldset>
        <footer className="dialog-footer">
          <button type="button" className="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !name.trim()}>
            <Save size={14} />
            {busy ? "Saving…" : "Save field"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
