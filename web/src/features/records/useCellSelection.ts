import type { KeyboardEvent, PointerEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  cellKey,
  type CellRef,
  type CellSelection,
  contains,
  type GridAxes,
  isSingle,
  move,
  rangeOf,
  reconcile,
  sameCell,
  selectAll,
  selectColumn,
  single,
} from "./cellSelection";

const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
// Airtable-style select-first grid: a click selects, a click on the already selected cell (or Enter/F2/typing) edits.
// `onEdit` receives the typed character when typing started the edit, or "" when an input method is composing.
export function useCellSelection({
  axes,
  editing,
  onEdit,
}: {
  axes: GridAxes;
  editing: boolean;
  onEdit: (cell: CellRef, element: HTMLElement, typed?: string) => void;
}) {
  const [stored, setStored] = useState<CellSelection>();
  const selection = reconcile(stored, axes);
  const range = selection && rangeOf(selection, axes);
  const elements = useRef(new Map<string, HTMLElement>());
  const press = useRef<{ key: string; wasSelected: boolean; moved: boolean }>(undefined);
  const dragging = useRef(false);
  const pending = useRef<"anchor" | "focus">(undefined);
  useEffect(() => {
    const release = () => {
      dragging.current = false;
    };
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    return () => {
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", release);
    };
  }, []);
  useLayoutEffect(() => {
    const target = pending.current;
    pending.current = undefined;
    if (!target || !selection) {
      return;
    }
    const anchor = elements.current.get(cellKey(selection.anchor));
    anchor?.focus({ preventScroll: true });
    elements.current.get(cellKey(selection[target]))?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  function select(next: CellSelection | undefined, focus: "anchor" | "focus" = "anchor") {
    if (next) {
      pending.current = focus;
      setStored(next);
    }
  }
  function cellProps(cell: CellRef, row: number, col: number) {
    const key = cellKey(cell);
    const active = sameCell(selection?.anchor, cell);
    return {
      ref: (element: HTMLElement | null) => {
        if (element) {
          elements.current.set(key, element);
        } else {
          elements.current.delete(key);
        }
      },
      tabIndex: active || (!selection && row === 0 && col === 0) ? 0 : -1,
      "data-selected": (range && contains(range, row, col)) || undefined,
      "data-active": active || undefined,
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) {
          return;
        }
        // While a cell is being edited, its editor saves first and then hands focus to this cell. Only these two
        // cases block the default, which would also suppress the mousedown that closes open popovers.
        if (editing) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && selection) {
          // Keep focus on the anchor; a focus change would collapse the range.
          event.preventDefault();
          press.current = undefined;
          setStored({ anchor: selection.anchor, focus: cell });
          return;
        }
        press.current = { key, wasSelected: !!selection && isSingle(selection) && active, moved: false };
        dragging.current = true;
        setStored(single(cell));
        event.currentTarget.focus({ preventScroll: true });
      },
      onPointerEnter: () => {
        if (dragging.current && press.current && !editing) {
          press.current.moved = true;
          setStored((old) => (old ? { anchor: old.anchor, focus: cell } : old));
        }
      },
      onFocus: () => {
        if (!editing && !active) {
          setStored(single(cell));
        }
      },
      onClick: (event: { currentTarget: HTMLElement }) => {
        const pressed = press.current;
        press.current = undefined;
        if (pressed?.key === key && pressed.wasSelected && !pressed.moved && !editing) {
          onEdit(cell, event.currentTarget);
        }
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (editing || !selection) {
          return;
        }
        const shortcut = event.metaKey || event.ctrlKey;
        const arrow = arrows[event.key];
        if (arrow) {
          event.preventDefault();
          select(
            move(selection, axes, arrow[0], arrow[1], { extend: event.shiftKey, jump: shortcut }),
            event.shiftKey ? "focus" : "anchor",
          );
        } else if (event.key === "Tab") {
          const next = move(selection, axes, 0, event.shiftKey ? -1 : 1);
          if (!sameCell(next.anchor, selection.anchor)) {
            event.preventDefault();
            select(next);
          }
        } else if (event.key === "Enter" || event.key === "F2") {
          // Buttons would also activate on Enter/Space; the grid owns those keys.
          event.preventDefault();
          onEdit(selection.anchor, event.currentTarget);
        } else if (event.key === " ") {
          event.preventDefault();
        } else if (event.key === "Escape" && !isSingle(selection)) {
          event.preventDefault();
          select(single(selection.anchor));
        } else if (shortcut && event.key.toLowerCase() === "a") {
          event.preventDefault();
          select(selectAll(axes));
        } else if (event.nativeEvent.isComposing || event.key === "Process" || event.keyCode === 229) {
          event.preventDefault();
          onEdit(selection.anchor, event.currentTarget, "");
        } else if (event.key.length === 1 && !shortcut && !event.altKey) {
          event.preventDefault();
          onEdit(selection.anchor, event.currentTarget, event.key);
        }
      },
    };
  }
  return {
    selection,
    range,
    cellProps,
    selectColumn: (fieldId: string) => select(selectColumn(axes, fieldId)),
    // Selects a cell without editing it, for example after an editor saves and hands over focus.
    selectCell: (cell: CellRef) => select(single(cell)),
  };
}
