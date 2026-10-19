# FormSoftware

A considered workspace for structured records. Inspired by the precision of terminal interfaces, built around a table and record inspector.

Rust / Axum / PostgreSQL · React / TypeScript · GPUI · `formsw`

## Run locally

Requires Node 24+, pnpm, Rust stable, and OrbStack (or Docker). macOS native builds also require Xcode with the Metal toolchain.

```sh
pnpm install
pnpm dev:setup
pnpm dev
```

Open **<http://127.0.0.1:5173>**. The first startup migrates the isolated development database, provisions the owner, and creates synthetic Work Logs, Playing Logs, Projects, Organizations, Games, and Work Types. Credentials are generated in the ignored, owner-readable `.env`: `FORM_USERNAME` and `FORM_PASSWORD`. Change the password there before the first startup if desired; subsequent starts do not reset an existing account.

The API listens on `127.0.0.1:3141`. PostgreSQL is isolated in the `formsoftware-dev` Compose project and bound only to `127.0.0.1:55437`. Attachment files live in ignored `.local/attachments`. Real Airtable records are never imported automatically.

If Docker Hub is unavailable, use the optional Ubuntu distribution-package fallback:

```sh
pnpm dev:setup --ubuntu-postgres
```

This builds PostgreSQL 16 from Ubuntu's packages inside OrbStack; the default image is PostgreSQL 17. Choose one before initializing a volume. PostgreSQL major versions cannot share an initialized data directory.

## Working workspace

- Create forms and reusable option lists; rename and archive forms.
- Add, rename, reorder, require, and archive fields through the form designer. Number fields support whole/decimal precision and plain/currency/percent display; ratings offer configurable scales, icons, and colors. Single/multiple selects and links use reusable, validated relations.
- Filter with compact field/operator/value conditions, searchable relation choices, any-of/none-of multi-selection, and empty/not-empty checks. Conditions combine with AND and persist in named views.
- Search, sort, filter, group, paginate, adjust column order/visibility, and save named views, including grouping and first-column freeze.
- Drag column boundaries to resize; widths autosave to the current view on release. Escape cancels; keyboard arrows resize. Numeric width inputs also autosave. Failed saves keep the local width and offer Retry. Resizing preserves pending view adjustments.
- Open a column menu for field settings, linked-form management, duplication with data, insert left/right, descriptions, sorting/filtering/grouping, hiding, and archival. The first visible data column freezes by default.
- Create options or linked records directly from an empty relation search. Targets with additional required values must be completed in their form.
- Edit cells inline: Enter/click away saves, Escape cancels, Tab moves to the next cell. Notes, relations, and files use compact cell controls; failed saves retain the draft.
- Right-click rows for Open Editor, insert above/below, duplicate (including files), and confirmed delete. Insertions use inline draft rows and persist manual order; explicit sorts/filters still apply.
- Hover row numbers to select records, select the current page, and delete a selection. Bulk delete reports partial progress and stops at the first failure.
- Use the schema-driven inspector for explicit full-record editing and conflict review.
- Search related records, reuse colored option choices, and disable choices while preserving history.
- Upload/download/remove private attachments (10 MB per file).
- Import CSV with column mapping, row validation, explicit relation resolution, an error report, and atomic commit.
- Use `/`, `N`, Escape, and Cmd/Ctrl+Enter for the main workflow.

`Name` is the immutable primary field key, even when its display label is Summary. Decimal values are strings, duration values are whole minutes, and relation values are arrays of record UUIDs. Newly required fields must already be populated on existing records. Attachment fields remain optional.

## CLI and agents

```sh
cargo run -p formsw -- login
cargo run -p formsw -- forms list
cargo run -p formsw -- schema work_logs --json
cargo run -p formsw -- records list work_logs --search schema --json
cargo run -p formsw -- records add work_logs --input entry.json --json
cargo run -p formsw -- records update RECORD_UUID --expected-version 1 --input patch.json --json
```

`entry.json` and patch files use field keys or field UUIDs directly, for example:

```json
{ "name": "Review the schema", "date": "2026-10-16", "duration": 45, "memo": "Keep the server authoritative." }
```

`--input -` reads stdin. `--data` accepts literal JSON. `--json` is global; machine-readable failures go to stderr. Exit codes: 0 success, 1 transport/local error, 2 invalid input, 3 authentication/authorization, 4 version conflict. Writes never guess an expected version. The archive command itself is explicit, so it does not prompt in headless workflows.

`formsw login` stores its token in macOS Keychain or Windows Credential Manager. `FORM_SERVER` selects an HTTPS server (HTTP is allowed only on loopback); `FORM_TOKEN` supplies an agent/headless token without interactive login. For headless login, `FORM_PASSWORD` supplies the password. Linux currently requires `FORM_TOKEN`; persistent Linux keyring support is deferred. Never commit tokens or credentials.

CSV CLI usage:

```sh
cargo run -p formsw -- import csv work_logs logs.csv --mapping mapping.json --json
# After reviewing the preview:
cargo run -p formsw -- import csv work_logs logs.csv --mapping mapping.json --commit --json
```

A mapping is `{"CSV column":"field_key"}`. Relations use exact existing names or UUIDs; `|` separates multiple values. Import appends new records.

## Native desktop

```sh
pnpm desktop
```

Sign in to the same API. The GPUI client lists forms and records and genuinely creates/edits records through the shared Rust HTTP client. `FORM_SERVER` / `FORM_TOKEN` are optional overrides. Native is an initial skeleton: text-based scalar editors, JSON relation-ID arrays, and the first 100 records; use Web for schema design, attachment management, views, filtering, and CSV import. Native distribution and full parity are future work.

If Xcode reports a missing Metal toolchain: `xcodebuild -downloadComponent MetalToolchain`.

## Development and focused checks

```sh
pnpm check                         # TypeScript + ESLint
pnpm lint                          # on-demand lint and formatting checks
pnpm lint:fix                      # apply supported fixes, then report remaining issues
pnpm build                         # production web build
cargo fmt --all -- --check
cargo check --workspace            # includes native; use default cargo check on Linux CI
cargo test -p form-domain          # two focused validation cases
pnpm test:api                      # one HTTP integration scenario; fresh _sqlx_test_* DB
pnpm contracts                    # regenerate OpenAPI and TypeScript declarations
pnpm backup:check                  # isolated local backup/restore drill; stop the API first
```

The API check refuses remote targets and only administers disposable SQLx databases on this project's local development service. It covers auth/workspace boundaries, invalid-write rollback, relation invariants, concurrent edits, attachments, persistent relative insertion, duplication/file independence, import atomicity, and cookie Origin protection. A short browser check is appropriate when changing interactions; there is no large visual-test suite.

The new lint commands run on demand, without a pre-commit hook or additional CI gate. They cover tracked and unignored new project files with ESLint, Prettier, Stylelint, markdownlint, AutoCorrect, ShellCheck, shfmt, rustfmt, and Clippy. Generated contracts, lockfiles, dependencies, build output, and agent runtime/state directories are excluded; the MVP specification is included. HTML and SQL linting remain deferred. Prettier retains double quotes and 140 columns; rustfmt uses the global 120-column baseline. On macOS, Clippy includes the native workspace member; other platforms check the default workspace members.

Install JavaScript tools with `pnpm install`, Rust tools with `rustup component add rustfmt clippy`, and shell tools with `brew install shellcheck shfmt` on macOS (or your system package manager). `pnpm lint:fix` applies supported fixes and formatting; remaining violations require manual review. Integration-test helpers allow `expect` so fixture and response failures remain immediate.

Stylelint preserves the existing component and state cascade: the four current stylesheets disable `no-descending-specificity`, which compares selectors across unrelated component contexts. Specificity limits are `0,3,1` for editors, `0,4,0` for tokens, and `0,4,1` for tables; tables allow four compound selectors for row states. Other stylesheets retain the global `0,3,0` specificity and three-compound limits. These exceptions preserve existing selectors and their precedence.

## Architecture and delivery

[Architecture](docs/architecture.md) · [UI system](spec/ui.md) · [MVP baseline](docs/mvp-specification.md) · [Deployment guide](docs/deployment.md) · [Development log](DEVLOG.md)

The local workspace is the initial deliverable. ECS deployment, DNS/TLS setup, real Airtable migration, automatic private option lists, purge/restore interfaces, and full native parity require subsequent work. Deployment files are templates; no remote infrastructure is contacted by setup. Use synthetic data until deployment and retention arrangements are approved.
