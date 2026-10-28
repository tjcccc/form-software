# TODO

Next work for the Airtable-parity grid (phase 4). Items come from the 2026-10-28 gap audit, ordered by value for daily work logs. `DEVLOG.md` records what is done; `spec/ui.md` holds the interaction rules to keep.

## Next: row drag-and-drop reordering (audit item 8)

- Row-number gutter on hover shows a ⋮⋮ drag grip and a ↗ expand button (opens the record editor, like Space), keeping the checkbox.
- Dragging the grip shows a drop line; dropping saves the new manual position, which survives reload.
- Disabled while the view is sorted or grouped (the sort or the groups decide order then), with a tooltip saying why. With filters, the row lands next to the visible row it was dropped on.
- Cmd/Ctrl+Z undoes a move (needs a move step in `undoHistory`, beside value changes).
- Server: a move request that only changes `position` under the form lock and does not bump the record version, so other undo steps on that record keep working. Split `crates/persistence/src/records.rs` first (797 lines, at the 800-line ratchet), then run `node scripts/check-file-sizes.mjs --update`.
- Later: dragging several checked rows at once.

## Then

- Row height (audit item 4): short / medium / tall / extra tall per view, with wrapped text so long notes read in the grid. Row windowing assumes fixed heights (`gridWindow.ts`: rows 47px, headings 40px); keep heights fixed per setting and update the offsets.
- Search that highlights matches and jumps between them (item 6); today search filters rows on the server.
- Drag a column heading to reorder columns (item 7); today the Fields popover has up/down arrows.
- More than one sort, OR filter groups, and more than one grouping level (item 9).
- Created time and last modified field types (item 10).
- Record activity: history and comments (item 11).

## Known gaps

- Fill handle dragging on touch screens is untested; touch input likely captures the pointer, so rows may never register as fill targets.
- Attachment changes are not in the undo history, and a restored record is not revalidated, so a field that became required after a delete can come back empty.
- Column summaries cover loaded rows only (up to the 5,000-row load limit).
- Not checked in Safari or Firefox; clipboard round trips with Numbers, Excel, and Google Sheets are untested.

## After parity

- Discuss the "beyond Airtable" ideas.
- Out of MVP scope until a product decision: formulas, lookups, and rollups; Kanban, calendar, gallery, and form views; automations; collaboration.
