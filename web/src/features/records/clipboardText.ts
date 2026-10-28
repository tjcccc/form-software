import type { Catalogs, DataRecord, Field } from "../../api/types";
import { formatDuration, relationIds, titleOf } from "./values";

// Text that spreadsheets and other apps understand. Values stay plain (ISO dates, unformatted numbers) so a
// pasted copy round-trips; relations copy as names, falling back to IDs for records outside the loaded catalog.
export function copyText(field: Field, record: DataRecord, catalogs: Catalogs): string {
  const value = record.values[field.id];
  if (field.type === "attachment") {
    return record.attachments
      .filter((a) => a.field_id === field.id)
      .map((a) => a.filename)
      .join(", ");
  }
  if (value == null || value === "") {
    return "";
  }
  if (field.type === "relation") {
    const catalog = catalogs[field.config.target_form_id ?? ""];
    return relationIds(value)
      .map((id) => {
        const related = catalog?.records.find((r) => r.id === id);
        return related && catalog ? titleOf(related, catalog.schema) : id;
      })
      .join(", ");
  }
  if (field.type === "duration") {
    return formatDuration(value);
  }
  if (field.type === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}
// Tab-separated rows, quoting cells that contain tabs, line breaks, or quotes, as spreadsheets do.
export function toTsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => (/[\t\n\r"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join("\t")).join("\n");
}
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let start = true;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && start) {
      quoted = true;
      start = false;
    } else if (char === "\t") {
      row.push(cell);
      cell = "";
      start = true;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i++;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      start = true;
    } else {
      cell += char;
      start = false;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
export type ParsedCell = { value: unknown } | { labels: string[] } | { error: string };
// Converts pasted text into a candidate value for the field. The server still validates every value; this only
// understands the formats people paste (display formats, spreadsheet numbers, and this grid's own copies).
export function parseText(field: Field, raw: string): ParsedCell {
  const text = field.type === "long_text" ? raw.replace(/^\s+|\s+$/g, "") : raw.trim();
  if (field.type === "boolean") {
    if (/^(true|yes|y|1|checked|x|✓|✔)$/i.test(text)) {
      return { value: true };
    }
    return /^(false|no|n|0|unchecked)?$/i.test(text) ? { value: false } : { error: `“${text}” is not yes or no.` };
  }
  if (!text || text === "—") {
    return { value: field.type === "relation" ? [] : null };
  }
  switch (field.type) {
    case "short_text":
      return { value: text.replace(/\s*[\r\n]+\s*/g, " ") };
    case "long_text":
    case "url":
      return { value: text };
    case "integer": {
      const number = plainNumber(field.config.rating ? text.replace(/\s*\/\s*\d+$/, "") : text);
      return number != null && /^-?\d+$/.test(number) ? { value: Number(number) } : { error: `“${text}” is not a whole number.` };
    }
    case "decimal": {
      const number = plainNumber(text);
      return number != null && /^-?\d+(\.\d+)?$/.test(number) ? { value: number } : { error: `“${text}” is not a number.` };
    }
    case "duration": {
      const minutes = parseDuration(text);
      return minutes == null ? { error: `“${text}” is not a duration, such as 1h 30m or 1:30.` } : { value: minutes };
    }
    case "date": {
      const date = parseDate(text);
      return date ? { value: date } : { error: `“${text}” is not a date.` };
    }
    case "date_time": {
      const time = new Date(text);
      return Number.isNaN(time.getTime()) ? { error: `“${text}” is not a date and time.` } : { value: time.toISOString() };
    }
    case "relation":
      return { labels: field.config.cardinality === "one" ? [text] : splitLabels(text) };
    default:
      return { error: "Files cannot be pasted into cells." };
  }
}
// Names copied from a multi-link cell are comma-separated; a name that itself contains a comma still resolves
// because the whole text is tried as one label first.
export function splitLabels(text: string) {
  return [...new Set(text.split(/[,\n|]/).map((part) => part.trim()))].filter(Boolean);
}
function plainNumber(text: string) {
  // Accepts the grid's own display formats: "USD 1,234.50", "$12", "50%".
  const match = /^(?:[A-Z]{3}\s+)?[$€£¥]?\s*([+-]?(?:\d[\d,]*)?\.?\d+)\s*%?$/.exec(text);
  return match ? match[1].replace(/,/g, "").replace(/^\+/, "") : null;
}
function parseDuration(text: string): number | null {
  if (/^\d+$/.test(text)) {
    return Number(text);
  }
  const clock = /^(\d+):([0-5]\d)$/.exec(text);
  if (clock) {
    return Number(clock[1]) * 60 + Number(clock[2]);
  }
  const parts = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/i.exec(text);
  if (parts && (parts[1] || parts[2])) {
    return Math.round(Number(parts[1] ?? 0) * 60) + Number(parts[2] ?? 0);
  }
  return null;
}
function parseDate(text: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(text);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const date = new Date(/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text) ? text : `${text} 12:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((n, i) => String(n).padStart(i ? 2 : 4, "0")).join("-");
}
