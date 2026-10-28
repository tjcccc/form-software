# CLAUDE.md

FormSoftware is a schema-driven record workspace: one Axum server, with React web, GPUI desktop, and the `formsw` CLI as authenticated HTTP clients. PostgreSQL and attachment files are private to the server.

`AGENTS.md` holds the same project rules for other coding agents. When a shared rule changes, update both files.

## Read First

- `docs/architecture.md`: crate boundaries, trust boundaries, and invariants. Read it before changing a crate or API behavior.
- `spec/ui.md`: read it before web UI changes.
- `docs/mvp-specification.md` is the scope baseline; `DEVLOG.md` records what is implemented and what is still missing.

## Boundaries

- The server owns validation, relation semantics, authorization, and version checks. Clients never re-implement business rules or silently overwrite stale records.
- Only `form-persistence` and server auth/session code may query PostgreSQL. Web, desktop, and CLI go through HTTP (`form-api-client` for Rust clients).
- `form-domain` stays pure: no I/O and no dependency on other workspace crates.
- Records use immutable field UUIDs on the wire; agent-facing input uses stable keys. Relations and attachments live in canonical tables, never copied into record JSONB.

## Generated Files

- Run `pnpm contracts` after changing API types or routes. Never hand-edit `contracts/openapi.json` or `web/src/api/schema.d.ts`.

## Data Safety

- `formsoftware_dev` and SQLx-created `_sqlx_test_*` databases on `127.0.0.1:55437` are disposable fixtures. Never point `pnpm test:api` or `pnpm backup:check` at real data.
- Use synthetic data until deployment and retention arrangements are approved; real Airtable migration is future work.

## Checks

- Default: `pnpm check`, `pnpm build`, `cargo check`, plus the affected tests (`pnpm test:web`, `cargo test -p form-domain`, `pnpm test:api`). Web unit tests sit next to the module as `*.test.ts` and share fixtures from `web/src/testing/fixtures.ts`.
- Native desktop checks need macOS/Xcode; keep them out of default Linux CI.
- Run `pnpm lint` or `pnpm lint:fix` only on demand. Do not add lint hooks or CI enforcement.
- `pnpm lint` also runs `scripts/check-db-access.mjs` (database boundary) and `scripts/check-file-sizes.mjs` (800-line ratchet). After splitting a recorded file, run `node scripts/check-file-sizes.mjs --update`.
- Web stylesheets are imported in cascade order in `web/src/main.tsx`; keep that order when splitting or adding sheets.
