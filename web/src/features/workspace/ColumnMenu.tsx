import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Filter,
  Group,
  EyeOff,
  Pencil,
  Pin,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { Field, ViewConfig } from "../../api/types";
import type { ColumnAction } from "./useFieldActions";
export function ColumnMenu({
  field,
  first,
  config,
  anchor,
  x,
  y,
  onAction,
  onClose,
}: {
  field: Field;
  first: boolean;
  config: ViewConfig;
  anchor: HTMLElement;
  x: number;
  y: number;
  onAction: (action: ColumnAction) => void;
  onClose: () => void;
}) {
  const [position, setPosition] = useState({ x, y });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    const outside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const origin = anchor.getBoundingClientRect();
    const move = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      if (!anchor.isConnected) {
        onClose();
        return;
      }
      const rect = anchor.getBoundingClientRect();
      setPosition({ x: x + rect.left - origin.left, y: y + rect.bottom - origin.bottom });
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("scroll", move, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("scroll", move, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, anchor, x, y]);
  function close() {
    onClose();
    anchor.focus({ preventScroll: true });
  }
  const items: { action: ColumnAction; label: string; Icon: LucideIcon; disabled?: boolean; checked?: boolean; divider?: boolean }[] = [
    { action: "freeze", label: "Freeze column", Icon: Pin, disabled: !first, checked: first && config.freeze_first !== false },
    {
      action: "edit",
      label: field.type === "relation" ? "Edit form for field" : "Edit field",
      Icon: field.type === "relation" ? ExternalLink : Pencil,
    },
    ...(field.type === "relation" ? [{ action: "settings" as const, label: "Field settings", Icon: Pencil }] : []),
    { action: "duplicate", label: "Duplicate field", Icon: Copy, divider: true },
    { action: "left", label: "Insert left", Icon: ArrowLeft },
    { action: "right", label: "Insert right", Icon: ArrowRight },
    { action: "description", label: "Edit field description", Icon: AlignLeft, divider: true },
    {
      action: "ascending",
      label: "Sort First → Last",
      Icon: ArrowDown,
      divider: true,
      checked: config.sort?.field_id === field.id && !config.sort.descending,
    },
    {
      action: "descending",
      label: "Sort Last → First",
      Icon: ArrowUp,
      checked: config.sort?.field_id === field.id && config.sort.descending,
    },
    { action: "filter", label: "Filter by this field", Icon: Filter, divider: true },
    { action: "group", label: config.group_by === field.id ? "Ungroup this field" : "Group by this field", Icon: Group },
    { action: "hide", label: "Hide field", Icon: EyeOff, divider: true },
    { action: "delete", label: "Delete field", Icon: Trash2, disabled: field.key === "name" },
  ];
  return createPortal(
    <div
      ref={ref}
      className="column-menu"
      role="menu"
      aria-label={`${field.name} column actions`}
      style={{
        left: Math.max(8, Math.min(position.x, window.innerWidth - 270)),
        top: Math.max(8, Math.min(position.y, window.innerHeight - 560)),
        maxHeight: window.innerHeight - 16,
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          buttons[
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
          ]?.focus();
        }
        if (e.key === "Escape" || e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <p className="popover-label">{field.name.toUpperCase()}</p>
      {items.map(({ action, label, Icon, disabled, checked, divider }) => (
        <button
          key={action}
          type="button"
          role={checked !== undefined ? "menuitemcheckbox" : "menuitem"}
          aria-checked={checked}
          disabled={disabled}
          title={action === "freeze" && !first ? "Only the first visible data column can be frozen." : undefined}
          className={`menu-item ${divider ? "menu-divider" : ""} ${action === "delete" ? "danger" : ""}`}
          onClick={() => {
            close();
            onAction(action);
          }}
        >
          <Icon size={14} />
          <span>{label}</span>
          {checked && <Check size={13} />}
        </button>
      ))}
    </div>,
    document.body,
  );
}
