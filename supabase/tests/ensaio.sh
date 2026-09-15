#!/bin/bash
# ============================================================================
# Ensaio completo da migração multi-tenant em um Postgres local.
#
#   1. sobe um Postgres temporário
#   2. aplica o shim do Supabase
#   3. aplica as migrações que já estão em produção
#   4. insere dados equivalentes aos de hoje
#   5. aplica as migrações novas (inclusive o backfill)
#   6. roda a verificação
#
# Falha no primeiro erro, em qualquer etapa.
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$HERE/../.."
MIGRATIONS="$REPO/supabase/migrations"
PGBIN="$( { ls -d /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin 2>/dev/null || true; } | sort -V | tail -1)"
DATA="$HERE/pgdata"
HOST=127.0.0.1
PORT=55432
DB=ensaio

if [ -z "$PGBIN" ]; then
  echo "Postgres não encontrado" >&2
  exit 1
fi

export PATH="$PGBIN:$PATH"

cleanup() {
  pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "→ Preparando cluster temporário"
rm -rf "$DATA"
initdb -D "$DATA" -U postgres --auth=trust >/dev/null

pg_ctl -D "$DATA" -l "$HERE/postgres.log" \
  -o "-p $PORT -h $HOST" start >/dev/null
sleep 1

PSQL="psql -h $HOST -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"

createdb -h "$HOST" -p "$PORT" -U postgres "$DB"
echo "  Postgres $(psql -h "$HOST" -p "$PORT" -U postgres -tAc 'show server_version' "$DB") pronto"

echo "→ Aplicando shim do Supabase"
$PSQL -d "$DB" -f "$HERE/00-shim.sql" >/dev/null

echo "→ Aplicando as migrações que já estão em produção"
count=0
for f in $(ls "$MIGRATIONS"/*.sql | sort); do
  case "$(basename "$f")" in
    20260914*) continue ;;
  esac
  $PSQL -d "$DB" -f "$f" >/dev/null
  count=$((count + 1))
done
echo "  $count migrações antigas aplicadas"

echo "→ Recriando o estado de hoje (usuários, reuniões, análises, arquivos)"
$PSQL -d "$DB" -f "$HERE/10-estado-atual.sql" >/dev/null

echo "→ Aplicando as migrações novas"
for f in $(ls "$MIGRATIONS"/20260914*.sql | sort); do
  echo "  $(basename "$f")"
  $PSQL -d "$DB" -f "$f" >/dev/null
done

echo "→ Verificando"
psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -d "$DB" \
  -f "$HERE/20-verificacao.sql" 2>&1 | grep -v '^SET$\|^DO$\|^BEGIN$\|^ROLLBACK$\|^CREATE FUNCTION$'
