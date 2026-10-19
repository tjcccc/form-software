# FormSoftware

- Read `docs/architecture.md` for crate boundaries and `spec/ui.md` before UI changes. `docs/mvp-specification.md` is the scope baseline; `DEVLOG.md` records implemented scope and gaps.
- The server owns validation, relation semantics, authorization, and version checks. Web/native/CLI must use HTTP; only persistence and server auth code may query PostgreSQL.
- Keep immutable field UUIDs on the wire and stable keys in agent-facing input. Never duplicate canonical relations or attachments into record JSONB.
- Generate contracts with `pnpm contracts`; do not hand-edit `contracts/openapi.json` or `web/src/api/schema.d.ts`.
- Local `formsoftware_dev` and SQLx-created test databases on port 55437 are disposable fixtures. Never point `test:api` or `backup:check` at real data.
- Default checks are `pnpm check`, `pnpm build`, `cargo check`, and affected domain/API tests. Native needs macOS/Xcode; keep native checks outside default Linux CI.
- Run `pnpm lint` or `pnpm lint:fix` on demand; do not add lint hooks or CI enforcement.
