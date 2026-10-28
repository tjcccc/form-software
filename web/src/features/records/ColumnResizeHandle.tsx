import { useEffect, useRef, useState } from "react";

import { clampColumnWidth, maxColumnWidth, minColumnWidth } from "../workspace/columns";
export function ColumnResizeHandle({
  name,
  width,
  disabled,
  onPreview,
  onCommit,
  onCancel,
}: {
  name: string;
  width: number;
  disabled: boolean;
  onPreview: (width: number) => void;
  onCommit: (width: number) => void;
  onCancel: () => void;
}) {
  const gesture = useRef<{ startX: number; original: number; width: number; pointerId?: number } | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) {
      return;
    }
    document.documentElement.classList.add("resizing-column");
    return () => document.documentElement.classList.remove("resizing-column");
  }, [dragging]);
  function preview(value: number) {
    const next = clampColumnWidth(value);
    if (gesture.current) {
      gesture.current.width = next;
    }
    onPreview(next);
  }
  function finish(cancel = false) {
    const current = gesture.current;
    gesture.current = undefined;
    setDragging(false);
    if (current && !cancel && current.width !== current.original) {
      onCommit(current.width);
    }
    onCancel();
  }
  return (
    <div
      role="separator"
      aria-label={`Resize ${name} column`}
      aria-orientation="vertical"
      aria-valuemin={minColumnWidth}
      aria-valuemax={maxColumnWidth}
      aria-valuenow={Math.round(width)}
      aria-valuetext={`${Math.round(width)} pixels`}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      className={`column-resize-handle ${dragging ? "dragging" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.focus({ preventScroll: true });
        gesture.current = { startX: e.clientX, original: width, width, pointerId: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (gesture.current?.pointerId === e.pointerId) {
          preview(gesture.current.original + e.clientX - gesture.current.startX);
        }
      }}
      onPointerUp={(e) => {
        if (gesture.current?.pointerId === e.pointerId) {
          finish();
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onPointerCancel={() => finish(true)}
      onLostPointerCapture={() => {
        if (gesture.current?.pointerId !== undefined) {
          finish(true);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(true);
          return;
        }
        if (disabled || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        gesture.current ??= { startX: 0, original: width, width };
        preview(
          e.key === "Home"
            ? minColumnWidth
            : e.key === "End"
              ? maxColumnWidth
              : gesture.current.width + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 50 : 10),
        );
      }}
      onKeyUp={(e) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) && gesture.current?.pointerId === undefined) {
          finish();
        }
      }}
      onBlur={() => {
        if (gesture.current && gesture.current.pointerId === undefined) {
          finish();
        }
      }}
    />
  );
}
