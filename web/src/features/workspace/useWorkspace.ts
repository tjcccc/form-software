import { useCallback, useEffect, useState } from "react";
import { api, aborted, message } from "../../api/client";
import type { Catalogs, RelationCatalog, FormSchema, RecordPage, View, ViewConfig } from "../../api/types";
import { relationIds } from "../records/values";
export const emptyView: ViewConfig = { columns: [], filters: [], sort: null };
export function useWorkspace(formId: string) {
  const [schema, setSchema] = useState<FormSchema>();
  const [views, setViews] = useState<View[]>([]);
  const [config, setConfig] = useState<ViewConfig>(emptyView);
  const [viewId, setViewId] = useState("");
  const [page, setPage] = useState<RecordPage>({ records: [], total: 0, next_cursor: null });
  const [catalogs, setCatalogs] = useState<Catalogs>({});
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query);
      setCursor(0);
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
    const params = new URLSearchParams({ limit: "50", cursor: String(cursor) });
    if (search) {
      params.set("q", search);
    }
    if (config.filters.length) {
      params.set("filter", JSON.stringify(config.filters));
    }
    if (config.sort) {
      params.set("sort", config.sort.field_id);
      params.set("descending", String(config.sort.descending));
    }
    // Loading mirrors this external request lifecycle, including refetches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    api
      .records(formId, params, controller.signal)
      .then(setPage)
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
  }, [schema, formId, search, cursor, config, revision]);
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
          api.records(id, new URLSearchParams({ limit: "100" }), controller.signal),
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
    setCursor(0);
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
    cursor,
    setCursor,
    loading,
    error,
    refresh,
    changeConfig,
    selectView,
    saveView,
  };
}
