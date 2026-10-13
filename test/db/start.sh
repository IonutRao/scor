#!/usr/bin/env bash
# Porneste un PostgreSQL local, gol, pregatit ca un proiect Supabase, si incarca supabase/schema.sql.
# Folosire: test/db/start.sh [director-de-lucru]     Oprire: test/db/start.sh stop [director-de-lucru]
# SCOR_SCHEMA_FILE=test/db/schema-0.2.sql incarca in loc scriptul unei versiuni mai vechi, pentru testele de trecere.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCHEMA="${SCOR_SCHEMA_FILE:-$ROOT/supabase/schema.sql}"
BIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${SCOR_PG_PORT:-54329}"

if [ "${1:-}" = "stop" ]; then
  DIR="${2:-/var/lib/postgresql/scor-test}"
  runuser -u postgres -- "$BIN/pg_ctl" -D "$DIR/data" -m fast stop >/dev/null 2>&1 || true
  exit 0
fi

DIR="${1:-/var/lib/postgresql/scor-test}"
runuser -u postgres -- "$BIN/pg_ctl" -D "$DIR/data" -m fast stop >/dev/null 2>&1 || true
rm -rf "$DIR"
install -d -o postgres -g postgres -m 700 "$DIR"
runuser -u postgres -- "$BIN/initdb" -D "$DIR/data" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
runuser -u postgres -- "$BIN/pg_ctl" -D "$DIR/data" -l "$DIR/log" -w \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=$DIR -c fsync=off" start >/dev/null

run() { psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U postgres -d postgres "$@"; }
run -f "$ROOT/test/db/setup.sql"
if [ "${SCOR_STRICT:-0}" = "1" ]; then
  # Varianta proiectului creat cu "Automatically expose new tables" debifat: nimic nu se acorda implicit.
  run -c "alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
          alter default privileges in schema public revoke all on functions from anon, authenticated, service_role;
          alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
          alter default privileges revoke execute on functions from public;"
fi
run -f "$SCHEMA"
# A doua rulare trebuie sa treaca la fel: scriptul poate fi lipit din nou fara sa strice ceva.
run -f "$SCHEMA"
echo "baza locala porneste pe portul $PORT"
