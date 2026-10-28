import { describe, expect, it } from "vitest";

import { field, record } from "../../testing/fixtures";
import { copyText, parseText, parseTsv, toTsv } from "./clipboardText";

describe("TSV", () => {
  it("round-trips cells with tabs, line breaks, and quotes", () => {
    const rows = [
      ["plain", 'say "hi"', "two\nlines"],
      ["", "a\tb", "end"],
    ];
    expect(parseTsv(toTsv(rows))).toEqual(rows);
  });
  it("ignores the trailing line break spreadsheets add", () => {
    expect(parseTsv("a\tb\r\nc\td\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});
describe("parseText", () => {
  it("reads durations as minutes in the formats people paste", () => {
    const duration = field({ id: "d", type: "duration" });
    expect(parseText(duration, "1h 30m")).toEqual({ value: 90 });
    expect(parseText(duration, "1:05")).toEqual({ value: 65 });
    expect(parseText(duration, "45")).toEqual({ value: 45 });
    expect(parseText(duration, "2h")).toEqual({ value: 120 });
    expect(parseText(duration, "soon")).toHaveProperty("error");
  });
  it("reads display-formatted numbers without passing decimals through floats", () => {
    expect(parseText(field({ id: "n", type: "decimal" }), "USD 1,234.50")).toEqual({ value: "1234.50" });
    expect(parseText(field({ id: "n", type: "integer" }), "1,200")).toEqual({ value: 1200 });
    expect(parseText(field({ id: "n", type: "integer" }), "1.5")).toHaveProperty("error");
    expect(parseText(field({ id: "r", type: "integer", config: { rating: { max: 5, icon: "star", color: "ochre" } } }), "3 / 5")).toEqual({
      value: 3,
    });
  });
  it("reads ISO and display dates as local calendar days", () => {
    const date = field({ id: "day", type: "date" });
    expect(parseText(date, "2026-10-28")).toEqual({ value: "2026-10-28" });
    expect(parseText(date, "Oct 28, 2026")).toEqual({ value: "2026-10-28" });
    expect(parseText(date, "not a date")).toHaveProperty("error");
  });
  it("clears on empty text, but booleans become false", () => {
    expect(parseText(field({ id: "t", type: "short_text" }), "  ")).toEqual({ value: null });
    expect(parseText(field({ id: "links", type: "relation" }), "")).toEqual({ value: [] });
    expect(parseText(field({ id: "b", type: "boolean" }), "")).toEqual({ value: false });
    expect(parseText(field({ id: "b", type: "boolean" }), "Yes")).toEqual({ value: true });
  });
  it("keeps single-line text on one line and splits multi-link labels", () => {
    expect(parseText(field({ id: "t", type: "short_text" }), "one\ntwo")).toEqual({ value: "one two" });
    expect(parseText(field({ id: "l", type: "relation", config: { cardinality: "many" } }), "Ada, Sam")).toEqual({
      labels: ["Ada", "Sam"],
    });
    expect(parseText(field({ id: "l", type: "relation", config: { cardinality: "one" } }), "Smith, Ada")).toEqual({
      labels: ["Smith, Ada"],
    });
  });
});
describe("copyText", () => {
  it("copies values in pasteable forms", () => {
    const row = record({ d: 90, b: true, n: "12.50", day: "2026-10-28" });
    expect(copyText(field({ id: "d", type: "duration" }), row, {})).toBe("1h 30m");
    expect(copyText(field({ id: "b", type: "boolean" }), row, {})).toBe("Yes");
    expect(copyText(field({ id: "n", type: "decimal" }), row, {})).toBe("12.50");
    expect(copyText(field({ id: "day", type: "date" }), row, {})).toBe("2026-10-28");
    expect(copyText(field({ id: "missing", type: "short_text" }), row, {})).toBe("");
  });
});
