#!/bin/sh
set -eu
if [ ! -s "$PGDATA/PG_VERSION" ]; then
    password_file=$(mktemp)
    chmod 600 "$password_file"
    printf '%s\n' "$POSTGRES_PASSWORD" >"$password_file"
    initdb --username="$POSTGRES_USER" --pwfile="$password_file" --auth-host=scram-sha-256 --auth-local=trust
    rm -f "$password_file"
    printf 'host all all all scram-sha-256\n' >>"$PGDATA/pg_hba.conf"
    pg_ctl -D "$PGDATA" -o "-c listen_addresses=localhost" -w start
    createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
    pg_ctl -D "$PGDATA" -m fast -w stop
fi
exec postgres -D "$PGDATA" -c listen_addresses='*'
