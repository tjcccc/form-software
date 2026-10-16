# Development log

## 2026-10-16 · v0.3.0 · Interactive table workspace checkpoint

Checkpointed inline cell editing, record context actions and multi-selection, persistent insertion order, relation quick add, column actions and descriptions, grouping, default first-column freeze, automatic column-width persistence, and the trailing add-field button. Synchronized workspace/web manifests, Cargo lock metadata, API version, and visible version labels at 0.3.0. Detailed implementation and validation notes follow below.

Reused passing development checks: TypeScript/ESLint, production web build, Rust default-workspace check, domain tests, the extended disposable-database HTTP scenario, and focused browser workflows. Checkpoint-only validation regenerated the contracts and checked version consistency and the staged diff. Native UI was unchanged and not retested. No repository safety scanner or active hook was configured; no scanner was installed during this checkpoint.

## 2026-10-16 · Add field from the table header

Added an accessible + button after the last visible column, reusing the field dialog and positional creation workflow. New fields are explicitly visible in the current view, including the all-columns-hidden case. The trailing header cell now has a comfortable 56px hit area. Validation: TypeScript/ESLint, production build, and focused browser creation through the new button; existing field-creation API behavior is unchanged.

## 2026-10-16 · Column resizing with automatic width persistence

Added pointer-captured drag handles and accessible keyboard resize separators, bounded to 100–800px. Dragging previews locally; release saves once, Escape/pointer cancellation restores the original width, and keyboard/numeric-input changes use the same autosave path. Column geometry follows stored widths exactly. A compact saving/error status offers retry while preserving failed local widths.

Widths remain in existing view JSONB. A workspace-scoped width-only PATCH materializes implicit layouts without reordering or changing visibility, and merges under the form lock. Browser writes are queued to preserve rapid-resize intent, update only widths in the saved-view baseline, and retain unrelated pending view changes. Layout updates no longer refetch records or reset pagination.

Validation: regenerated contracts, Rust check, TypeScript/ESLint, production build, and the existing disposable-database API scenario extended for width bounds, implicit order/visibility, persistence, concurrent distinct-column updates, view-preference preservation, cross-workspace isolation, and invalid/archived fields. Focused browser checks cover drag preview, one write on release, exact geometry, no record refetch, unsaved-sort isolation, reload persistence, Escape cancellation, keyboard resizing, failed-save retry, and numeric input persistence. No database migration or native UI change was needed.

## 2026-10-16 · Column actions, linked-record quick add, and grouping

Added column menus with default first-column freeze, field editing, linked-form navigation and separate relation settings, duplicate-to-right, insert left/right, descriptions, ascending/descending sort, field filters, grouping, hiding, and confirmed archival. Field duplication includes data, normalized relations, and independent attachment copies, with updated record versions. Optional field descriptions are stored by migration and shown in header tooltips and inspector help. New-field placement preserves the current view order.

Relation pickers offer quick creation after a successful empty search for the current query. A new option/record is created in the target form and selected; parent editing waits for creation. Additional required target fields still require normal form entry. Grouping and freeze persist in saved views. Grouping happens server-side before pagination, with full filtered group counts; multi-links group by their canonical set and files by count. Relation sorting now uses record labels. Archiving fields cleans dangling saved-view configuration, serialized with view saves through the form lock.

Validation: Rust check, regenerated contracts, TypeScript/ESLint, production web build, and the existing disposable-database HTTP workflow extended for metadata limits, field position, grouping across page boundaries, typed/relation sorting, scalar/relation/file field duplication, workspace isolation, and saved-view cleanup. Focused browser verification covers quick add, column menu controls, grouping/collapse, duplicate placement/data, positional insertion, descriptions, hiding, and linked-form navigation. Native UI remains unchanged.

## 2026-10-16 · Inline grid editing and row actions

Cell clicks now edit in the table instead of opening the inspector. Scalar inputs follow cell geometry; notes, relations, and attachments use compact anchored controls. Enter/click-away saves, Tab saves and advances, Escape cancels, and Cmd/Ctrl+Enter saves notes. Single-field writes use optimistic versions; failed validation keeps input and restores focus. Conflicts preserve the draft for explicit discard/load-latest. Shared field inputs serve the grid and inspector; the grid workflow is separate from table rendering.

Added right-click and Shift+F10 record menus with Open Editor, Insert above/below, Duplicate, and Delete. Relative insertion uses a validated inline draft and a new persistent manual-order migration that preserves existing newest-first ordering. Active sorts/filters still apply after saving. Duplication copies active values, canonical relations, and private files with fresh attachment IDs; transaction failures clean up file copies. Disabled option assignments remain invalid for new duplicates.

Row-number hover reveals checkboxes, selected boxes stay visible, and the header selects the current page. The selection strip supports clearing and confirmed bulk deletion. Deletion stops on the first failure and reports partial progress rather than concealing it.

Validation: TypeScript/ESLint, production web build, Rust default-workspace check, regenerated API contracts, and the existing disposable-database HTTP scenario extended for relative order, insertion validation/version checks, duplicate relations/files, failure cleanup, independent attachment deletion, and workspace isolation. Focused Playwright checks exercised inline insertion, consecutive Tab/click-away edits, failed-input retention and Escape recovery, keyboard/context-menu access, duplication across reload, and selection/bulk archival. Browser fixtures were archived afterward. Native UI was not changed or retested.

## 2026-10-16 · v0.2.0 · Initial local implementation

Built the Rust workspace, migration-backed PostgreSQL store, authenticated Axum API, shared native HTTP client, CLI, GPUI skeleton, and React workspace. The interface follows a warm-paper terminal aesthetic with table navigation and a docked inspector.

Implemented schemas, typed records, reusable option relations, exact decimal strings, minute durations, safe metadata mutations, archival, optimistic versions, private attachments, filters/sorting/pagination, saved views, CSV preview/atomic commit, keyboard basics, and conflict review. Synthetic Work Logs and Playing Logs fixtures demonstrate the same generic model.

Local setup uses an isolated OrbStack Compose project. Docker registry access was unreliable; an optional PostgreSQL 16 image built from Ubuntu distribution packages is available alongside the default PostgreSQL 17 image. Installed the missing Xcode Metal toolchain to make the GPUI build viable on this Mac.

Verified locally: production web build; TypeScript/ESLint; Rust workspace including GPUI; two focused domain tests; one fresh-database HTTP integration scenario; browser create/edit with a reusable relation; native create/update visible in Web; CLI key-based create/update and attachment upload/download; and a matched PostgreSQL/files backup restored into an isolated database, with content/checksum comparison and an authenticated read (29 records, one attachment). The backup is retained under ignored `.local/backups`.

The native accessibility tree exposes only its window frame, so the native operation was checked through visible controls and API/CLI readback. ECS deployment, production backup scheduling, and remote environment validation were not performed. No real-data import was performed.

Savegame checkpoint: synchronized the Rust workspace, web manifests, API contract, and visible version labels at `0.2.0`. Reused the passing development checks above; checkpoint validation is limited to version/contract consistency and staged-file review.

Remaining baseline work: actual ECS deployment and production restore drill; real Airtable migration; automatic private option-form creation; a full native workflow beyond the schema-based text inspector; account recovery/password rotation; production monitoring and backup scheduling. Native currently loads the first 100 records and uses UUID-array text for relation editing. Offset cursors do not promise a stable export snapshot. Attachment fields remain optional because files are uploaded after record creation.
