# Deployment on ECS

These are reviewable templates, not an executed deployment. No SSH connection, DNS change, or real-data migration has been made. Confirm the ECS host, domain, intended dataset, and backup destination before using these steps.

## Build and runtime

Build for the ECS server's actual Linux architecture, using Rust stable and Node 24+:

```sh
pnpm install --frozen-lockfile
pnpm build
cargo build --release -p form-server -p formsw
```

Install the server binary in `/opt/formsoftware/form-server` and the web output in `/opt/formsoftware/web/dist`. Use a dedicated unprivileged `formsoftware` account. Install PostgreSQL 17 locally or on a private network, create a dedicated database role and database, and keep port 5432 unavailable from the public Internet. The role needs migration permissions only in its own database.

Copy `.env.example` to `/etc/formsoftware/server.env`, owned by root with group-readable access for the service. Set a private database URL, a long unique bootstrap password, `FORM_BIND=127.0.0.1:3141`, `FORM_ORIGIN=https://YOUR_DOMAIN`, `FORM_SECURE_COOKIE=true`, `FORM_SEED_DEMO=false`, and `FORM_STORAGE=/var/lib/formsoftware/attachments`. Create the storage directory owned by the service account. Password provisioning occurs only on an empty database; changing the environment later does not rotate an existing account's password.

Review/install `deploy/formsoftware.service` and `deploy/Caddyfile`. Configure Caddy's `FORM_DOMAIN`, allow public 80/443 for TLS, and leave the API bound to loopback. The server serves the built SPA and API under the same origin. CORS is intentionally unnecessary. Enable the service only after reviewing environment and permissions. Do not use development credentials on ECS.

`GET /health` proves process liveness. Authenticated reads additionally exercise database availability. Login throttling uses the immediate peer address; behind one reverse proxy this is a shared eight-attempt/15-minute bucket, appropriate only for the single-owner deployment. Restarting the process clears the bucket. Do not claim distributed brute-force protection.

## Backup and restore

Database metadata and attachment files form one backup unit. Put a backup in a separate location from the server's data volume and encrypt it at rest. The following procedure requires a maintenance window:

1. Stop the FormSoftware service so no records or files can change.
2. Use PostgreSQL's `pg_dump --format=custom` with credentials supplied through an owner-readable pgpass/environment file, never in a pasted command or log.
3. Copy the attachment tree and save a file checksum manifest. Save the deployed version and migration state with the backup.
4. Restart the service. Confirm authenticated reads work.
5. Restore the dump into a newly created isolated database. Restore attachment files into a separate directory and verify every metadata row has a matching file and checksum. Start an isolated API against those restored resources and authenticate/read a record.
6. Retain the original backup until recovery is verified. Never test by restoring over the live database.

`pnpm backup:check` implements a bounded local drill against the disposable OrbStack service and refuses to run while its API is active. It creates a matched dump/file snapshot, restores into a fresh local database, verifies record counts and attachment hashes, and retains the artifact under `.local/backups`. Production scheduling, retention, off-host upload, alerting, and production restore approval remain operator work.

## Before real data

Review a deployment backup/restore drill, HTTPS/cookie configuration, disk capacity alerts, upload limits, authentication, and database network exposure. Do not treat the local demo as evidence that an ECS deployment or its backups work. Use the CSV preview workflow for Airtable exports and inspect ambiguous relations before committing. Employer/customer data requires the owner's applicable authorization and retention arrangements.

## Current limits

There is one owner, no account recovery/password-rotation UI, no invitations/RBAC management, no offline sync, and no general schema-migration engine. Schema/archive actions retain history. Files removed from metadata may leave an unreachable file if filesystem cleanup fails; inspect logs before reconciling orphan files. Tokens expire after 30 days, and Web sign-out revokes its current session.
