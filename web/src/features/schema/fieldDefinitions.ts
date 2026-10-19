import { useState } from "react";

import type { Field, FieldType } from "../../api/types";
export type Config = Field["config"];
export const choices = {
  short_text: "Short text",
  long_text: "Long text",
  number: "Number",
  rating: "Rating",
  boolean: "Checkbox",
  date: "Date",
  date_time: "Date & time",
  duration: "Duration",
  url: "URL",
  single: "Single select",
  multiple: "Multiple select",
  relation: "Link to another record",
  attachment: "Attachment",
};
export type Kind = keyof typeof choices;
export function fieldKind(field: Field): Kind {
  if (field.config.rating) {
    return "rating";
  }
  if (field.type === "integer" || field.type === "decimal") {
    return "number";
  }
  if (field.type === "relation" && field.config.presentation === "select") {
    return field.config.cardinality === "many" ? "multiple" : "single";
  }
  return field.type as Kind;
}
export function fieldLabel(field: Field) {
  return choices[fieldKind(field)];
}
export function useFieldSettings(field?: Field) {
  const [kind, setKind] = useState<Kind>(field ? fieldKind(field) : "short_text");
  const [storage, setStorage] = useState<"integer" | "decimal">(field?.type === "integer" ? "integer" : "decimal");
  const [config, setConfig] = useState<Config>(field?.config ?? {});
  const type: FieldType =
    kind === "number" ? storage : kind === "rating" ? "integer" : kind === "single" || kind === "multiple" ? "relation" : kind;
  const resolved: Config =
    kind === "rating"
      ? { rating: config.rating ?? { max: 5, icon: "star", color: "ochre" } }
      : kind === "number"
        ? config
        : type === "relation"
          ? {
              target_form_id: config.target_form_id,
              cardinality: kind === "multiple" ? "many" : kind === "single" ? "one" : (config.cardinality ?? "one"),
              presentation: kind === "relation" ? "record_picker" : "select",
            }
          : {};
  return {
    kind,
    type,
    config: resolved,
    storage,
    setStorage,
    setConfig,
    setKind: (next: Kind) => {
      setKind(next);
      setConfig({});
    },
  };
}
