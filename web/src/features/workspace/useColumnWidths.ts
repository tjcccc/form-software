import { useRef, useState } from "react";
import { api, message } from "../../api/client";
import type { View } from "../../api/types";
type Write = { viewId: string; fieldId: string; width: number };
export function useColumnWidths(onSaved: (view: View, fieldId: string, width: number) => void) {
  const queue = useRef(Promise.resolve());
  const sequence = useRef(0);
  const latest = useRef(new Map<string, number>());
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<Record<string, Write & { error: string }>>({});
  const [saved, setSaved] = useState(false);
  function persist(write: Write) {
    const key = `${write.viewId}:${write.fieldId}`;
    const version = ++sequence.current;
    latest.current.set(key, version);
    setPending((n) => n + 1);
    setFailed((old) => Object.fromEntries(Object.entries(old).filter(([id]) => id !== key)));
    queue.current = queue.current.then(async () => {
      try {
        const view = await api.updateColumnWidth(write.viewId, write.fieldId, write.width);
        onSaved(view, write.fieldId, write.width);
        setSaved(true);
      } catch (error) {
        if (latest.current.get(key) === version) setFailed((old) => ({ ...old, [key]: { ...write, error: message(error) } }));
      } finally {
        setPending((n) => n - 1);
      }
    });
  }
  const failures = Object.values(failed);
  return { pending, saved, error: failures.map((f) => f.error).join(" "), persist, retry: () => failures.forEach(persist) };
}
