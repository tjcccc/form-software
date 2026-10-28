# Development log

## 2026-10-28 · v0.4.2 · Repo health check, guards, and web unit tests

Baseline: `pnpm lint` reported zero issues across ESLint, Stylelint, markdownlint, AutoCorrect, Prettier, rustfmt, and Clippy (`-D warnings`, native included on macOS). No crate dependency cycles; client and domain crates had no SQLx or store dependency, and server queries were confined to `auth.rs`. No Markdown hard-wrapping. Files over 800 lines: `web/src/styles/table.css` (1,429) and `editors.css` (997); `crates/server/tests/workflow.rs` (1,022) is a test and exempt.

Guards: `pnpm lint` now runs `scripts/check-db-access.mjs` (client/domain crates may not depend on SQLx or `form-persistence`; server code outside `auth.rs` may not query PostgreSQL) and `scripts/check-file-sizes.mjs` (800-line ratchet, baseline in `.file-size-baseline.json`, generated `schema.d.ts` excluded). Both remain on demand; per project policy no hook or CI step was added.

Refactors: split `table.css` into `table.css`, `table-editing.css`, and `filters.css`, and `editors.css` into `editors.css` and `schema.css`, at existing section boundaries and imported in the original order; the concatenated rules are identical, so the cascade is unchanged. Stylelint overrides carry over to the new files, and the size baseline now has no recorded exceptions. Web column-width bounds (100–800) and the 100-record relation-filter limit now come from shared constants instead of seven literals.

Added a standalone `CLAUDE.md` that mirrors `AGENTS.md`; shared rules must change in both.

Web unit tests: added Vitest (`pnpm test:web`) with 31 cases over pure helpers: decimal-string rounding and currency/percent formatting, duration/key/title/relation display, filter operators and validation (including the 100-choice relation boundary), group keys, and column layout/width clamping. Tests sit beside each module as `*.test.ts`, with shared fixtures in `web/src/testing/fixtures.ts`. Two deliberate mutations (rounding threshold, relation-ID sorting) made the relevant tests fail. Runs in the CI web job after `pnpm check`; component and browser tests remain absent, and the group-key test checks only the web side of the server contract.

Deferred: the web grid derives row group keys locally (`grouping.ts`) in parallel with `push_group` in `form-persistence`; removing that duplication needs an API change, such as returning each record's group key, so it is now documented as a coupled pair in `docs/architecture.md`. `crates/persistence/src/records.rs` (562 lines) and `web/src/styles/app.css` (733) are past the 500-line review threshold but below the limit. Import graphs inside crates and web feature folders were not checked; no tool is installed.

Validation: `pnpm lint`, `pnpm check`, `pnpm build`, a rule-order comparison of the split stylesheets, and positive/negative runs of the database-access guard. No visual check; the CSS order is identical.

Checkpoint: synchronized workspace/web manifests, API metadata, Cargo lock metadata, and visible labels at `0.4.2`; regenerated contracts (version field only). Reused the passing lint, typecheck, unit tests, and build above; reran `cargo check` after the version change.

## 2026-10-19 · v0.4.1 · On-demand lint setup

Added `pnpm lint` and `pnpm lint:fix` for project-authored JavaScript/TypeScript, CSS, Markdown, shell, and Rust. Retained ESLint and Prettier, double quotes, and 140-column web formatting; applied the global 120-column rustfmt baseline and inherited workspace Clippy rules. Added pinned lint dependencies and documented system-tool setup. No hooks, Git hook configuration, or CI changes were made. Generated contracts and runtime/build output remain excluded; the project-owned MVP specification is included. HTML and SQL linting remain deferred.

The initial report found 105 `curly` violations, 29 import-order violations, two Markdown list-spacing issues, one bare URL, one shell formatting mismatch, and 24 Rust files needing formatting. Clippy reported one collapsible condition in both library targets and four `expect` calls in integration-test helpers; the condition was simplified and helpers explicitly retain immediate fixture failures. Applied mechanical fixes and documented approved CSS cascade/specificity exceptions in the README and file-scoped Stylelint overrides. CSS selector precedence and stylesheet import order are preserved.

Checkpoint: synchronized workspace/web manifests, API metadata, and visible labels at `0.4.1`; regenerated contracts. Reused passing development checks below, then checked generated/version metadata, lint, and the web build. No repository safety scanner or active pre-commit hook is configured.

Validation: lint/fix commands, TypeScript/ESLint, production web build, default-workspace Rust check, all three domain tests, and diff review. Clippy also includes native on macOS. No database workflows or browser checks were needed for these mechanical changes.

## 2026-10-16 · v0.4.0 · Field families and manual filters checkpoint

Checkpointed shared field settings for Number formatting, configurable ratings, explicit single/multiple selects and record links, compact manual filters, field descriptions, aligned grid/inspector headers, and fixes for new-column visibility and clipped filter choices. Synchronized workspace/web manifests, Cargo lock metadata, API version, and visible version labels at 0.4.0. Further UI polish remains planned; this checkpoint preserves the current implementation.

Reused passing TypeScript/ESLint, production build, Rust default-workspace check, domain tests, disposable-database API workflow, and focused browser checks recorded below. Checkpoint validation regenerated contracts and checked shared-version consistency and the staged diff. No repository safety scanner or active pre-commit hook was configured; none was installed. Native UI was not retested.

## 2026-10-16 · Field families and grid/picker fixes

Removed the implicit six-column visibility limit in both browser layouts and server width materialization. Unconfigured fields remain visible after refresh; explicit hidden settings remain authoritative. Filter choices now use viewport-constrained fixed positioning with adaptive placement and internal scrolling; focusing search no longer scrolls the dialog or clips its heading/actions.

Unified field creation settings across the column dialog and form designer. Number is one UI family with existing whole/decimal storage contracts, configurable display precision, currency codes, and percent formatting in percentage points. Decimal formatting uses string/BigInt rounding to preserve precision. Ratings use integer values with readable maximum/icon/color JSON configuration, server-validated bounds, and guarded scale reductions. Added inline/inspector icon controls and keyboard input. Single select, Multiple select, and Link to another record are explicit presets over existing canonical relations, including self-links and one/many cardinality. Account assignment remains deferred with future membership and sharing authorization. No migration or binary packing is required.

Validation: TypeScript/ESLint, production build, Rust default-workspace check, domain tests, regenerated contracts, and the existing disposable API scenario extended for default visibility, rating bounds/config changes, incompatible scale reductions, exact decimal persistence, number format changes, and immutable relation settings. Focused browser checks cover seventh-column reload visibility, rating editing, exact large currency display, multiple selection, field preset creation, and filter-popup bounds at desktop, mobile, and short viewport sizes. Disposable fixtures were archived afterward. Native UI remains a simpler scalar editor and was not retested.

## 2026-10-16 · Compact manual filters

Unified toolbar and column filtering in a wide, responsive dialog with compact Field → Operator → Value rows, explicit apply/cancel behavior, field-aware inputs, and local validation. Relation choices are searchable with removable selections and multi-select for any-of/none-of. Empty checks omit the value control. Disabled options remain searchable for historical records. Filtering has no AI features.

Added server-side not-equals, any-of, none-of, and not-empty operators. Relation predicates use canonical links without duplicating source rows; negatives include empty cells. Validated UUID operands and bounded lists, retained legacy relation contains compatibility, and regenerated API contracts. No migration is needed.

Validation: TypeScript/ESLint, production web build, Rust default-workspace check, and the existing disposable-database HTTP workflow extended for typed/relation filters, multi-link counts, missing values, disabled choices, invalid operands, and saved-view round trips. Focused browser checks cover draft validation, choice search/multi-selection, any-of/none-of results, empty checks, desktop alignment, and mobile control/picker bounds. Temporary fixture forms were archived afterward.

## 2026-10-16 · Dialog spacing and field-description consistency

Fixed the column-filter dialog’s missing body padding, aligned its controls/footer with the dialog heading, and constrained filter rows on small screens. Table and record-inspector headers now share a 38px height token rather than independent sizing. Added optional descriptions to the form designer’s Add a field section, reset them after successful creation, and show descriptions in the designer field list. Uses the existing field-description API without server changes.

Validation: TypeScript/ESLint and production build; focused browser checks for filter-control bounds at desktop/mobile sizes, exact table/inspector header alignment, and description creation, reset, persistence, and header tooltip readback. Temporary browser fixture forms were archived afterward. No Rust/API checks were repeated because backend inputs were unchanged.

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
