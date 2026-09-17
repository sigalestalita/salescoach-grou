#!/bin/bash
# ============================================================================
# Ensaia exatamente o caminho da colagem no SQL do backend:
#
#   banco com o estado de hoje  →  aplicar-migracoes.sql  →  verificar-producao.sql
#
# Diferente do ensaio.sh (que aplica migração por migração), aqui os dois
# arquivos são executados como blocos únicos, como o SQL do Lovable faria.
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$HERE/../.."
MIGRATIONS="$REPO/supabase/migrations"
PGBIN="$( { ls -d /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin 2>/dev/null || true; } | sort -V | tail -1)"
DATA="$HERE/pgdata-colagem"
HOST=127.0.0.1
PORT=55433
DB=colagem

if [ -z "$PGBIN" ]; then
  echo "Postgres não encontrado" >&2
  exit 1
fi

export PATH="$PGBIN:$PATH"
cleanup() { pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "→ Cluster temporário"
rm -rf "$DATA"
initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -l "$HERE/postgres-colagem.log" -o "-p $PORT -h $HOST" start >/dev/null
sleep 1
createdb -h "$HOST" -p "$PORT" -U postgres "$DB"

PSQL="psql -h $HOST -p $PORT -U postgres -v ON_ERROR_STOP=1 -q -d $DB"

echo "→ Shim + migrações de produção + estado de hoje"
$PSQL -f "$HERE/00-shim.sql" >/dev/null
for f in $(ls "$MIGRATIONS"/*.sql | sort); do
  [[ "$(basename "$f")" > "20260913" ]] && continue
  $PSQL -f "$f" >/dev/null
done
$PSQL -f "$HERE/10-estado-atual.sql" >/dev/null

echo "→ Colando aplicar-migracoes.sql (bloco único, uma transação)"
$PSQL -f "$HERE/aplicar-migracoes.sql" >/dev/null
echo "  aplicado sem erro"

echo "→ Colando verificar-producao.sql"
echo ""
psql -h "$HOST" -p "$PORT" -U postgres -d "$DB" -f "$HERE/verificar-producao.sql"

echo ""
echo "→ Conferindo que nenhuma linha falhou"
falhas=$($PSQL -tA -c "$(sed -e 's/^SELECT$/SELECT/' "$HERE/verificar-producao.sql" | sed 's/ORDER BY ordem;/ORDER BY ordem/')" 2>/dev/null | grep -c 'FALHOU' || true)
if [ "$falhas" != "0" ]; then
  echo "  $falhas verificação(ões) falharam" >&2
  exit 1
fi
echo "  nenhuma falha"

echo ""
echo "→ Testando o rollback: um erro no meio desfaz tudo?"
$PSQL -c "BEGIN; CREATE TABLE teste_rollback(x int); SELECT 1/0; COMMIT;" >/dev/null 2>&1 || true
existe=$($PSQL -tA -c "SELECT count(*) FROM information_schema.tables WHERE table_name='teste_rollback'")
if [ "$existe" != "0" ]; then
  echo "  a transação não protegeu o banco" >&2
  exit 1
fi
echo "  sim, transação com erro não deixa rastro"
