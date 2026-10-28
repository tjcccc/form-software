// Row windowing for the record grid. Rows and group headings have fixed heights (47px cells, 39px group headings plus
// their 1px border), so offsets are exact and the rows outside the window collapse into spacer rows.
export const rowHeight = 47;
export const headingHeight = 40;
const overscan = 12;
const step = 8;
export type WindowRange = { start: number; end: number };
export type WindowSegment = { index: number } | { gap: number };
export function offsetsOf(heights: number[]) {
  const offsets = [0];
  for (const height of heights) {
    offsets.push(offsets[offsets.length - 1] + height);
  }
  return offsets;
}
// The item range covering the viewport, widened by an overscan and snapped to steps so small scrolls do not
// re-render the grid. `top` is the scroll offset measured from the start of the table body.
export function windowRange(offsets: number[], top: number, height: number): WindowRange {
  const count = offsets.length - 1;
  const first = Math.max(0, upperBound(offsets, top) - 1);
  const last = Math.max(first, upperBound(offsets, top + height) - 1);
  return {
    start: Math.max(0, Math.floor((first - overscan) / step) * step),
    end: Math.min(count, Math.ceil((last + 1 + overscan) / step) * step),
  };
}
// Pinned items (the active cell's row, the row being edited) stay mounted outside the window so keyboard focus and
// anchored editors survive scrolling. Everything else outside the window becomes spacer height.
export function segments(offsets: number[], range: WindowRange, pinned: number[]): WindowSegment[] {
  const count = offsets.length - 1;
  const shown = new Set<number>();
  for (let index = range.start; index < Math.min(range.end, count); index++) {
    shown.add(index);
  }
  for (const index of pinned) {
    if (index >= 0 && index < count) {
      shown.add(index);
    }
  }
  const result: WindowSegment[] = [];
  let next = 0;
  for (const index of [...shown].sort((a, b) => a - b)) {
    if (index > next) {
      result.push({ gap: offsets[index] - offsets[next] });
    }
    result.push({ index });
    next = index + 1;
  }
  if (next < count) {
    result.push({ gap: offsets[count] - offsets[next] });
  }
  return result;
}
function upperBound(offsets: number[], value: number) {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (offsets[mid] <= value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}
