#!/bin/bash
# Ensaio do seed de demonstração (Sales Rocket) em um Postgres local:
# sobe o cluster, aplica shim + todas as migrações + estado atual, roda o
# seed duas vezes (para provar que é reexecutável) e imprime a conferência.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$HERE/../.."
MIGRATIONS="$REPO/supabase/migrations"
PGBIN="$( { ls -d /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin 2>/dev/null || true; } | sort -V | tail -1)"
DATA="$HERE/pgdata"; HOST=127.0.0.1; PORT=55432; DB=ensaio
export PATH="$PGBIN:$PATH"
cleanup() { pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; }
trap cleanup EXIT
pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true
rm -rf "$DATA"; initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -l "$HERE/postgres.log" -o "-p $PORT -h $HOST" start >/dev/null; sleep 1
PSQL="psql -h $HOST -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
createdb -h "$HOST" -p "$PORT" -U postgres "$DB"
$PSQL -d "$DB" -f "$HERE/00-shim.sql" >/dev/null
for f in $(ls "$MIGRATIONS"/*.sql | sort); do [[ "$(basename "$f")" > "20260913" ]] && continue; $PSQL -d "$DB" -f "$f" >/dev/null; done
$PSQL -d "$DB" -f "$HERE/10-estado-atual.sql" >/dev/null
for f in $(ls "$MIGRATIONS"/*.sql | sort); do [[ "$(basename "$f")" > "20260913" ]] || continue; $PSQL -d "$DB" -f "$f" >/dev/null; done
echo "→ Seed (1ª execução)"
$PSQL -d "$DB" -f "$HERE/seed-sales-rocket.sql" >/dev/null
echo "→ Seed (2ª execução, deve substituir sem duplicar)"
psql -h $HOST -p $PORT -U postgres -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/seed-sales-rocket.sql" | grep -v "^DO$"
echo "→ Isolamento: a Grou continua com os dados dela"
psql -h $HOST -p $PORT -U postgres -tA -d "$DB" -c "SELECT o.name || ': ' || count(m.id) || ' reuniões' FROM public.organizations o LEFT JOIN public.meetings m ON m.org_id = o.id GROUP BY o.name ORDER BY 1"
