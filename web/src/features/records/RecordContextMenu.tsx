import { ArrowDown, ArrowUp, Copy, Expand, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
export type RecordAction = "open" | "above" | "below" | "duplicate" | "delete";
export function RecordContextMenu({
  x,
  y,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  onAction: (action: RecordAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const scroll = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  const items = [
    { action: "open", label: "Open Editor", Icon: Expand },
    { action: "above", label: "Insert record above", Icon: ArrowUp },
    { action: "below", label: "Insert record below", Icon: ArrowDown },
    { action: "duplicate", label: "Duplicate record", Icon: Copy },
    { action: "delete", label: "Delete record", Icon: Trash2 },
  ] as const;
  return createPortal(
    <div
      ref={ref}
      className="record-context-menu"
      role="menu"
      aria-label="Record actions"
      style={{ left: Math.max(8, Math.min(x, window.innerWidth - 248)), top: Math.max(8, Math.min(y, window.innerHeight - 228)) }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>("button")];
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
          onClose();
        }
      }}
    >
      <p className="eyebrow">RECORD ACTIONS</p>
      {items.map(({ action, label, Icon }) => (
        <button
          type="button"
          role="menuitem"
          key={action}
          className={`menu-item ${action === "delete" ? "danger" : ""}`}
          onClick={() => onAction(action)}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
