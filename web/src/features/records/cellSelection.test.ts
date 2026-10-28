import { describe, expect, it } from "vitest";

import { type CellSelection, contains, move, rangeOf, reconcile, selectAll, selectColumn, single } from "./cellSelection";

const axes = { rows: ["r1", "r2", "r3"], columns: ["a", "b", "c"] };
const cell = (recordId: string, fieldId: string) => ({ recordId, fieldId });
describe("move", () => {
  it("moves the active cell and collapses a range", () => {
    const range: CellSelection = { anchor: cell("r2", "b"), focus: cell("r3", "c") };
    expect(move(range, axes, 0, -1)).toEqual(single(cell("r2", "a")));
  });
  it("clamps at the grid edges", () => {
    expect(move(single(cell("r1", "a")), axes, -1, 0)).toEqual(single(cell("r1", "a")));
    expect(move(single(cell("r3", "c")), axes, 1, 1)).toEqual(single(cell("r3", "c")));
  });
  it("extends from the focus corner while keeping the anchor", () => {
    const once = move(single(cell("r1", "a")), axes, 1, 0, { extend: true });
    const twice = move(once, axes, 0, 1, { extend: true });
    expect(twice).toEqual({ anchor: cell("r1", "a"), focus: cell("r2", "b") });
  });
  it("jumps to the edge in the direction of travel", () => {
    expect(move(single(cell("r2", "b")), axes, 0, 1, { jump: true })).toEqual(single(cell("r2", "c")));
    expect(move(single(cell("r2", "b")), axes, -1, 0, { jump: true, extend: true })).toEqual({
      anchor: cell("r2", "b"),
      focus: cell("r1", "b"),
    });
  });
});
describe("ranges", () => {
  it("normalizes a range dragged up and to the left", () => {
    const range = rangeOf({ anchor: cell("r3", "c"), focus: cell("r2", "a") }, axes);
    expect(range).toEqual({ top: 1, bottom: 2, left: 0, right: 2 });
    expect(contains(range, 1, 1)).toBe(true);
    expect(contains(range, 0, 1)).toBe(false);
  });
  it("selects a whole column or the whole grid", () => {
    expect(selectColumn(axes, "b")).toEqual({ anchor: cell("r1", "b"), focus: cell("r3", "b") });
    expect(selectAll(axes)).toEqual({ anchor: cell("r1", "a"), focus: cell("r3", "c") });
    expect(selectAll({ rows: [], columns: ["a"] })).toBeUndefined();
  });
});
describe("reconcile", () => {
  it("keeps a visible selection and drops one whose cells disappeared", () => {
    const selection = { anchor: cell("r1", "a"), focus: cell("r2", "b") };
    expect(reconcile(selection, axes)).toBe(selection);
    expect(reconcile(selection, { rows: ["r1"], columns: ["a", "b"] })).toBeUndefined();
    expect(reconcile(selection, { rows: axes.rows, columns: ["b"] })).toBeUndefined();
  });
});
