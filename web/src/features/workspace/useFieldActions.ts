import { useState } from "react";

import { api, message } from "../../api/client";
import type { Field, FormSchema, ViewConfig } from "../../api/types";
import type { FieldDialogState } from "../schema/FieldDialog";
import { columnLayouts, visibleFields } from "./columns";
export type ColumnAction =
  | "freeze"
  | "edit"
  | "settings"
  | "duplicate"
  | "left"
  | "right"
  | "description"
  | "ascending"
  | "descending"
  | "filter"
  | "group"
  | "hide"
  | "delete";
export function useFieldActions({
  schema,
  config,
  onConfig,
  onChanged,
  onNavigate,
  onNotice,
  blocked,
}: {
  schema?: FormSchema;
  config: ViewConfig;
  onConfig: (config: ViewConfig) => void;
  onChanged: () => void;
  onNavigate: (id: string) => void;
  onNotice: (message: string) => void;
  blocked: boolean;
}) {
  const [dialog, setDialog] = useState<FieldDialogState>();
  const [filterField, setFilterField] = useState<Field>();
  const [busy, setBusy] = useState(false);
  function placed(field: Field, anchor?: Field, before = false) {
    if (!schema) {
      return;
    }
    if (anchor || !schema.fields.some((f) => f.id === field.id)) {
      const columns = columnLayouts(schema, config).filter((c) => c.field_id !== field.id);
      const index = anchor ? columns.findIndex((c) => c.field_id === anchor.id) + (before ? 0 : 1) : columns.length;
      columns.splice(index, 0, { field_id: field.id, hidden: false, width: field.type === "long_text" ? 320 : 156 });
      onConfig({ ...config, columns });
    }
    setDialog(undefined);
    onChanged();
  }
  function add() {
    if (!schema || busy) {
      return;
    }
    if (blocked) {
      onNotice("Save or close the record editor first.");
      return;
    }
    setDialog({ anchor: visibleFields(schema, config).at(-1), before: false });
  }
  async function action(field: Field, action: ColumnAction) {
    if (!schema || busy) {
      return;
    }
    if (blocked) {
      onNotice("Save or close the record editor first.");
      return;
    }
    if (action === "freeze") {
      onConfig({ ...config, freeze_first: config.freeze_first === false });
      return;
    }
    if (action === "edit" && field.type === "relation" && field.config.target_form_id) {
      onNavigate(field.config.target_form_id);
      return;
    }
    if (["edit", "settings", "description"].includes(action)) {
      setDialog({ field, descriptionOnly: action === "description" });
      return;
    }
    if (action === "left" || action === "right") {
      setDialog({ anchor: field, before: action === "left" });
      return;
    }
    if (action === "ascending" || action === "descending") {
      onConfig({ ...config, sort: { field_id: field.id, descending: action === "descending" } });
      return;
    }
    if (action === "filter") {
      setFilterField(field);
      return;
    }
    if (action === "group") {
      onConfig({ ...config, group_by: config.group_by === field.id ? null : field.id });
      return;
    }
    if (action === "hide") {
      onConfig({ ...config, columns: columnLayouts(schema, config).map((c) => (c.field_id === field.id ? { ...c, hidden: true } : c)) });
      return;
    }
    if (
      action === "delete" &&
      !window.confirm(`Delete “${field.name}” from this form? The field will be archived and historical values retained.`)
    ) {
      return;
    }
    setBusy(true);
    try {
      if (action === "duplicate") {
        placed(await api.duplicateField(field.id), field);
      } else if (action === "delete") {
        await api.updateField(field.id, { archived: true });
        onConfig({
          ...config,
          columns: config.columns.filter((c) => c.field_id !== field.id),
          filters: config.filters.filter((f) => f.field_id !== field.id),
          sort: config.sort?.field_id === field.id ? null : config.sort,
          group_by: config.group_by === field.id ? null : config.group_by,
        });
        onChanged();
      }
    } catch (e) {
      onNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  return { dialog, setDialog, filterField, setFilterField, busy, action, placed, add };
}
