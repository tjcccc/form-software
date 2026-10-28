import { useCallback, useEffect, useRef, useState } from "react";

import { aborted, api, message } from "../../api/client";
import type { Catalogs, DataRecord, FormSchema, RelationCatalog, View, ViewConfig } from "../../api/types";
import { relationIds } from "../records/values";
import { clampColumnWidth, withColumnWidth } from "./columns";
import { type LoadedRecords, loadRecords } from "./loadRecords";
import { useColumnWidths } from "./useColumnWidths";
export const emptyView: ViewConfig = { columns: [], filters: [], sort: null, group_by: null, freeze_first: true, open_at_end: false };
export function useWorkspace(formId: string) {
  const [schema, setSchema] = useState<FormSchema>();
  const [views, setViews] = useState<View[]>([]);
  const [config, setConfig] = useState<ViewConfig>(emptyView);
  const [viewId, setViewId] = useState("");
  const [page, setPage] = useState<LoadedRecords>({ records: [], groups: [], total: 0, next_cursor: null, truncated: false });
  const [catalogs, setCatalogs] = useState<Catalogs>({});
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  // Bumped once per opened view whose saved setting asks to start at the last row.
  const [endRequest, setEndRequest] = useState(0);
  const shown = useRef("");
  const opened = useRef("");
  const viewState = useRef({ viewId, openAtEnd: !!config.open_at_end });
  useEffect(() => {
    viewState.current = { viewId, openAtEnd: !!config.open_at_end };
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const widths = useColumnWidths((view, fieldId, width) => {
    if (!schema) {
      return;
    }
    setViews((old) => old.map((v) => (v.id === view.id ? { ...v, config: withColumnWidth(schema, v.config, fieldId, width) } : v)));
  });
  function resizeColumn(fieldId: string, width: number) {
    if (!schema || !viewId) {
      return;
    }
    const next = clampColumnWidth(width);
    setConfig((old) => withColumnWidth(schema, old, fieldId, next));
    widths.persist({ viewId, fieldId, width: next });
  }
  const { filters, sort, group_by: groupBy } = config;
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.schema(formId, controller.signal), api.views(formId, controller.signal)])
      .then(([next, saved]) => {
        setSchema(next);
        setViews(saved);
        if (!viewId && saved.length) {
          setViewId(saved[0].id);
          setConfig(saved[0].config);
        }
      })
      .catch((e) => {
        if (!aborted(e)) {
          setError(message(e));
          setLoading(false);
        }
      });
    return () => controller.abort();
    // A view selection does not reload schema. Refresh preserves unsaved view adjustments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, revision]);
  useEffect(() => {
    if (!schema) {
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (search) {
      params.set("q", search);
    }
    if (filters.length) {
      params.set("filter", JSON.stringify(filters));
    }
    if (groupBy) {
      params.set("group_by", groupBy);
    }
    if (sort) {
      params.set("sort", sort.field_id);
      params.set("descending", String(sort.descending));
    }
    // Loading mirrors this external request lifecycle, including refetches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    // A refresh swaps in the complete result at once, so the scroll position and cell selection survive it. A new
    // query shows its first page while the rest loads.
    const key = `${formId}?${params}`;
    loadRecords(
      (cursor, limit) => {
        const chunk = new URLSearchParams(params);
        chunk.set("cursor", String(cursor));
        chunk.set("limit", String(limit));
        return api.records(formId, chunk, controller.signal);
      },
      controller.signal,
      (first) => {
        if (shown.current !== key) {
          setPage(first);
        }
      },
    )
      .then((loaded) => {
        setPage(loaded);
        shown.current = key;
        const view = `${formId}:${viewState.current.viewId}`;
        if (opened.current !== view) {
          opened.current = view;
          if (viewState.current.openAtEnd) {
            setEndRequest((n) => n + 1);
          }
        }
      })
      .catch((e) => {
        if (!aborted(e)) {
          setError(message(e));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [schema, formId, search, filters, sort, groupBy, revision]);
  useEffect(() => {
    if (!schema) {
      return;
    }
    const controller = new AbortController();
    const targets = [
      ...new Set(
        schema.fields
          .filter((f) => f.type === "relation" && !f.archived_at)
          .map((f) => f.config.target_form_id)
          .filter((id): id is string => !!id),
      ),
    ];
    Promise.all(
      targets.map(async (id): Promise<[string, RelationCatalog]> => {
        const [targetSchema, targetPage] = await Promise.all([
          api.schema(id, controller.signal),
          api.records(id, new URLSearchParams({ limit: "500" }), controller.signal),
        ]);
        const referenced = schema.fields
          .filter((f) => f.config.target_form_id === id)
          .flatMap((f) => page.records.flatMap((r) => relationIds(r.values[f.id])));
        const missing = [...new Set(referenced)].filter((recordId) => !targetPage.records.some((r) => r.id === recordId));
        const extra = await Promise.all(missing.map((recordId) => api.record(recordId, controller.signal)));
        return [id, { schema: targetSchema, records: [...targetPage.records, ...extra] }];
      }),
    )
      .then((entries) => setCatalogs(Object.fromEntries(entries)))
      .catch((e) => {
        if (!aborted(e)) {
          setError(`Related records: ${message(e)}`);
        }
      });
    return () => controller.abort();
  }, [schema, page.records, revision]);
  function changeConfig(next: ViewConfig) {
    setConfig(next);
  }
  function selectView(id: string) {
    const view = views.find((v) => v.id === id);
    if (view) {
      setViewId(id);
      changeConfig(view.config);
    }
  }
  async function saveView(name: string) {
    const view = await api.saveView(formId, name, config);
    setViews((old) => [...old.filter((v) => v.id !== view.id), view]);
    setViewId(view.id);
  }
  return {
    schema,
    views,
    config,
    viewId,
    page,
    catalogs,
    query,
    setQuery,
    endRequest,
    loading,
    error,
    refresh,
    replaceRecord: (record: DataRecord) =>
      setPage((old) => ({ ...old, records: old.records.map((r) => (r.id === record.id ? record : r)) })),
    changeConfig,
    selectView,
    saveView,
    resizeColumn,
    widths,
  };
}
