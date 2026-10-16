import type { Field } from "../../api/types";
// Round decimal strings directly so display formatting never passes exact values through a float.
export function formatNumber(field: Field, value: unknown): string {
  const text = String(value);
  const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) return text;
  const places = field.config.decimal_places ?? (field.type === "integer" ? 0 : 2);
  const fraction = match[3] ?? "";
  let scaled = BigInt(match[2] + fraction.padEnd(places, "0").slice(0, places));
  if (Number(fraction[places] ?? 0) >= 5) scaled += 1n;
  const digits = scaled.toString().padStart(places + 1, "0");
  const whole = places ? digits.slice(0, -places) : digits;
  const formatted = `${match[1] === "-" && scaled !== 0n ? "-" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${places ? "." + digits.slice(-places) : ""}`;
  return field.config.number_format === "currency"
    ? `${field.config.currency ?? "USD"} ${formatted}`
    : field.config.number_format === "percent"
      ? `${formatted}%`
      : formatted;
}
