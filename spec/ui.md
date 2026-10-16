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
- Field creation offers Number (whole/decimal precision, plain/currency/percent display), Rating (1–10 maximum, five icon styles and muted colors), Single select, Multiple select, and Link to another record alongside the basic types. Both field-creation entry points share settings. Select presets use reusable option lists under Configuration; links can target any available form, including the current form. Storage types remain fixed after creation; numeric display and rating settings are editable from the column menu. Ratings support click and arrow/Home/End keyboard input, an explicit zero, and clearing optional values.
- A + button after the last visible column opens the field dialog. New fields appear immediately to its left and remain visible after reload, including beyond six columns and when all previous fields are hidden. Only explicit visibility settings hide columns.
- Column headings open a compact action menu by click or right-click. It provides first-column freeze, field editing, linked-form navigation for relations plus separate field settings, duplication, positional insertion, descriptions, sorting, filtering, grouping, hiding, and confirmed archival. The primary Name field cannot be archived.
- The first visible data column and row-number gutter freeze by default. Freeze and grouping are saved view settings; other columns cannot be individually frozen. Descriptions appear as header tooltips and field help in the full record editor.
- Drag a column boundary to preview its width; release to autosave to the active view. Escape or pointer cancellation restores the original width. Focused resize separators support Left/Right (10px), Shift+Left/Right (50px), and Home/End (100/800px). Numeric width inputs save on blur or Enter. Width writes are queued, and failures keep the visible width with a Retry action. Resizing does not reload records, reset pagination, or save unrelated pending view adjustments.
- Grouping is one level across the filtered collection, ordered on the server before pagination. Headers show full group counts and the portion on the current page. Multi-record relations group by the complete set of links; attachment fields group by file count. Group collapse is transient and scoped to displayed rows. The Group control clears grouping.
- Relation search offers Add option / Add record only after a successful search returns no results for the current nonblank query. The action creates a linked record and selects it; the cell still follows its normal save/cancel behavior. Additional required fields must be completed in the linked form. Creation blocks the parent editor until the request finishes.
- Right-click a row (or Shift+F10 on a focused cell) for Open Editor, Insert record above/below, Duplicate record, and Delete record. The explicit editor is docked on the right; on narrow screens it fills the table panel.
- Hovering a row number reveals its checkbox. Checked boxes remain visible; the header checkbox selects this page. A selection strip offers count, clear, and confirmed deletion. Bulk deletion stops on the first error and reports partial progress.
- Relative insertion starts an inline draft with required fields reachable, then explicitly saves a validated record. Default manual order persists across reloads. Explicit sorts and filters still determine visibility and placement after saving.
- Inspector edits require an explicit save and confirm unsaved navigation. Inline conflicts retain the entered value and offer an explicit discard/load-latest action. Draft rows block leaving the form until saved or canceled. No stale write is silently retried.
- Toolbar and column filters share a wide dialog with compact Where/And → Field → Operator → Value rows, inset controls, and a padded action footer. Rows stack on mobile. Choice popups use viewport-constrained fixed positioning, adapt above/below the control, scroll internally, and focus search without scrolling the dialog. Conditions combine with AND; applying commits the draft, closing cancels it, and Clear removes all conditions.
- Relation filters offer is, is not, is any of, is none of, is empty, and is not empty. Searchable choices support removable selections and up to 100 records for any/none; searches include disabled options for historical records. For multi-link fields, is means includes. Negative filters include empty cells; add is not empty to exclude them. Empty checks hide the value control. Filtering is manual, with no AI controls or linked-record creation.
- The form designer’s Add a field section supports optional descriptions and shows existing descriptions in its field list.
- New form, schema design, CSV import, and keyboard help use native modal dialogs. Dangerous record/field/form/attachment operations ask for confirmation in context.
- `/` focuses search, `N` creates a record, Escape closes a panel, and Cmd/Ctrl+Enter saves the inspector. Shortcuts yield to text inputs and dialogs.

## Components

Keep controls small but legible, with visible keyboard focus and labels. Table rows are 47px. Table and inspector headers share the 38px `--grid-header-height` token so their bottom borders align. Primary record titles are readable sans-serif. Numerical values align right. Use shared buttons, errors, dialogs, and popovers; feature components own their domain presentation. The native skeleton uses the same colors and geometry with platform typography.
