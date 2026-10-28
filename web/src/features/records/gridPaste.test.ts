import { describe, expect, it } from "vitest";

import type { ResolvedLabel } from "../../api/types";
import { field, record } from "../../testing/fixtures";
import { buildWrites, type ClipCell, fillTargets, linkIds, parseClipCell, pasteTargets, readPayload, skipsWrite } from "./gridPaste";

const text = (rows: string[][]): ClipCell[][] => rows.map((row) => row.map((t) => ({ text: t })));
const at = (targets: ReturnType<typeof pasteTargets>["targets"]) => targets.map((t) => `${t.row},${t.col}=${t.cell.text}`);
describe("pasteTargets", () => {
  it("pastes a block from the selection's top-left cell", () => {
    const result = pasteTargets(text([["a", "b"]]), { top: 1, bottom: 1, left: 0, right: 0 }, 5, 3);
    expect(at(result.targets)).toEqual(["1,0=a", "1,1=b"]);
    expect(result.newRows).toBe(0);
  });
  it("fills a larger selection with one value or a repeated block", () => {
    expect(at(pasteTargets(text([["x"]]), { top: 0, bottom: 1, left: 0, right: 1 }, 5, 3).targets)).toEqual([
      "0,0=x",
      "0,1=x",
      "1,0=x",
      "1,1=x",
    ]);
    expect(at(pasteTargets(text([["a"], ["b"]]), { top: 0, bottom: 3, left: 1, right: 1 }, 5, 3).targets)).toEqual([
      "0,1=a",
      "1,1=b",
      "2,1=a",
      "3,1=b",
    ]);
  });
  it("counts rows past the end and drops columns past the last field", () => {
    const result = pasteTargets(
      text([
        ["a", "b", "c"],
        ["d", "e", "f"],
      ]),
      { top: 4, bottom: 4, left: 1, right: 1 },
      5,
      3,
    );
    expect(at(result.targets)).toEqual(["4,1=a", "4,2=b", "5,1=d", "5,2=e"]);
    expect(result.newRows).toBe(1);
    expect(result.droppedColumns).toBe(true);
  });
});
describe("fillTargets", () => {
  const rows = (targets: ReturnType<typeof fillTargets>) => targets.map((t) => `${t.row}<${t.from}`);
  it("repeats the source rows downward", () => {
    expect(rows(fillTargets({ top: 2, bottom: 3, left: 0, right: 1 }, 6))).toEqual(["4<2", "5<3", "6<2"]);
  });
  it("repeats upward from the source's bottom, so the adjacent row matches the nearest source row", () => {
    expect(rows(fillTargets({ top: 2, bottom: 3, left: 0, right: 0 }, 0))).toEqual(["1<3", "0<2"]);
  });
  it("fills nothing when the drag ends inside the source", () => {
    expect(fillTargets({ top: 2, bottom: 3, left: 0, right: 0 }, 3)).toEqual([]);
  });
});
describe("parseClipCell", () => {
  it("keeps stored values between fields of the same type and link target", () => {
    const links = field({ id: "l", type: "relation", config: { target_form_id: "projects" } });
    const cell = { text: "Apollo", value: ["p1"], type: "relation" as const, target: "projects" };
    expect(parseClipCell(links, cell)).toEqual({ value: ["p1"] });
    expect(parseClipCell(field({ id: "l", type: "relation", config: { target_form_id: "people" } }), cell)).toEqual({ labels: ["Apollo"] });
    expect(parseClipCell(field({ id: "t", type: "short_text" }), { text: "90", value: 90, type: "duration" })).toEqual({ value: "90" });
  });
});
describe("linkIds", () => {
  const resolved = new Map<string, ResolvedLabel>([
    ["Smith, Ada", { label: "Smith, Ada", matches: 1, record_id: "ada" }],
    ["Sam", { label: "Sam", matches: 2, record_id: null }],
    ["Ida", { label: "Ida", matches: 1, record_id: "ida" }],
    ["Nobody", { label: "Nobody", matches: 0, record_id: null }],
  ]);
  it("prefers the whole text, so names with commas resolve", () => {
    expect(linkIds("Smith, Ada", ["Smith", "Ada"], resolved)).toEqual({ value: ["ada"] });
  });
  it("refuses ambiguous and missing names", () => {
    expect(linkIds("Ida, Sam", ["Ida", "Sam"], resolved)).toEqual({ error: "“Sam” matches 2 records." });
    expect(linkIds("Nobody", ["Nobody"], resolved)).toEqual({ error: "Nothing is named “Nobody”." });
  });
});
describe("buildWrites", () => {
  const name = field({ id: "name", type: "short_text", required: true });
  const note = field({ id: "note", type: "long_text" });
  const rows = [record({}, [], "a"), record({}, [], "b")];
  it("merges cells into one versioned update per record and creates for new rows", () => {
    const writes = buildWrites(
      [
        { row: 0, field: name, value: "A" },
        { row: 0, field: note, value: "x" },
        { row: 2, field: name, value: "New" },
      ],
      rows,
    );
    expect(writes.updates).toEqual([{ record_id: "a", expected_version: 1, values: { name: "A", note: "x" } }]);
    expect(writes.creates).toEqual([{ values: { name: "New" } }]);
  });
  it("clears cut sources the paste does not overwrite", () => {
    const writes = buildWrites([{ row: 0, field: note, value: "moved" }], rows, [
      { record: rows[0], field: note },
      { record: rows[1], field: note },
    ]);
    expect(writes.updates?.map((u) => u.values)).toEqual([{ note: "moved" }, { note: null }]);
  });
  it("never writes files or empties a required field", () => {
    expect(skipsWrite(name, null)).toBe(true);
    expect(skipsWrite(name, "A")).toBe(false);
    expect(skipsWrite(field({ id: "f", type: "attachment" }), null)).toBe(true);
  });
});
describe("readPayload", () => {
  it("accepts only this grid's clipboard shape", () => {
    expect(readPayload(JSON.stringify({ app: "formsoftware", form: "f", token: "t", cells: [[{ text: "a" }]] }))).toBeDefined();
    expect(readPayload(JSON.stringify({ app: "other", cells: [] }))).toBeUndefined();
    expect(readPayload("not json")).toBeUndefined();
  });
});
