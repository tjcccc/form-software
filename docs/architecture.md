# Architecture

FormSoftware is a schema-driven record workspace. One Axum server owns business outcomes; React, GPUI, and the CLI are authenticated HTTP clients. PostgreSQL and attachment files are private to the server.

## Packages and dependency direction

- `form-domain`: pure models, field validators, and serializable contracts. No I/O or application framework dependencies. `utoipa` annotations describe the wire format without performing transport work.
- `form-persistence`: PostgreSQL application operations. Owns schema changes, workspace scoping, transactional relation/attachment writes, and optimistic versions. SQL stays here, apart from identity/session provisioning at the server edge. Public entry point: `Store`.
- `form-server`: configuration, HTTP extraction, auth, uploads, CSV orchestration, and error mapping. Calls the store; it never implements alternative field validators.
- `form-api-client`: authenticated HTTP transport shared by CLI and desktop. Uses the domain contracts and never accesses the database.
- `formsw`: argument parsing, key-to-ID resolution, OS credential storage, and human/JSON output.
- `form-desktop`: GPUI navigation and a minimal record inspector; background HTTP operations use `form-api-client`.
- `web`: React components dispatch intents to feature workflows and `api/client.ts`. Generated TypeScript contracts come from the server's OpenAPI export. CSS tokens live in one system.

Dependencies point from adapters toward the domain. `domain` cannot depend on any other workspace crate. There is no generic repository abstraction, expression engine, or client-owned business model.

## Trust boundaries and invariants

- Every data route authenticates a database-backed, expiring session and establishes an `Actor` with user and workspace IDs. Queries scope resources before use. Foreign workspace resources return 404.
- Cookie writes require an exact configured Origin; the cookie is HttpOnly and SameSite=Strict. Bearer tokens support native/agent clients. Tokens are hashed in PostgreSQL; credentials use Argon2id. Browser tokens are never stored in localStorage.
- All values use immutable field UUID keys. `PATCH` merges submitted fields. The server validates the complete resulting record, rejects unknown/archived fields, and enforces relation targets and cardinality.
- Scalar values live in JSONB. Relations and attachments have canonical normalized tables; the API hydrates these into a record response.
- Schema and record writes lock the source form for this single-owner MVP. This deliberately simple serialization prevents schema validation races. Record versions still detect stale clients and return 409 with the current record. Target-record locks protect references against concurrent archival.
- Attachment uploads are capped at 10 MB, named with generated UUIDs, and downloaded with authorization, forced attachment disposition, and nosniff. A filesystem write precedes metadata commit; failures clean up the file. Failed post-delete cleanup leaves an unreachable file, never a live dangling metadata pointer.
- CSV preview resolves exact existing relation names or explicit UUIDs, rejects ambiguity, and reports errors by row. Commit revalidates, then writes the entire batch in one transaction. Imports append; they do not deduplicate or upsert.
- Manual row order uses a persisted bigint position, initially preserving newest-first order. Relative insertion shifts positions under the existing form lock and checks the anchor version. Explicit field sorts override manual display order. Ordinary creation still prepends.
- Duplication validates active field values and relations as a new assignment. The server copies active attachment files to fresh UUID keys; the store commits the new record, relation rows, attachment metadata, and relative position atomically. Failures clean up copied files. Disabled options must be re-enabled before duplicating a record that uses them.
- Record grouping is evaluated over the filtered collection before offset/limit. The API returns full counts for groups present on the page. Group keys use scalar JSON values, canonical sorted relation-ID sets, or attachment counts; clients render/collapse these groups without redefining membership. Relation sorts use current primary labels, and attachment sorts use file counts.
- Column widths remain in `views.config` JSONB. `PATCH /api/v1/views/{view_id}/columns/{field_id}/width` validates an active field and a 100–800px width, then merges only the width under the form lock. Implicit column layouts are materialized without changing order, visibility, or other preferences. The browser previews drag widths locally and queues release-time writes; it merges saved widths into its view baseline without discarding unrelated local adjustments. Record fetching depends on query settings rather than column layout.
- Field descriptions are optional metadata capped at 4,000 bytes. Positional field creation shifts schema positions under the form lock. Field duplication copies active scalar values, canonical relation rows, and independently copied attachment files in one metadata transaction, bumping affected record versions. The copied primary field is optional. Field archival cleans references from saved views; saving views uses the same form lock to avoid racing schema changes.
- Pagination uses bounded offset cursors (50 default, 100 maximum) with a stable ID tiebreaker. Concurrent inserts may shift pages. Keyset cursors can replace this when volume warrants; this is not a snapshot export API.

## Vocabulary

A **workspace** is an authorization boundary. A **form** defines a collection's schema. A **field** is a stable-ID schema member. A **record** is one versioned object. A **relation** references records in a configured target form. An **option list** is a form with ordinary choice records, plus color/enabled/position fields. A **view** stores column layout, sorting, and AND-combined filters without changing schema.

## Decisions · 2026-10-16

- Web is the complete first workspace; native is a genuine API-connected skeleton with simpler editors. No client silently overwrites stale records.
- Exact decimals travel as strings; durations are integer minutes; dates are calendar dates; datetime values require a timezone. The browser edits datetimes in local time and sends ISO timestamps.
- A required field cannot be added to populated records without a migration/default. Add it optional, populate it, then enable requiredness. Attachment fields remain optional to permit record-first upload.
- Archival retains data and stable IDs. Referenced active records cannot be archived; disable used options instead. Purge and restore UI are deferred.
- Standard option lists are explicitly created and reusable. Automatic private option-list creation is not yet implemented.
