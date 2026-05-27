# Corrigir transcrição e insights ao vivo na extensão

## Diagnóstico confirmado

O overlay continua mostrando "Aguardando primeiras falas…" e não há **nenhum log** em `live-transcribe` nem em `live-coach`. Isso prova que o WebSocket nem chega às Edge Functions — está sendo barrado antes, no gateway do Supabase.

Três causas reais no código atual:

1. **Falta `apikey` no WebSocket** — `extension/content.js` abre `wss://…/live-transcribe?meetingId=…&token=…`, mas o gateway de Edge Functions do Supabase exige `apikey` em toda requisição (mesmo com `verify_jwt = false`). Como `WebSocket` do browser não permite headers customizados, é obrigatório passar `?apikey=…` na URL. Sem isso, o handshake é rejeitado antes da função rodar.

2. **CSP do Google Meet bloqueia `import('https://esm.sh/@supabase/supabase-js')`** — mesmo se o WS funcionasse, a subscrição em `live_tips` falharia silenciosamente, então as dicas nunca apareceriam no overlay.

3. **`live-transcribe` abre um WebSocket dummy e fecha** antes de criar o real com token temporário — código morto que pode falhar e mascarar erros reais.

## O que vai mudar

**`extension/content.js`**
- Adicionar `&apikey=<ANON_KEY>` na URL do `live-transcribe`.
- Substituir o `import()` dinâmico do `@supabase/supabase-js` por um **WebSocket cru** no endpoint Realtime do Supabase (`wss://<ref>.supabase.co/realtime/v1/websocket?apikey=…&vsn=1.0.0`), enviando o frame `phx_join` para o tópico de `live_tips` filtrado por `meeting_id`. Isso elimina o problema de CSP.
- Logar `onerror`/`onclose` (code/reason) dos WebSockets no console para diagnóstico futuro.

**`supabase/functions/live-transcribe/index.ts`**
- Remover o WebSocket dummy; abrir somente a conexão real com AssemblyAI usando o token temporário.
- Adicionar logs de boot, `onopen`, `onclose` e `onerror` da conexão com AssemblyAI para aparecer em `edge_function_logs`.

**Reempacotar a extensão**
- Regenerar `public/sales-coach-extension.zip` e subir a `version` em `extension/manifest.json` para o Chrome detectar a atualização ao recarregar.

## Fora do escopo
- Overlay/UX, fluxo de gravação/upload, `live-coach`, schema do DB, BAN/MEDDIC, dashboard — nada disso muda.

## Como validar
1. Reinstalar a extensão atualizada (Recarregar em `chrome://extensions`).
2. Iniciar reunião: o flag **LIVE** deve ficar laranja em ~2s.
3. Após ~5–10s de fala, a "Transcrição" preenche e a primeira dica aparece em "Dicas ao vivo" (throttle de 12s).
4. Logs em `live-transcribe` mostram eventos `Turn`; logs em `live-coach` mostram `emitted: true`.
