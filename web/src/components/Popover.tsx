import { useEffect, useRef, useState, type ReactNode } from "react";
export function Popover({
  label,
  children,
  active = false,
  align = "left",
}: {
  label: ReactNode;
  children: ReactNode;
  active?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const click = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", click);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="popover-root" ref={ref}>
      <button className={`tool-button ${active ? "active" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && <div className={`popover popover-${align}`}>{children}</div>}
    </div>
  );
}
