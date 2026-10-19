import { Save } from "lucide-react";
import { useState } from "react";

import { api, message } from "../../api/client";
import type { Field, Form } from "../../api/types";
import { Dialog, ErrorNotice } from "../../components/Dialog";
import { machineKey } from "../records/values";
import { useFieldSettings } from "./fieldDefinitions";
import { FieldSettings } from "./FieldSettings";
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
  const settings = useFieldSettings(state.field);
  const { type } = settings;
  const [required, setRequired] = useState(state.field?.required ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      const field = state.field
        ? await api.updateField(state.field.id, {
            name,
            description,
            required,
            config: !state.descriptionOnly && ["integer", "decimal"].includes(type) ? settings.config : undefined,
          })
        : await api.createField(formId, {
            name,
            description,
            key: `${machineKey(name).slice(0, 48)}_${crypto.randomUUID().slice(0, 8)}`,
            type,
            required: type === "attachment" ? false : required,
            position: state.anchor ? state.anchor.position + (state.before ? 0 : 1) : undefined,
            config: settings.config,
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
        if (!busy) {
          onClose();
        }
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
              <FieldSettings settings={settings} forms={forms} prefix="column" existing={!!state.field} />
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
