import type { ClipboardEvent, CompositionEvent, InputEvent, KeyboardEvent, PointerEvent } from "react";
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
// Keyboard focus sits in a hidden text field inside the active cell, so input methods can compose there and
// clipboard events fire in every browser. `onEdit` receives the typed or composed text when typing started the edit.
export function useCellSelection({
  axes,
  editing,
  onEdit,
  onCopy,
  onPaste,
  onClear,
}: {
  axes: GridAxes;
  editing: boolean;
  onEdit: (cell: CellRef, element: HTMLElement, typed?: string) => void;
  onCopy?: (data: DataTransfer, cut: boolean) => void;
  onPaste?: (data: DataTransfer) => void;
  onClear?: () => void;
}) {
  const [stored, setStored] = useState<CellSelection>();
  const [composing, setComposing] = useState(false);
  const selection = reconcile(stored, axes);
  const range = selection && rangeOf(selection, axes);
  const elements = useRef(new Map<string, HTMLElement>());
  const input = useRef<HTMLTextAreaElement>(null);
  const composition = useRef(false);
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
    const anchor = selection && elements.current.get(cellKey(selection.anchor));
    // Hand focus to the hidden field after keyboard moves, and after an editor returns focus to its cell.
    if (!editing && input.current && (target || document.activeElement === anchor)) {
      input.current.focus({ preventScroll: true });
    }
    if (target && selection) {
      elements.current.get(cellKey(selection[target]))?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  });
  function select(next: CellSelection | undefined, focus: "anchor" | "focus" = "anchor") {
    if (next) {
      pending.current = focus;
      setStored(next);
    }
  }
  function startEdit(typed?: string) {
    const anchor = selection && elements.current.get(cellKey(selection.anchor));
    if (selection && anchor) {
      onEdit(selection.anchor, anchor, typed);
    }
  }
  function takeTyped(field: HTMLTextAreaElement) {
    const text = field.value;
    field.value = "";
    if (text) {
      startEdit(text);
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
      tabIndex: !selection && row === 0 && col === 0 ? 0 : -1,
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
          // Keep focus in the anchor's field; a focus change would collapse the range.
          event.preventDefault();
          press.current = undefined;
          setStored({ anchor: selection.anchor, focus: cell });
          return;
        }
        press.current = { key, wasSelected: !!selection && isSingle(selection) && active, moved: false };
        dragging.current = true;
        pending.current = "anchor";
        setStored(single(cell));
      },
      onPointerEnter: () => {
        if (dragging.current && press.current && !editing) {
          press.current.moved = true;
          setStored((old) => (old ? { anchor: old.anchor, focus: cell } : old));
        }
      },
      onFocus: () => {
        if (editing) {
          return;
        }
        if (active) {
          input.current?.focus({ preventScroll: true });
        } else {
          select(single(cell));
        }
      },
      onClick: () => {
        const pressed = press.current;
        press.current = undefined;
        if (pressed?.key === key && pressed.wasSelected && !pressed.moved && !editing) {
          startEdit();
        }
      },
    };
  }
  function clipboard(event: ClipboardEvent<HTMLTextAreaElement>, cut: boolean) {
    event.preventDefault();
    event.currentTarget.value = "";
    if (selection && onCopy) {
      onCopy(event.clipboardData, cut);
    }
  }
  // Props for the hidden field rendered inside the active cell while it is not being edited.
  function inputProps(label: string) {
    return {
      ref: input,
      "aria-label": label,
      rows: 1,
      autoCapitalize: "off",
      autoComplete: "off",
      spellCheck: false,
      // Writing assistants attach to text fields; this one is only a keyboard target.
      "data-gramm": "false",
      "data-gramm_editor": "false",
      "data-enable-grammarly": "false",
      "data-composing": composing || undefined,
      onCompositionStart: () => {
        composition.current = true;
        setComposing(true);
      },
      onCompositionEnd: (event: CompositionEvent<HTMLTextAreaElement>) => {
        composition.current = false;
        setComposing(false);
        takeTyped(event.currentTarget);
      },
      // Clipboard events reach the hidden field in every browser. The field itself never takes pasted text.
      onCopy: (event: ClipboardEvent<HTMLTextAreaElement>) => clipboard(event, false),
      onCut: (event: ClipboardEvent<HTMLTextAreaElement>) => clipboard(event, true),
      onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => {
        event.preventDefault();
        if (selection && !composition.current) {
          onPaste?.(event.clipboardData);
        }
      },
      onInput: (event: InputEvent<HTMLTextAreaElement>) => {
        if (!composition.current) {
          takeTyped(event.currentTarget);
        }
      },
      onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
        // Keys that confirm or navigate an input-method candidate belong to the input method. Safari reports some of
        // them only through the legacy 229 key code.
        if (editing || !selection || composition.current || event.nativeEvent.isComposing || event.keyCode === 229) {
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
          event.preventDefault();
          startEdit();
        } else if (event.key === " " && !shortcut) {
          // Reserved for expanding the record, as in Airtable; a space never starts an edit.
          event.preventDefault();
        } else if (event.key === "Escape") {
          // Escape collapses a range, then clears the selection so workspace shortcuts work again.
          event.preventDefault();
          if (isSingle(selection)) {
            event.currentTarget.blur();
            setStored(undefined);
          } else {
            select(single(selection.anchor));
          }
        } else if (shortcut && event.key.toLowerCase() === "a") {
          event.preventDefault();
          select(selectAll(axes));
        } else if (shortcut && ["c", "x"].includes(event.key.toLowerCase())) {
          // Safari fires copy and cut only when the field has selected text, so give it a placeholder to copy.
          const field = event.currentTarget;
          field.value = " ";
          field.select();
          window.setTimeout(() => {
            field.value = "";
          });
        } else if ((event.key === "Delete" || event.key === "Backspace") && !shortcut && !event.altKey) {
          event.preventDefault();
          onClear?.();
        }
      },
    };
  }
  return {
    selection,
    range,
    cellProps,
    inputProps,
    selectColumn: (fieldId: string) => select(selectColumn(axes, fieldId)),
    selectCells: (anchor: CellRef, focus: CellRef) => select({ anchor, focus }),
  };
}
