import type { Field } from "../../api/types";
export function FieldEditor({
  field,
  value,
  onChange,
  autoFocus,
}: {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  autoFocus: boolean;
}) {
  const id = `field-${field.id}`;
  if (field.type === "boolean") {
    return (
      <label className="checkbox-control">
        <input id={id} aria-label={field.name} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span>{value ? "Enabled" : "Disabled"}</span>
      </label>
    );
  }
  if (field.type === "long_text") {
    return (
      <textarea
        id={id}
        aria-label={field.name}
        rows={4}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="Add a note…"
      />
    );
  }
  const type =
    field.type === "date"
      ? "date"
      : field.type === "date_time"
        ? "datetime-local"
        : field.type === "url"
          ? "url"
          : ["integer", "decimal", "duration"].includes(field.type)
            ? "number"
            : "text";
  let display = value == null ? "" : String(value);
  if (field.type === "date_time" && display) {
    const date = new Date(display);
    display = Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  return (
    <div className="input-with-unit">
      <input
        id={id}
        aria-label={field.name}
        type={type}
        autoFocus={autoFocus}
        value={display}
        required={field.required}
        step={field.type === "decimal" ? "any" : 1}
        min={field.type === "duration" ? 0 : undefined}
        maxLength={field.type === "short_text" ? 500 : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(
            raw === ""
              ? null
              : field.type === "integer" || field.type === "duration"
                ? Number(raw)
                : field.type === "date_time"
                  ? new Date(raw).toISOString()
                  : raw,
          );
        }}
        placeholder={field.type === "duration" ? "0" : field.type === "url" ? "https://" : "Enter a value…"}
      />
      {field.type === "duration" && <span className="input-unit">minutes</span>}
    </div>
  );
}
