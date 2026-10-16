import { useState } from "react";
import { ArrowDown, ArrowUp, Archive, Plus, Save } from "lucide-react";
import { api, message } from "../../api/client";
import type { CreateField, Field, Form, FormSchema } from "../../api/types";
import { Dialog, ErrorNotice } from "../../components/Dialog";
import { FieldIcon, FormIcon } from "../../components/Icons";
import { machineKey } from "../records/values";
import { FieldSettings } from "./FieldSettings";
import { useFieldSettings, fieldLabel } from "./fieldDefinitions";
export function CreateFormDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (schema: FormSchema) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("table");
  const [kind, setKind] = useState<"standard" | "options">("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      const schema = await api.createForm({ name, key: machineKey(name), description, icon, kind });
      onCreated(schema);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Make room for something."
      eyebrow="NEW FORM"
      onClose={() => {
        if (!busy) {
          onClose();
        }
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <p className="dialog-intro">A form defines the structure. Records hold the details.</p>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <fieldset disabled={busy} className="dialog-fields">
          <div className="field-group">
            <label htmlFor="form-name">Form name</label>
            <input
              id="form-name"
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Reading Log"
            />
          </div>
          <div className="field-group">
            <label htmlFor="form-description">
              Description <span className="optional">optional</span>
            </label>
            <textarea
              id="form-description"
              rows={3}
              value={description}
              maxLength={4000}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What belongs here?"
            />
          </div>
          <div className="field-group">
            <label>Icon</label>
            <div className="icon-options">
              {["table", "briefcase", "gamepad", "folder", "building", "tag", "book"].map((key) => (
                <button type="button" key={key} aria-label={`${key} icon`} aria-pressed={key === icon} onClick={() => setIcon(key)}>
                  <FormIcon icon={key} size={20} />
                </button>
              ))}
            </div>
          </div>
          <div className="field-group">
            <label htmlFor="form-kind">Purpose</label>
            <select id="form-kind" value={kind} onChange={(e) => setKind(e.target.value as "standard" | "options")}>
              <option value="standard">Standard form — logs, projects, collections</option>
              <option value="options">Option list — reusable choices for select fields</option>
            </select>
            <span className="field-hint">Option lists live under Configuration and support colors and disabled choices.</span>
          </div>
        </fieldset>
        <footer className="dialog-footer">
          <button type="button" className="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !name.trim()}>
            <Plus size={15} />
            {busy ? "Creating…" : "Create form"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
export function SchemaDesigner({
  schema,
  forms,
  onClose,
  onChanged,
  onArchived,
}: {
  schema: FormSchema;
  forms: Form[];
  onClose: () => void;
  onChanged: () => void;
  onArchived: () => void;
}) {
  const [fields, setFields] = useState(schema.fields.filter((f) => !f.archived_at));
  const [formName, setFormName] = useState(schema.form.name);
  const [description, setDescription] = useState(schema.form.description);
  const [name, setName] = useState("");
  const [fieldDescription, setFieldDescription] = useState("");
  const settings = useFieldSettings();
  const { type } = settings;
  const [required, setRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function replace(field: Field) {
    setFields((old) =>
      old
        .map((f) => (f.id === field.id ? field : f))
        .filter((f) => !f.archived_at)
        .sort((a, b) => a.position - b.position),
    );
  }
  async function move(field: Field, delta: number) {
    const index = fields.findIndex((f) => f.id === field.id);
    const other = fields[index + delta];
    if (!other) {
      return;
    }
    const updatedOther = await api.updateField(other.id, { position: field.position });
    const updated = await api.updateField(field.id, { position: other.position });
    setFields((old) =>
      old.map((f) => (f.id === updated.id ? updated : f.id === updatedOther.id ? updatedOther : f)).sort((a, b) => a.position - b.position),
    );
  }
  async function add() {
    const input: CreateField = {
      name,
      description: fieldDescription.trim(),
      key: machineKey(name),
      type,
      required: type === "attachment" ? false : required,
      config: settings.config,
    };
    const field = await api.createField(schema.form.id, input);
    setFields((old) => [...old, field]);
    setName("");
    setFieldDescription("");
    setRequired(false);
  }
  return (
    <Dialog
      title="The shape of your records."
      eyebrow="FORM DESIGNER"
      onClose={() => {
        if (!busy) {
          onClose();
        }
      }}
      wide
    >
      <div className="schema-body">
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <form
          className="form-properties"
          onSubmit={(event) => {
            event.preventDefault();
            void action(async () => {
              await api.updateForm(schema.form.id, { name: formName, description });
            });
          }}
        >
          <div className="field-group">
            <label htmlFor="edit-form-name">Form name</label>
            <input id="edit-form-name" value={formName} required onChange={(e) => setFormName(e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="edit-form-description">Description</label>
            <input id="edit-form-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <button className="button small" disabled={busy}>
            <Save size={13} />
            Save details
          </button>
        </form>
        <div className="section-heading">
          <h3>
            Fields <span>{fields.length}</span>
          </h3>
          <span className="eyebrow">SCHEMA IS SHARED ACROSS ALL VIEWS</span>
        </div>
        <div className="schema-field-list">
          {fields.map((field, index) => (
            <FieldRow
              key={field.id}
              field={field}
              index={index}
              total={fields.length}
              disabled={busy}
              onSave={(nextName) => void action(async () => replace(await api.updateField(field.id, { name: nextName })))}
              onRequired={(value) => void action(async () => replace(await api.updateField(field.id, { required: value })))}
              onMove={(delta) => void action(() => move(field, delta))}
              onArchive={() => {
                if (window.confirm(`Archive “${field.name}”? Historical values will be retained.`)) {
                  void action(async () => replace(await api.updateField(field.id, { archived: true })));
                }
              }}
            />
          ))}
        </div>
        <form
          className="add-field-form"
          onSubmit={(event) => {
            event.preventDefault();
            void action(add);
          }}
        >
          <h3>
            <Plus size={15} />
            Add a field
          </h3>
          <fieldset disabled={busy}>
            <div className="field-two-col">
              <div className="field-group">
                <label htmlFor="new-field-name">Name</label>
                <input id="new-field-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Progress" />
              </div>
            </div>
            <FieldSettings settings={settings} forms={forms} prefix="new-field" />
            <div className="field-group">
              <label htmlFor="new-field-description">
                Description <span className="optional">optional</span>
              </label>
              <textarea
                id="new-field-description"
                rows={2}
                maxLength={4000}
                value={fieldDescription}
                onChange={(e) => setFieldDescription(e.target.value)}
                placeholder="Explain the field’s meaning, units, or usage."
              />
              <span className="field-hint">Shown in the column header tooltip and record editor.</span>
            </div>
            {type !== "attachment" && (
              <label className="checkbox-control">
                <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
                Required
              </label>
            )}
            <div className="add-field-footer">
              <span className="field-hint">Field types and machine keys stay stable after creation.</span>
              <button className="button" disabled={busy || !name.trim()}>
                <Plus size={14} />
                Add field
              </button>
            </div>
          </fieldset>
        </form>
        <div className="archive-form">
          <div>
            <strong>Archive form</strong>
            <p>Remove it from navigation and retain its records.</p>
          </div>
          <button
            className="button danger small"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Archive “${schema.form.name}” and hide its records?`)) {
                void action(async () => {
                  await api.updateForm(schema.form.id, { archived: true });
                  onArchived();
                });
              }
            }}
          >
            <Archive size={14} />
            Archive
          </button>
        </div>
      </div>
      <footer className="dialog-footer">
        <span className="field-hint">Schema changes are saved immediately.</span>
        <button className="button primary" disabled={busy} onClick={onClose}>
          Done
        </button>
      </footer>
    </Dialog>
  );
}
function FieldRow({
  field,
  index,
  total,
  disabled,
  onSave,
  onRequired,
  onMove,
  onArchive,
}: {
  field: Field;
  index: number;
  total: number;
  disabled: boolean;
  onSave: (name: string) => void;
  onRequired: (required: boolean) => void;
  onMove: (delta: number) => void;
  onArchive: () => void;
}) {
  const [name, setName] = useState(field.name);
  return (
    <div className="schema-field-row">
      <span className="schema-field-number">{String(index + 1).padStart(2, "0")}</span>
      <FieldIcon type={field.type} config={field.config} />
      <div className="schema-field-name">
        <input
          aria-label={`Rename ${field.name}`}
          value={name}
          disabled={disabled}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== field.name) {
              onSave(name);
            }
          }}
        />
        <span>
          {fieldLabel(field)} <span className="schema-key">/ {field.key}</span>
        </span>
        {field.description && <p className="schema-field-description">{field.description}</p>}
      </div>
      <label className="checkbox-control compact">
        <input
          type="checkbox"
          disabled={disabled || field.key === "name" || field.type === "attachment"}
          checked={field.required}
          onChange={(e) => onRequired(e.target.checked)}
        />
        Required
      </label>
      <div className="schema-field-actions">
        <button className="icon-button" aria-label={`Move ${field.name} up`} disabled={disabled || index === 0} onClick={() => onMove(-1)}>
          <ArrowUp size={13} />
        </button>
        <button
          className="icon-button"
          aria-label={`Move ${field.name} down`}
          disabled={disabled || index === total - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown size={13} />
        </button>
        <button
          className="icon-button"
          aria-label={`Archive ${field.name}`}
          disabled={disabled || field.key === "name"}
          onClick={onArchive}
        >
          <Archive size={13} />
        </button>
      </div>
    </div>
  );
}
