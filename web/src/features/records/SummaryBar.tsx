import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Catalogs, ColumnLayout, DataRecord, Field, Summary } from "../../api/types";
import { summarize, summaryLabels, summaryOptions } from "./summaries";

// The bar under the grid: one summary per column over every loaded row of the view, chosen per column and saved with
// the view like other column settings. It shares the grid's column widths and frozen first column.
export function SummaryBar({
  fields,
  layouts,
  records,
  catalogs,
  freezeFirst,
  width,
  widthOf,
  disabled,
  onChange,
}: {
  fields: Field[];
  layouts: ColumnLayout[];
  records: DataRecord[];
  catalogs: Catalogs;
  freezeFirst: boolean;
  width: number;
  widthOf: (field: Field) => number;
  disabled: boolean;
  onChange: (fieldId: string, summary: Summary | null) => void;
}) {
  const [menu, setMenu] = useState<{ field: Field; anchor: HTMLElement }>();
  return (
    <div className="summary-bar" role="region" aria-label="Column summaries">
      <table className={`record-table summary-table ${freezeFirst ? "freeze-first" : ""}`} style={{ width, minWidth: 0 }}>
        <colgroup>
          <col className="row-number-col" />
          {fields.map((f) => (
            <col key={f.id} style={{ width: widthOf(f) }} />
          ))}
          <col className="table-end-col" />
        </colgroup>
        <tbody>
          <tr>
            <td className="row-index" />
            {fields.map((field, index) => {
              const summary = layouts.find((c) => c.field_id === field.id)?.summary ?? undefined;
              return (
                <td key={field.id} className={index === 0 ? "first-data-column" : undefined}>
                  <button
                    type="button"
                    className="summary-button"
                    data-empty={!summary || undefined}
                    aria-haspopup="menu"
                    aria-label={`${field.name} summary: ${summary ? summaryLabels[summary] : "none"}`}
                    disabled={disabled}
                    onClick={(event) => setMenu({ field, anchor: event.currentTarget })}
                  >
                    {summary ? (
                      <>
                        <span className="summary-kind">{summaryLabels[summary]}</span>
                        <strong>{summarize(field, records, summary, catalogs)}</strong>
                      </>
                    ) : (
                      <span className="summary-kind">Summarize</span>
                    )}
                  </button>
                </td>
              );
            })}
            <td />
          </tr>
        </tbody>
      </table>
      {menu && (
        <SummaryMenu
          field={menu.field}
          anchor={menu.anchor}
          current={layouts.find((c) => c.field_id === menu.field.id)?.summary ?? null}
          onChoose={(summary) => onChange(menu.field.id, summary)}
          onClose={() => setMenu(undefined)}
        />
      )}
    </div>
  );
}
function SummaryMenu({
  field,
  anchor,
  current,
  onChoose,
  onClose,
}: {
  field: Field;
  anchor: HTMLElement;
  current: Summary | null;
  onChoose: (summary: Summary | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rect = anchor.getBoundingClientRect();
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("[aria-checked='true']")?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("scroll", outside, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("scroll", outside, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  function close() {
    onClose();
    anchor.focus({ preventScroll: true });
  }
  const options: (Summary | null)[] = [null, ...summaryOptions(field)];
  return createPortal(
    <div
      ref={ref}
      className="column-menu summary-menu"
      role="menu"
      aria-label={`${field.name} summary`}
      // The bar sits at the bottom of the grid, so the menu opens upward from its cell.
      style={{ left: Math.max(8, Math.min(rect.left, window.innerWidth - 230)), bottom: Math.max(8, window.innerHeight - rect.top + 4) }}
      onKeyDown={(event) => {
        const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>("button")];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <p className="popover-label">{field.name.toUpperCase()} SUMMARY</p>
      {options.map((option) => (
        <button
          key={option ?? "none"}
          type="button"
          role="menuitemradio"
          aria-checked={option === current}
          className="menu-item"
          onClick={() => {
            close();
            if (option !== current) {
              onChoose(option);
            }
          }}
        >
          <span>{option ? summaryLabels[option] : "None"}</span>
          {option === current && <Check size={13} />}
        </button>
      ))}
    </div>,
    document.body,
  );
}
