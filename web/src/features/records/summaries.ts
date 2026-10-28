import type { Catalogs, DataRecord, Field, Summary } from "../../api/types";
import { formatNumber } from "./numbers";
import { displayValue, formatDuration } from "./values";

// The server accepts the same pairs (`summary_applies` in form-domain).
const general: Summary[] = ["filled", "empty", "percent_filled", "unique"];
export const summaryLabels: Record<Summary, string> = {
  filled: "Filled",
  empty: "Empty",
  percent_filled: "Percent filled",
  unique: "Unique",
  sum: "Sum",
  average: "Average",
  min: "Min",
  max: "Max",
  earliest: "Earliest",
  latest: "Latest",
  checked: "Checked",
  unchecked: "Unchecked",
  percent_checked: "Percent checked",
};
export function summaryOptions(field: Field): Summary[] {
  switch (field.type) {
    case "integer":
    case "decimal":
    case "duration":
      return ["sum", "average", "min", "max", ...general];
    case "date":
    case "date_time":
      return ["earliest", "latest", ...general];
    case "boolean":
      return ["checked", "unchecked", "percent_checked"];
    case "attachment":
      return ["filled", "empty", "percent_filled"];
    default:
      return general;
  }
}
function isFilled(field: Field, record: DataRecord) {
  if (field.type === "attachment") {
    return record.attachments.some((a) => a.field_id === field.id);
  }
  const value = record.values[field.id];
  return value != null && value !== "" && !(Array.isArray(value) && !value.length);
}
function percent(part: number, whole: number) {
  return `${whole ? Math.round((part / whole) * 100) : 0}%`;
}
// Decimal strings are summed as scaled integers, so totals stay exact.
function scaled(value: string, places: number) {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(value);
  if (!match) {
    return undefined;
  }
  const digits = BigInt(match[2] + (match[3] ?? "").padEnd(places, "0").slice(0, places));
  return match[1] === "-" ? -digits : digits;
}
function unscaled(value: bigint, places: number) {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(places + 1, "0");
  return `${negative ? "-" : ""}${places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits}`;
}
function numberSummary(field: Field, records: DataRecord[], summary: Summary) {
  const values = records.map((r) => r.values[field.id]).filter((v) => v != null && v !== "");
  if (!values.length) {
    return "—";
  }
  if (field.type === "decimal") {
    const places = Math.max(0, ...values.map((v) => String(v).split(".")[1]?.length ?? 0));
    const numbers = values.map((v) => scaled(String(v), places)).filter((v): v is bigint => v !== undefined);
    const total = numbers.reduce((a, b) => a + b, 0n);
    const pick = (better: (a: bigint, b: bigint) => boolean) => numbers.reduce((a, b) => (better(b, a) ? b : a));
    const result =
      summary === "sum"
        ? total
        : summary === "min"
          ? pick((a, b) => a < b)
          : summary === "max"
            ? pick((a, b) => a > b)
            : // Two extra places, so the display rounding of the average is correct.
              (total * 100n) / BigInt(numbers.length);
    return formatNumber(field, unscaled(result, summary === "average" ? places + 2 : places));
  }
  const numbers = values.filter((v): v is number => typeof v === "number");
  const result =
    summary === "sum"
      ? numbers.reduce((a, b) => a + b, 0)
      : summary === "min"
        ? Math.min(...numbers)
        : summary === "max"
          ? Math.max(...numbers)
          : numbers.reduce((a, b) => a + b, 0) / numbers.length;
  if (field.type === "duration") {
    return formatDuration(Math.round(result));
  }
  // Averages of whole numbers (such as ratings) keep one decimal place.
  return summary === "average"
    ? formatNumber({ ...field, config: { ...field.config, decimal_places: 1 } }, result.toFixed(2))
    : formatNumber(field, String(result));
}
// The summary's value over the given rows, formatted for display.
export function summarize(field: Field, records: DataRecord[], summary: Summary, catalogs: Catalogs): string {
  const filled = records.filter((r) => isFilled(field, r)).length;
  switch (summary) {
    case "filled":
      return String(filled);
    case "empty":
      return String(records.length - filled);
    case "percent_filled":
      return percent(filled, records.length);
    case "unique":
      return String(
        new Set(
          records
            .filter((r) => isFilled(field, r))
            .map((r) => {
              const value = r.values[field.id];
              return JSON.stringify(Array.isArray(value) ? [...value].sort() : value);
            }),
        ).size,
      );
    case "checked":
    case "unchecked":
    case "percent_checked": {
      const checked = records.filter((r) => r.values[field.id] === true).length;
      return summary === "checked"
        ? String(checked)
        : summary === "unchecked"
          ? String(records.length - checked)
          : percent(checked, records.length);
    }
    case "earliest":
    case "latest": {
      const dates = records
        .map((r) => r.values[field.id])
        .filter((v): v is string => typeof v === "string" && !!v)
        .sort((a, b) => Date.parse(a) - Date.parse(b));
      return dates.length ? displayValue(field, summary === "earliest" ? dates[0] : dates.at(-1), catalogs) : "—";
    }
    default:
      return numberSummary(field, records, summary);
  }
}
