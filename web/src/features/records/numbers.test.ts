import { describe, expect, it } from "vitest";

import { field } from "../../testing/fixtures";
import { formatNumber } from "./numbers";

const decimal = (config = {}) => field({ id: "amount", type: "decimal", config });
describe("formatNumber", () => {
  it("rounds half up from the decimal string without float error", () => {
    expect(formatNumber(decimal(), "1.005")).toBe("1.01");
    expect(formatNumber(decimal(), "1.004")).toBe("1.00");
  });
  it("carries rounding into the whole part", () => {
    expect(formatNumber(decimal(), "9.999")).toBe("10.00");
  });
  it("keeps precision beyond the safe integer range", () => {
    expect(formatNumber(decimal(), "12345678901234567890.125")).toBe("12,345,678,901,234,567,890.13");
  });
  it("does not show negative zero", () => {
    expect(formatNumber(decimal(), "-0.001")).toBe("0.00");
    expect(formatNumber(decimal(), "-1.5")).toBe("-1.50");
  });
  it("uses zero places for integers and the configured places otherwise", () => {
    expect(formatNumber(field({ id: "count", type: "integer" }), 1234567)).toBe("1,234,567");
    expect(formatNumber(decimal({ decimal_places: 0 }), "2.5")).toBe("3");
  });
  it("applies currency and percent presentation", () => {
    expect(formatNumber(decimal({ number_format: "currency", currency: "EUR" }), "1000")).toBe("EUR 1,000.00");
    expect(formatNumber(decimal({ number_format: "currency" }), "1")).toBe("USD 1.00");
    expect(formatNumber(decimal({ number_format: "percent" }), "25")).toBe("25.00%");
  });
  it("returns non-numeric input unchanged", () => {
    expect(formatNumber(decimal(), "abc")).toBe("abc");
  });
});
