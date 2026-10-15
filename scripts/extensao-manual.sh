#!/bin/bash
# Gera public/downloads/sales-coach-extensao-<versão>.zip, a extensão para
# instalação manual (página Extensão do Chrome, "Instalar sem a loja").
#
# Diferente do pacote da Chrome Web Store, este leva a chave pública da
# extensão publicada: instalada à mão, ela fica com o mesmo id da loja
# (icabeghcpefeaeklfldpdfklkjfpbbkd), e o login automático pelo site continua
# funcionando. A chave é pública (não é segredo), mas a loja recusa pacote com
# o campo "key": não envie este zip para a loja.
#
# Rode de novo a cada versão nova da extensão e atualize MANUAL_VERSION em
# src/pages/Extensao.tsx.
set -euo pipefail
cd "$(dirname "$0")/.."

KEY='MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzyHX9D+0ubHnQvYycbp2G9aSxH685fnc6uuBkSCY2f0fmeTv9lr/CjZSBVgvXrdV8kKW1lN5UHf7k/5y04cAnjHxFEF5AgDJwSgBZcpwMZ1b/zarUWGvizJqMb5PB8dpfkStkRgTsTOfshgBd1GTtPg5ECmPnBzsZ2WjxzC4i/DJbnqLivCaSNlbe3mwtxUShRA4o9bX8K8zm0MdN/B29n/RA6XwAhnEJeWDhwhVg1i72MxPlAam8Cq081PufwLfcCC+Lj1DjCjt6e/z1zG4+VLlDl5zEiKmTYGyyhjcx3D/5tz3Hn9emOM/MldXIVU4cePwMMSDaV7fGnL/HvztTwIDAQAB'
VERSION=$(python3 -c "import json;print(json.load(open('extension/manifest.json'))['version'])")
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cp -r extension "$TMP/sales-coach-extensao"
rm -f "$TMP"/sales-coach-extensao/*.md
KEY="$KEY" python3 - "$TMP/sales-coach-extensao/manifest.json" <<'PY'
import json, os, sys
p = sys.argv[1]
m = json.load(open(p))
json.dump({"key": os.environ["KEY"], **m}, open(p, "w"), ensure_ascii=False, indent=2)
PY

mkdir -p public/downloads
rm -f public/downloads/sales-coach-extensao-*.zip
(cd "$TMP" && zip -qr - sales-coach-extensao) > "public/downloads/sales-coach-extensao-$VERSION.zip"
echo "public/downloads/sales-coach-extensao-$VERSION.zip"
