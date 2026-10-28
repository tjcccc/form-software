import { describe, expect, it } from "vitest";

import { headingHeight, offsetsOf, rowHeight, segments, windowRange } from "./gridWindow";

const rows = (count: number) => offsetsOf(Array.from({ length: count }, () => rowHeight));
const height = (parts: ReturnType<typeof segments>, offsets: number[]) =>
  parts.reduce((total, part) => total + ("gap" in part ? part.gap : offsets[part.index + 1] - offsets[part.index]), 0);
describe("windowRange", () => {
  it("covers the viewport with overscan and clamps at the ends", () => {
    const offsets = rows(1000);
    const top = windowRange(offsets, 0, 470);
    expect(top.start).toBe(0);
    expect(top.end).toBeGreaterThanOrEqual(10);
    const middle = windowRange(offsets, 400 * rowHeight, 470);
    expect(middle.start).toBeLessThanOrEqual(400);
    expect(middle.end).toBeGreaterThanOrEqual(410);
    expect(middle.end - middle.start).toBeLessThan(60);
    expect(windowRange(offsets, 1000 * rowHeight, 470).end).toBe(1000);
  });
  it("accounts for group headings in the offsets", () => {
    const offsets = offsetsOf([headingHeight, ...Array.from({ length: 200 }, () => rowHeight)]);
    const range = windowRange(offsets, headingHeight + 100 * rowHeight, 47);
    expect(range.start).toBeLessThanOrEqual(101);
    expect(range.end).toBeGreaterThan(101);
  });
  it("snaps to steps so small scrolls keep the same range", () => {
    const offsets = rows(1000);
    expect(windowRange(offsets, 300 * rowHeight, 470)).toEqual(windowRange(offsets, 300 * rowHeight + 20, 470));
  });
});
describe("segments", () => {
  it("keeps the total height while replacing hidden rows with spacers", () => {
    const offsets = rows(500);
    const parts = segments(offsets, { start: 100, end: 140 }, []);
    expect(parts[0]).toEqual({ gap: 100 * rowHeight });
    expect(parts.at(-1)).toEqual({ gap: 360 * rowHeight });
    expect(height(parts, offsets)).toBe(offsets[500]);
  });
  it("mounts pinned rows outside the window in order", () => {
    const offsets = rows(500);
    const parts = segments(offsets, { start: 0, end: 40 }, [499, 250, 10, -1, 900]);
    const shown = parts.flatMap((part) => ("index" in part ? [part.index] : []));
    expect(shown.slice(-2)).toEqual([250, 499]);
    expect(shown).toHaveLength(42);
    expect(parts.at(-1)).toEqual({ index: 499 });
    expect(height(parts, offsets)).toBe(offsets[500]);
  });
});
