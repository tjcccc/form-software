# FormSoftware interface

## Direction

A contemporary record workspace with the precision of a terminal: boxy, quiet, typographic, and tactile. The original sketch establishes left-hand navigation and a large table canvas. Extend that structure with a right-hand inspector, compact view controls, and visible save/error states.

## Visual system

Use the tokens in `web/src/styles/tokens.css` as the source of truth. Warm paper `#faf9f5`, canvas `#f5f4ef`, olive-neutral sidebar `#efeee7`, dark ink `#292c29`, and restrained vermilion `#ba472d`. Colors for relation tags are muted and secondary to their text labels. Selection and focus carry an accent; no status depends only on color.

IBM Plex Sans supports titles and record text. IBM Plex Mono supports metadata, dates, durations, counts, and keyboard hints. Fonts are self-hosted. Square corners, one-pixel rules, flat surfaces, and limited elevation define panels. Avoid terminal raster effects, glowing text, ornamental gradients, and decorative fake controls.

## Layout and interaction

- A 228px sidebar holds forms, explicit option-list management under Configuration, and account controls. On small screens it becomes an icon rail.
- The top bar shows workspace context and connection state. The form heading names the collection and offers Import and New record.
- The table panel contains a view selector, filters, sorting, grouping, column controls, and search. A simple footer reports the filtered count and the current page's duration, explicitly scoped to that page.
- Click a cell to edit in place. Scalar inputs align with the cell; notes, relations, and files expand into compact anchored controls. Enter or clicking away saves; Escape cancels. Tab saves and moves to the next cell; Cmd/Ctrl+Enter saves a note. Failed saves retain the draft.
- A + button after the last visible column opens the field dialog. New fields appear immediately to its left and remain visible, including when all previous fields are hidden.
- Column headings open a compact action menu by click or right-click. It provides first-column freeze, field editing, linked-form navigation for relations plus separate field settings, duplication, positional insertion, descriptions, sorting, filtering, grouping, hiding, and confirmed archival. The primary Name field cannot be archived.
- The first visible data column and row-number gutter freeze by default. Freeze and grouping are saved view settings; other columns cannot be individually frozen. Descriptions appear as header tooltips and field help in the full record editor.
- Drag a column boundary to preview its width; release to autosave to the active view. Escape or pointer cancellation restores the original width. Focused resize separators support Left/Right (10px), Shift+Left/Right (50px), and Home/End (100/800px). Numeric width inputs save on blur or Enter. Width writes are queued, and failures keep the visible width with a Retry action. Resizing does not reload records, reset pagination, or save unrelated pending view adjustments.
- Grouping is one level across the filtered collection, ordered on the server before pagination. Headers show full group counts and the portion on the current page. Multi-record relations group by the complete set of links; attachment fields group by file count. Group collapse is transient and scoped to displayed rows. The Group control clears grouping.
- Relation search offers Add option / Add record only after a successful search returns no results for the current nonblank query. The action creates a linked record and selects it; the cell still follows its normal save/cancel behavior. Additional required fields must be completed in the linked form. Creation blocks the parent editor until the request finishes.
- Right-click a row (or Shift+F10 on a focused cell) for Open Editor, Insert record above/below, Duplicate record, and Delete record. The explicit editor is docked on the right; on narrow screens it fills the table panel.
- Hovering a row number reveals its checkbox. Checked boxes remain visible; the header checkbox selects this page. A selection strip offers count, clear, and confirmed deletion. Bulk deletion stops on the first error and reports partial progress.
- Relative insertion starts an inline draft with required fields reachable, then explicitly saves a validated record. Default manual order persists across reloads. Explicit sorts and filters still determine visibility and placement after saving.
- Inspector edits require an explicit save and confirm unsaved navigation. Inline conflicts retain the entered value and offer an explicit discard/load-latest action. Draft rows block leaving the form until saved or canceled. No stale write is silently retried.
- New form, schema design, CSV import, and keyboard help use native modal dialogs. Dangerous record/field/form/attachment operations ask for confirmation in context.
- `/` focuses search, `N` creates a record, Escape closes a panel, and Cmd/Ctrl+Enter saves the inspector. Shortcuts yield to text inputs and dialogs.

## Components

Keep controls small but legible, with visible keyboard focus and labels. Table rows are 47px; column headings are 37px. Primary record titles are readable sans-serif. Numerical values align right. Use shared buttons, errors, dialogs, and popovers; feature components own their domain presentation. The native skeleton uses the same colors and geometry with platform typography.
