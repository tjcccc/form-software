# FormSoftware — MVP Specification & Implementation Plan

**Status:** Approved scope baseline\
**Date:** 2026-10-15\
**Version:** 0.1\
**Product:** FormSoftware\
**CLI:** `formsw`

## 1. Product philosophy

FormSoftware is a **human-first programmable structured-data platform**. Humans define schemas and primarily create, inspect, correct, and manage records. AI is an optional auxiliary client that can act through the same authenticated APIs as humans; it does not govern or redefine the data structure.

**FormSoftware: structured input → structured output.**\
**miosotis: fragmented input → structured output.**

Not an Excel replacement, general spreadsheet, all-in-one automation platform, or AI-first knowledge manager.

Core principles:

1. One authoritative backend and one business model; Web, GPUI, and CLI are first-class clients.
2. Form is schema; Record is the atomic business object; Field is an immutable-ID schema member; Relation connects records.
3. Common operations are declarative; programmable extensions may come later.
4. Human control of data structure, relationships, and validation.
5. Minimal primitives and composability over a proliferation of special-purpose features.
6. All clients access remote data through the server API, never directly through PostgreSQL.

## 2. Approved MVP choices

- **Default experience:** Table View + Record Inspector.
- **Client sequence:** Web-first; simultaneously establish GPUI application skeleton with at least one genuine end-to-end record operation through the API.
- **Scripting:** Deferred; design extension points only, no expression evaluator or arbitrary code execution in MVP.
- **Backend:** Rust, Axum, PostgreSQL on existing Alibaba Cloud ECS.
- **Web:** React + TypeScript.
- **Desktop:** Rust + GPUI.
- **CLI:** Rust + Clap, command `formsw` (subject to executable collision check).
- **Network:** HTTPS REST JSON API.
- **Future:** Web and GPUI feature parity for all ordinary business operations; platform-specific desktop integrations may be additive.
- **Multi-user/RBAC:** Not shipped in MVP, but workspace ownership, actor identity, and authorization boundaries are designed in from the outset.
- **AI:** No in-app AI in MVP; usable by Codex/Claude Code through documented CLI and JSON API.

## 3. User-facing MVP outcome

The owner can migrate current Airtable Work Logs into FormSoftware, browse the data in a table, edit any record in an inspector, attach files, filter/sort, maintain related Projects, Organizations, and Work Types, and instruct an agent to add/query records through the CLI. A running ECS server and minimally functional GPUI desktop client demonstrate one consistent backend.

**Initial domain fixtures, not hard-coded business logic:**

- `Work Logs`: Date, Summary, Hours/Duration, Type, Project, Organization, Memo, Attachments.
- `Projects`: Name, Organization, Status, Description.
- `Organizations`: Name, Notes.
- `Work Types`: Name, Color, Enabled, Position; an option Form usable by single-select relation.

## 4. Architecture

```text
Web (React)          GPUI Desktop          CLI / agents
     \                    |                    /
      \___________________|___________________/
                          |
                     HTTPS / JSON
                          |
                 Axum API (Rust / ECS)
                          |
               FormSoftware application core
                 |                   |
          PostgreSQL          Attachment storage
```

Web and GPUI may differ in presentation and platform capabilities, **never in authorization, record semantics, schema constraints, or business outcomes**. Keep authoritative validation on the server. Share API contracts through OpenAPI plus generated TypeScript and Rust-compatible DTOs/SDK where practical. A Rust API client crate can be reused by CLI and GPUI.

Suggested monorepo:

```text
formsoftware/
  crates/
    domain/            # domain models, value validation, business rules
    persistence/       # PostgreSQL implementation + migrations
    server/            # Axum routes/auth/uploads/API
    api-client/        # Rust client shared by CLI/desktop
    cli/               # formsw
    desktop/           # GPUI; local integrations reserved
  web/                 # React/TypeScript
  contracts/           # OpenAPI schema / API examples
  deploy/              # Compose/systemd, proxy config, backups
  docs/                # specification, operational runbooks
```

Use boundaries pragmatically; avoid premature microservices or a sophisticated generic repository abstraction.

## 5. Canonical data model

All mutable user forms are **metadata**, not physically new PostgreSQL tables.

### 5.1 Core tables

- `workspaces`: `id`, `slug`, `name`, timestamps. MVP has one workspace; API/resources already scoped by workspace.
- `users`: `id`, `username`, `password_hash` or initial credential identity, timestamps. MVP one active account; never impersonate an implicit unauthenticated user.
- `workspace_memberships`: `workspace_id`, `user_id`, `role` (reserved for future); MVP owner only.
- `forms`: `id`, `workspace_id`, `key`, `name`, `kind` (`standard`/`options`), `description`, `archived_at`, timestamps.
- `fields`: `id`, `form_id`, `key`, `name`, `type`, `position`, `required`, `config JSONB`, `archived_at`, timestamps.
- `records`: `id`, `form_id`, `data JSONB`, `version INTEGER`, `created_by`, `updated_by`, timestamps, `deleted_at` (if soft deletion used).
- `record_relations`: `source_record_id`, `source_field_id`, `target_record_id`, `position`; a unique constraint prevents duplicates; indexed for forward/reverse traversal.
- `attachments`: `id`, `workspace_id`, `record_id`, `field_id`, `filename`, `content_type`, `size_bytes`, `sha256`, `storage_key`, `uploaded_by`, timestamps.
- `views`: `id`, `form_id`, `name`, `type='table'`, `config JSONB`, `is_default`, position.

All identifiers are stable UUIDs; keys (`form.key`, `field.key`) are stable machine-facing identifiers and display names can be edited without changing them. Provide meaningful constraints and foreign keys. Use transaction boundaries for record updates and relation/attachment changes.

### 5.2 JSONB contract

- `records.data` stores **scalar and ordinary values** keyed by immutable field UUID (or stable machine key if consciously chosen and enforced). Use UUID keys for safety against renames.
- `record_relations` is canonical for relation fields, not independently duplicated in JSONB.
- `attachments` is canonical for attachment fields, not independently duplicated in JSONB.
- API returns a normalized record object including scalar field values, relation IDs and attachment descriptors. Clients do not need to know DB representation.
- Field schema is authoritative. Validate inputs server-side. Use transactional writes. Never blindly accept arbitrary JSONB keys.
- MVP use query translation and allowlisted field IDs for filters/sorting; prepare targeted expression indexes when usage warrants. Avoid arbitrary SQL provided by clients.

### 5.3 Relation / option model

**Select is a relation with a different picker UI, not a separate persistence engine.**

- `fields.type = relation`, config includes `target_form_id`, `cardinality: one|many`, `presentation: select|record_picker`.
- Standard single/multi relations use records in an ordinary target Form.
- Option forms (`forms.kind = options`) have default fields such as Name, Color, Enabled and Position; these are actual records.
- Newly created select fields can auto-create a _private-by-default_ option Form, hidden from ordinary navigation; the owner may choose an existing target Form instead.
- Option rename is safe because references use IDs. Disable rather than delete options referenced by history; reject dangerous deletion unless an explicit migration path exists.
- Server checks that a relation's target record belongs to the configured target Form, that cardinality is observed, and that unauthorized/inactive choices are not newly assigned.
- Option data is typically fetched eagerly/cached; large normal relation pickers use paged search.

### 5.4 Schema mutation policy

MVP supports create Form; add Field; rename/reorder/hide Field; edit safe Field metadata; archive Field/Form. Do **not** silently convert persisted types, physically erase populated fields, or redirect active Relations. Return clear validation errors for unsupported schema mutations. Archive retains historical data; physical purging and schema-migration engine are deferred.

### 5.5 Concurrency and identity

Use optimistic versioning: update only if `expected_version` equals current `records.version`; otherwise return HTTP `409 Conflict` with useful machine-readable details. Client must show and resolve the conflict rather than overwriting blindly. Store `created_by`, `updated_by` even with only one MVP account. Enforce workspace-scoped access in server service boundaries.

## 6. MVP field types

- Short text and long text (plain or Markdown-source storage; defer rich-text editor complexity).
- Integer and decimal (use exact decimal validation for amounts; avoid accidental floating-point assumptions).
- Boolean.
- Date and date-time (explicit timezone policy: ISO 8601; store timestamps in UTC).
- Duration (canonical integer minutes; format as `2h 30m` in UI/CLI).
- URL.
- Relation (one/many; option Form is special presentation).
- Attachment (one/many; binary in file storage, metadata in DB).

No computed/formula fields, script engine, rollups, advanced workflows, or complex rich-text collaboration in MVP.

## 7. Views and UI

### 7.1 Web MVP

- Workspace/Form navigation; hidden option forms in their own settings/management surface.
- Table View with column visibility, order, widths, simple sorting, pagination, and simple filter predicates (equals, contains, comparison/range where type-appropriate).
- Record Inspector with schema-driven editors and relation selection.
- Form Designer for fields, type, requiredness, ordering, basic relation configuration and option-record management.
- Basic create/edit/delete-or-archive records, confirmation for destructive actions.
- Attachment upload/download/delete with file-size bounds and server-side authorization.
- Clear loading/error/validation/conflict handling and keyboard basics.
- Amended 2026-10-28: the Table View grid targets Airtable-grade daily editing, replacing the earlier "avoid elaborate grid editing" non-goal. Cells are selected before they are edited, ranges can be selected, copied, cut, pasted, and cleared, and grid edits can be undone and redone. A multi-cell paste is all-or-nothing: if any target record fails validation or changed since it was loaded, the whole paste is refused. Interaction rules live in `spec/ui.md`.
- CSV import for migration with preview/mapping/validation/dry-run and error report. Resolve relational values to target records explicitly; don't silently create duplicates or guess ambiguous mappings.

Avoid spreadsheet formulas, arbitrary cell computation, Kanban/calendar/timeline/dashboard builders, and UI automation designers.

### 7.2 GPUI skeleton with meaningful E2E

- Application launches, authenticates to ECS API, lists available Forms, displays records for one Form, opens a Record Inspector and edits/creates at least one record through the real API.
- No mock-only success criterion. Reserve native integrations as a module boundary; do not implement ChatGPT/local system integration now.
- GPUI should eventually match Web business capabilities but is not a full parity deliverable in this MVP.
- Confirm GPUI support/build targets early on at least the developer's intended platform; do not assume robust cross-platform distribution out of the box.

### 7.3 CLI

- Human-readable output default and machine-readable `--json` output for all meaningful read/write operations.
- Commands such as `formsw login`, `workspace`, `forms list/create/show`, `fields list/add/update`, `records list/get/add/update/archive`, `attachments upload/download`, `import csv`, `schema FORM --json`.
- Accept `--json FILE|-` or `--data` JSON payload without fragile shell escaping. Support stable form/field keys or IDs.
- Deterministic exit statuses and structured errors; no interactive prompt in headless mode, token supplied via secure environment/config.
- Tokens stored in OS secure store where feasible; credentials never logged or embedded in project files. Provide documented environment override for agent sessions.

## 8. API baseline

REST endpoint families (illustrative; exact route names may evolve):

```text
POST   /api/v1/auth/login
GET    /api/v1/workspaces/current
GET    /api/v1/forms
POST   /api/v1/forms
GET    /api/v1/forms/{form_id}/schema
PATCH  /api/v1/forms/{form_id}
POST   /api/v1/forms/{form_id}/fields
PATCH  /api/v1/fields/{field_id}
GET    /api/v1/forms/{form_id}/records?filter=...&sort=...&cursor=...
POST   /api/v1/forms/{form_id}/records
GET    /api/v1/records/{record_id}
PATCH  /api/v1/records/{record_id}
DELETE /api/v1/records/{record_id}
POST   /api/v1/records/{record_id}/attachments
GET    /api/v1/attachments/{attachment_id}
GET    /api/v1/forms/{form_id}/views
POST   /api/v1/forms/{form_id}/views
POST   /api/v1/imports/csv/preview
POST   /api/v1/imports/csv/commit
```

Define request/response JSON contracts and OpenAPI before building two UIs. Pagination must be bounded; record updates should use expected version/ETag semantics. Use a typed filter grammar, not interpolated SQL.

## 9. Security, operations and deployment

Even for one user, ECS is exposed infrastructure: MVP must have actual authentication and authorization on every data/attachment endpoint, strong password hashing, throttled login, secure sessions/tokens, input validation, audit-friendly logs, and no public PostgreSQL port. Configure TLS with Caddy or equivalent reverse proxy; keep DB on localhost/private network. Set CORS narrowly for Web origin; account for CSRF if using cookies.

Run as least-privilege service and keep secrets outside repository. Use migrations, backups (DB plus matching attachment files), restore test, upload size/type restrictions, disk monitoring, and health endpoints. Do not claim backups work without testing a restore.

Use deployment on the user's existing Alibaba Cloud ECS; do not assume DNS/domain ownership or SSH access. Provide a deployment guide and environment template, with secrets omitted. Before putting employer/customer information on personal ECS, obtain the employer's authorization and follow its retention, residency, and security policies. Develop/test with synthetic data until approved.

## 10. Work plan and dependency order

### Phase 0 — Bootstrap and contracts

1. Rust workspace, Web workspace, lint/test CI, configuration strategy.
2. Verify GPUI build viability on target development OS; a minimal launch spike.
3. Define domain vocabulary, identifiers, relation semantics and API contracts/OpenAPI.
4. Set up local PostgreSQL/dev deployment, versioned migrations and fixtures.

**Exit:** CI passes; API contracts exist; empty GPUI app boots; dev DB can migrate from scratch.

### Phase 1 — Core + persistence

1. Workspace/identity, Form/Field schema CRUD and validation.
2. Record JSONB CRUD, type validators, versioning, constraints.
3. Record relations, options Form lifecycle and basic reference pickers.
4. Query/filter/sort/pagination.
5. Unit, integration and transactional tests.

**Exit:** All operations tested via API/integration tests and every invalid write rejected consistently.

### Phase 2 — API, authentication and CLI

1. Axum REST endpoint family, OpenAPI, authentication, CORS/security controls.
2. Shared Rust API client and Clap CLI with structured JSON and predictable exit codes.
3. Attachment upload/download with permissions.
4. CLI schema discovery and agent-friendly examples.

**Exit:** Fresh deployment can be managed headlessly, including relation and attachment round trips.

### Phase 3 — Web-first complete workflow

1. Form navigation and Form Designer.
2. Table View, Record Inspector, validation feedback.
3. Relation/option editors, simple filters/sort, views.
4. CSV import with mapping/preview/validation/report.
5. UX and browser E2E tests.

**Exit:** Original Work Logs scenario works entirely in Web, with real DB and no mock data dependency.

### Phase 4 — Desktop and production readiness

1. GPUI form/record list + inspector + record create/update against real authenticated API.
2. ECS deployment and reverse proxy, backup/restore drill, monitoring basics.
3. End-to-end validation across Web, CLI, GPUI and CSV migration.
4. Docs and defect fixing.

**Exit:** A record created by CLI is visible/editable on Web and GPUI, with consistent validation and conflict behavior.

Parallel work is acceptable after core API contracts stabilize; prioritize contract integration over visual polish.

## 11. Acceptance criteria

1. ECS-hosted Axum API serves authenticated HTTPS requests; DB port isn't public.
2. Web can create/edit/archive Forms and Fields, including a relation to a reusable option Form.
3. Web supports Table View, filter/sort, and schema-driven Record Inspector.
4. PostgreSQL stores typed validated records via JSONB, references in relation table, attachments in file storage.
5. Change a field display name without breaking stored records; archive populated fields without data loss.
6. Renaming a Work Type updates displays but not references; used options cannot be silently deleted.
7. CLI reads schemas, creates/queries/edits records, manages attachments, and returns structured errors/JSON.
8. CSV preview/mapping imports Work Logs with explicit relation resolution and useful errors.
9. GPUI genuinely authenticates, shows records, and creates or edits at least one record through the API.
10. Two concurrent edits demonstrate optimistic conflict detection (`409`), not silent last-write-wins.
11. Automated tests cover type validation, relation target checks, permission enforcement and transactional consistency.
12. A PostgreSQL + attachments backup can be restored to an isolated environment and read successfully.

## 12. Explicitly out of scope

Multi-user UI, invitations and mature RBAC; field/record-level enterprise permissions; real-time collaboration; Scripting/formulas/computed fields; AI chat integration; workflow automation; advanced analytics/dashboard and calendar/Kanban/gallery views; offline-first/sync; mobile native apps; per-form physical SQL tables; broad database-provider abstraction; PostgreSQL direct access from clients.

## 13. Decisions delegated to implementation

- Exact Rust crate versions, UI component library and test runner based on current compatibility.
- Choice of UUID generation and SQL migration library details.
- Session/token mechanism consistent with desktop, Web and CLI security.
- API route spelling and CLI naming refinements, so long as the documented contracts stay coherent.
- Pagination cursor implementation, index choices guided by actual query profiles.
- Attachment object naming and deduplication policy (hash-based storage is an option, not a requirement).

**Guardrail:** Do not expand scope without a specific acceptance failure or explicit product decision. Keep the server authoritative, the clients equivalent in business semantics, and the system understandable to both people and agents.
