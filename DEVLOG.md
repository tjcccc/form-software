# Development log

## 2026-10-16 · v0.2.0 · Initial local implementation

Built the Rust workspace, migration-backed PostgreSQL store, authenticated Axum API, shared native HTTP client, CLI, GPUI skeleton, and React workspace. The interface follows a warm-paper terminal aesthetic with table navigation and a docked inspector.

Implemented schemas, typed records, reusable option relations, exact decimal strings, minute durations, safe metadata mutations, archival, optimistic versions, private attachments, filters/sorting/pagination, saved views, CSV preview/atomic commit, keyboard basics, and conflict review. Synthetic Work Logs and Playing Logs fixtures demonstrate the same generic model.

Local setup uses an isolated OrbStack Compose project. Docker registry access was unreliable; an optional PostgreSQL 16 image built from Ubuntu distribution packages is available alongside the default PostgreSQL 17 image. Installed the missing Xcode Metal toolchain to make the GPUI build viable on this Mac.

Verified locally: production web build; TypeScript/ESLint; Rust workspace including GPUI; two focused domain tests; one fresh-database HTTP integration scenario; browser create/edit with a reusable relation; native create/update visible in Web; CLI key-based create/update and attachment upload/download; and a matched PostgreSQL/files backup restored into an isolated database, with content/checksum comparison and an authenticated read (29 records, one attachment). The backup is retained under ignored `.local/backups`.

The native accessibility tree exposes only its window frame, so the native operation was checked through visible controls and API/CLI readback. ECS deployment, production backup scheduling, and remote environment validation were not performed. No real-data import was performed.

Savegame checkpoint: synchronized the Rust workspace, web manifests, API contract, and visible version labels at `0.2.0`. Reused the passing development checks above; checkpoint validation is limited to version/contract consistency and staged-file review.

Remaining baseline work: actual ECS deployment and production restore drill; real Airtable migration; automatic private option-form creation; a full native workflow beyond the schema-based text inspector; account recovery/password rotation; production monitoring and backup scheduling. Native currently loads the first 100 records and uses UUID-array text for relation editing. Offset cursors do not promise a stable export snapshot. Attachment fields remain optional because files are uploaded after record creation.
