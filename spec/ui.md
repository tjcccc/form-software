# FormSoftware interface

## Direction

A contemporary record workspace with the precision of a terminal: boxy, quiet, typographic, and tactile. The original sketch establishes left-hand navigation and a large table canvas. Extend that structure with a right-hand inspector, compact view controls, and visible save/error states.

## Visual system

Use the tokens in `web/src/styles/tokens.css` as the source of truth. Warm paper `#faf9f5`, canvas `#f5f4ef`, olive-neutral sidebar `#efeee7`, dark ink `#292c29`, and restrained vermilion `#ba472d`. Colors for relation tags are muted and secondary to their text labels. Selection and focus carry an accent; no status depends only on color.

IBM Plex Sans supports titles and record text. IBM Plex Mono supports metadata, dates, durations, counts, and keyboard hints. Fonts are self-hosted. Square corners, one-pixel rules, flat surfaces, and limited elevation define panels. Avoid terminal raster effects, glowing text, ornamental gradients, and decorative fake controls.

## Layout and interaction

- A 228px sidebar holds forms, explicit option-list management under Configuration, and account controls. On small screens it becomes an icon rail.
- The top bar shows workspace context and connection state. The form heading names the collection and offers Import and New record.
- The table panel contains a view selector, filters, sorting, column controls, and search. A simple footer reports the filtered count and the current page's duration, explicitly scoped to that page.
- Records open in a docked inspector. The table remains available for context. On narrow screens the inspector fills the table panel.
- Edits require an explicit save. Unsaved navigation asks about discarding. A conflict preserves the draft and exposes the latest values for comparison. Saving after review is a new explicit action.
- New form, schema design, CSV import, and keyboard help use native modal dialogs. Dangerous record/field/form/attachment operations ask for confirmation in context.
- `/` focuses search, `N` creates a record, Escape closes a panel, and Cmd/Ctrl+Enter saves the inspector. Shortcuts yield to text inputs and dialogs.

## Components

Keep controls small but legible, with visible keyboard focus and labels. Table rows are 47px; column headings are 37px. Primary record titles are readable sans-serif. Numerical values align right. Use shared buttons, errors, dialogs, and popovers; feature components own their domain presentation. The native skeleton uses the same colors and geometry with platform typography.
