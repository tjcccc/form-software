import { describe, expect, it } from "vitest";

import { attachment, field, record } from "../../testing/fixtures";
import { summarize, summaryOptions } from "./summaries";

const rows = (key: string, values: unknown[]) => values.map((value, i) => record(value === undefined ? {} : { [key]: value }, [], `r${i}`));
describe("summaryOptions", () => {
  it("offers arithmetic for numbers, dates for dates, and checks for checkboxes", () => {
    expect(summaryOptions(field({ id: "d", type: "duration" }))).toContain("sum");
    expect(summaryOptions(field({ id: "t", type: "short_text" }))).not.toContain("sum");
    expect(summaryOptions(field({ id: "day", type: "date" }))).toContain("latest");
    expect(summaryOptions(field({ id: "b", type: "boolean" }))).toEqual(["checked", "unchecked", "percent_checked"]);
  });
});
describe("summarize", () => {
  it("totals durations and averages them to the minute", () => {
    const duration = field({ id: "d", type: "duration" });
    const logs = rows("d", [90, 45, undefined, 60]);
    expect(summarize(duration, logs, "sum", {})).toBe("3h 15m");
    expect(summarize(duration, logs, "average", {})).toBe("1h 5m");
    expect(summarize(duration, logs, "max", {})).toBe("1h 30m");
  });
  it("keeps decimal totals exact and rounds averages for display", () => {
    const amount = field({ id: "a", type: "decimal", config: { decimal_places: 2 } });
    const items = rows("a", ["0.10", "0.20", "1000.005"]);
    expect(summarize(amount, items, "sum", {})).toBe("1,000.31");
    expect(summarize(amount, items, "average", {})).toBe("333.44");
    expect(summarize(amount, items, "min", {})).toBe("0.10");
  });
  it("averages whole numbers to one decimal place", () => {
    expect(summarize(field({ id: "n", type: "integer" }), rows("n", [3, 4]), "average", {})).toBe("3.5");
  });
  it("counts filled, empty, and unique values, treating empty links as empty", () => {
    const links = field({ id: "l", type: "relation" });
    const items = rows("l", [["a", "b"], ["b", "a"], [], undefined, ["c"]]);
    expect(summarize(links, items, "filled", {})).toBe("3");
    expect(summarize(links, items, "empty", {})).toBe("2");
    expect(summarize(links, items, "percent_filled", {})).toBe("60%");
    expect(summarize(links, items, "unique", {})).toBe("2");
  });
  it("counts files from attachments, not values", () => {
    const files = field({ id: "f", type: "attachment" });
    expect(summarize(files, [record({}, [attachment("f", "x")], "a"), record({}, [], "b")], "filled", {})).toBe("1");
  });
  it("finds the earliest and latest dates, and shows a dash when nothing is filled", () => {
    const day = field({ id: "day", type: "date" });
    const items = rows("day", ["2026-10-28", "2026-01-05", undefined]);
    expect(summarize(day, items, "earliest", {})).toBe("Jan 05, 2026");
    expect(summarize(day, items, "latest", {})).toBe("Oct 28, 2026");
    expect(summarize(day, rows("day", [undefined]), "latest", {})).toBe("—");
    expect(summarize(field({ id: "d", type: "duration" }), [], "sum", {})).toBe("—");
  });
  it("counts checked boxes", () => {
    const done = field({ id: "b", type: "boolean" });
    expect(summarize(done, rows("b", [true, false, undefined, true]), "percent_checked", {})).toBe("50%");
  });
});
