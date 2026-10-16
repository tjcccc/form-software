import type { Form } from "../../api/types";
import { choices, type Config, type Kind, type useFieldSettings } from "./fieldDefinitions";
export function FieldSettings({
  settings: s,
  forms,
  prefix,
  existing = false,
}: {
  settings: ReturnType<typeof useFieldSettings>;
  forms: Form[];
  prefix: string;
  existing?: boolean;
}) {
  const update = (patch: Partial<Config>) => s.setConfig({ ...s.config, ...patch });
  const rating = s.config.rating;
  return (
    <>
      <div className="field-group">
        <label htmlFor={`${prefix}-type`}>Type</label>
        <select id={`${prefix}-type`} value={s.kind} disabled={existing} onChange={(e) => s.setKind(e.target.value as Kind)}>
          {Object.entries(choices).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {s.kind === "number" && (
        <>
          <div className="field-two-col">
            <div className="field-group">
              <label htmlFor={`${prefix}-precision`}>Precision</label>
              <select
                id={`${prefix}-precision`}
                disabled={existing}
                value={s.storage}
                onChange={(e) => s.setStorage(e.target.value as "integer" | "decimal")}
              >
                <option value="integer">Whole number</option>
                <option value="decimal">Decimal</option>
              </select>
            </div>
            <div className="field-group">
              <label htmlFor={`${prefix}-format`}>Display</label>
              <select
                id={`${prefix}-format`}
                value={s.config.number_format ?? "plain"}
                onChange={(e) =>
                  update({
                    number_format: e.target.value as Config["number_format"],
                    currency: e.target.value === "currency" ? (s.config.currency ?? "USD") : null,
                  })
                }
              >
                <option value="plain">Number</option>
                <option value="currency">Currency</option>
                <option value="percent">Percent</option>
              </select>
            </div>
          </div>
          <div className="field-two-col">
            <div className="field-group">
              <label htmlFor={`${prefix}-places`}>Decimal places</label>
              <input
                id={`${prefix}-places`}
                type="number"
                min={0}
                max={8}
                step={1}
                value={s.config.decimal_places ?? (s.storage === "integer" ? 0 : 2)}
                onChange={(e) => update({ decimal_places: Number(e.target.value) })}
              />
            </div>
            {s.config.number_format === "currency" && (
              <div className="field-group">
                <label htmlFor={`${prefix}-currency`}>Currency code</label>
                <input
                  id={`${prefix}-currency`}
                  required
                  pattern="[A-Z]{3}"
                  maxLength={3}
                  value={s.config.currency ?? "USD"}
                  onChange={(e) => update({ currency: e.target.value.toUpperCase() })}
                />
              </div>
            )}
          </div>
          <p className="field-hint">Formatting changes presentation only. Percent values use percentage points: 25 displays as 25%.</p>
        </>
      )}
      {rating && (
        <div className="field-two-col">
          <div className="field-group">
            <label htmlFor={`${prefix}-maximum`}>Maximum rating</label>
            <input
              id={`${prefix}-maximum`}
              type="number"
              required
              min={1}
              max={10}
              step={1}
              value={rating.max}
              onChange={(e) => update({ rating: { ...rating, max: Number(e.target.value) } })}
            />
          </div>
          <div className="field-group">
            <label htmlFor={`${prefix}-icon`}>Rating icon</label>
            <select
              id={`${prefix}-icon`}
              value={rating.icon}
              onChange={(e) => update({ rating: { ...rating, icon: e.target.value as typeof rating.icon } })}
            >
              {["star", "heart", "thumbs_up", "flag", "circle"].map((icon) => (
                <option key={icon} value={icon}>
                  {icon.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor={`${prefix}-color`}>Rating color</label>
            <select
              id={`${prefix}-color`}
              value={rating.color}
              onChange={(e) => update({ rating: { ...rating, color: e.target.value as typeof rating.color } })}
            >
              {["ochre", "red", "purple", "blue", "green"].map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {s.type === "relation" && !existing && (
        <>
          <div className="field-group">
            <label htmlFor={`${prefix}-target`}>{s.kind === "relation" ? "Linked form" : "Option list"}</label>
            <select
              id={`${prefix}-target`}
              required
              value={s.config.target_form_id ?? ""}
              onChange={(e) => update({ target_form_id: e.target.value })}
            >
              <option value="">Choose a form…</option>
              {forms
                .filter((f) => s.kind === "relation" || f.kind === "options")
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
            <span className="field-hint">
              {s.kind === "relation"
                ? "Link records from any form, including this one."
                : "Create reusable option lists under Configuration → New form."}
            </span>
          </div>
          {s.kind === "relation" && (
            <label className="checkbox-control">
              <input
                type="checkbox"
                checked={s.config.cardinality === "many"}
                onChange={(e) => update({ cardinality: e.target.checked ? "many" : "one" })}
              />
              Allow multiple records
            </label>
          )}
        </>
      )}
      {existing && <span className="field-hint">Storage types and relation targets stay fixed to preserve stored data.</span>}
    </>
  );
}
