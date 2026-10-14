# Sales Coach

SaaS multiempresa (whitelabel) de coaching comercial com IA, da NEXA. Ele analisa
reuniões de venda pela metodologia de cada empresa, orienta o vendedor ao vivo
durante a chamada, treina por voz com clientes simulados e grava o resultado no
CRM do cliente.

Produção: <https://salescoach.grougp.com.br> (também
<https://salescoach-grou.lovable.app>).

## Onde roda

| Peça | Tecnologia | Onde |
| --- | --- | --- |
| Front | Vite + React + TypeScript + shadcn/ui + Tailwind | Lovable (publica a partir da `main`) |
| Backend | Supabase gerenciado pelo Lovable Cloud (projeto `xgpfuunmmjkgwjefofcd`): Postgres com RLS, Auth, Storage, Edge Functions em Deno | Lovable Cloud. Não aparece numa conta do supabase.com: sem CLI nem connection string; o acesso é pelo painel do Lovable |
| Extensão do Chrome | Manifest V3, JavaScript puro | `extension/`; o pacote para download fica em `public/sales-coach-extension.zip` |
| IA | Gateway de IA do Lovable (`ai.gateway.lovable.dev`, modelos Gemini) para análise, coach ao vivo, assistente e argumentos; AssemblyAI para transcrição (arquivo e tempo real); ElevenLabs, OpenAI, Gemini ou Groq para voz no treino, conforme `TTS_PROVIDER` | Chamadas feitas só pelas edge functions |

O Lovable faz commits direto na `main` ("Changes", "Work in progress") e
publica a partir dela. As migrações que ele aplica ficam em `drizzle/` (formato
do Lovable) além de `supabase/migrations/`.

## Mapa do repositório

```
src/
  pages/            telas (rotas em src/App.tsx)
  components/       componentes do app; ui/ = shadcn
  contexts/         sessão (AuthContext) e marca da empresa (BrandingContext)
  lib/              cliente da integração com CRM, voz do treino
  integrations/supabase/  cliente e tipos gerados do banco
  test/             testes (vitest), inclusive os de isolamento entre empresas
supabase/
  migrations/       histórico do schema, em ordem
  functions/        edge functions (uma pasta por função; _shared = código comum)
  tests/            ensaio local das migrações e scripts de operação (ver o README da pasta)
  config.toml       funções que rodam sem verificação de JWT, e por quê
extension/          extensão do Chrome (gravação e coach ao vivo no Meet e no Teams)
docs/               multi-tenant.md (modelo de dados e deploy) e integracao-crm.md
drizzle/            migrações aplicadas pelo Lovable
public/demo/        vídeos sintéticos da organização de demonstração
```

## Modelo de acesso

- **Empresas (multi-tenant):** cada linha de dado de cliente tem `org_id`. A RLS
  filtra por `current_org_id()`, a organização do usuário logado.
  `src/test/rls-isolation.test.ts` falha se alguma policy de tabela de cliente não
  filtrar por organização.
- **Papéis** (`app_role`): `admin`, `gestor` e `vendedor`, por organização
  (`user_roles`; checagem com `has_role()`). O vendedor vê só as próprias
  reuniões; gestor e admin veem as do escopo.
- **Operador da plataforma:** quem está em `platform_admins` acessa `/plataforma`
  (empresas, planos, consumo, situação do CRM), sem acesso a conteúdo de reunião.
- **Edge functions:** usam a service role e validam o chamador por conta própria
  (`getCaller` em `_shared/tenant.ts`). Chamadas entre funções usam o cabeçalho
  `x-internal-secret` (`INTERNAL_FUNCTION_SECRET`) ou a service role.
- **CORS:** lista de origens permitidas (`_shared/cors.ts`, variáveis
  `PLATFORM_DOMAINS`, `ALLOWED_ORIGINS` e `ALLOWED_EXTENSION_IDS`). Sem nenhuma
  delas configurada, volta a `*`. Em produção a restrição está ligada.
- **Tokens de CRM:** criptografados com AES-GCM (`CRM_TOKEN_KEY`) na tabela
  `crm_credentials`, sem acesso pela API pública.

### Edge functions

| Função | Quem chama | Autenticação |
| --- | --- | --- |
| `analyze-meeting` | app, `upload-recording`, `import-bulk-meetings` | usuário (JWT) ou chamada interna |
| `upload-recording`, `import-bulk-meetings` | app, extensão | usuário (JWT) |
| `live-transcribe`, `roleplay-listen` | extensão, treino (WebSocket) | token do usuário na querystring, validado na função (`verify_jwt = false`) |
| `live-coach` | `live-transcribe` | chamada interna ou usuário com acesso à reunião (`verify_jwt = false`) |
| `transcribe-utterance`, `speak-text`, `roleplay-chat`, `roleplay-finish` | treino | usuário (JWT) |
| `sales-assistant-chat`, `generate-arguments`, `extract-document` | app | usuário (JWT) |
| `manage-users`, `accept-invite` | app | usuário (JWT); `manage-users` exige admin |
| `platform-orgs` | `/plataforma` | usuário em `platform_admins` |
| `get-branding` | tela de login | pública: devolve a marca de uma organização pelo host |
| `get-shared-meeting` | link público `/share/:token` | pública: exige compartilhamento ativo, no prazo e não revogado |
| `crm-api` | app | usuário (JWT); ações de configuração exigem admin |
| `crm-oauth` | navegador, na volta do OAuth do CRM | `state` assinado com HMAC, validade de 15 minutos (`verify_jwt = false`) |
| `crm-sync` | `analyze-meeting`, agendador | envio de uma reunião só por chamada interna; a varredura da fila é aberta (`verify_jwt = false`) |

### Segredos (nomes; os valores ficam no Lovable Cloud → Secrets)

`LOVABLE_API_KEY`, `ASSEMBLYAI_API_KEY`, `INTERNAL_FUNCTION_SECRET`,
`CRM_TOKEN_KEY`, `APP_URL`, `PLATFORM_DOMAINS`, `ALLOWED_ORIGINS`,
`ALLOWED_EXTENSION_IDS`, as chaves dos CRMs (`RDSTATION_CRM_*`, `HUBSPOT_*`,
`PIPEDRIVE_*`, `KOMMO_*`), as de voz (`ELEVENLABS_*`, `OPENAI_*`, `GEMINI_*`,
`GROQ_API_KEY`, `TTS_PROVIDER`) e as que trocam o modelo de IA (`*_MODEL`). O
`.env` do repositório tem só a URL do projeto e a chave pública (anon), que vão
para o navegador de qualquer forma.

## Rodar e testar

```bash
bun install          # bun.lock é o lockfile do projeto
bun run dev          # front em http://localhost:8080
bunx vitest run      # testes do front, incluindo os de isolamento por empresa
bunx tsc --noEmit -p tsconfig.app.json
bun audit            # dependências com vulnerabilidade conhecida
```

As verificações dos conectores de CRM rodam em Deno, com CRM e banco simulados
(comandos em `docs/integracao-crm.md`). O ensaio completo das migrações contra
um Postgres local fica em `supabase/tests/ensaio.sh`.

Atenção: `bun run dev` usa o `.env`, ou seja, o backend de **produção**. Para
testar sem risco, use uma conta de uma organização de teste.

## Pontos de partida para a análise de segurança

Fatos levantados na limpeza de outubro de 2026, não conclusões:

- **Credencial no histórico do git:** o commit `618521c` adicionou um script de
  depuração (`repro-extensao.mjs`, já removido) com e-mail e senha de uma conta
  real. A senha precisa ser trocada; o arquivo continua no histórico.
- **Funções sem verificação de JWT do Supabase:** as sete listadas em
  `supabase/config.toml`. Cada uma faz a própria validação, que vale testar.
- **Links públicos:** `/share/:token` (`get-shared-meeting`) expõe uma análise de
  reunião para quem tem o link.
- **Download de arquivos por URL no servidor:** `analyze-meeting` baixa gravações
  de links do Google Drive informados pelo usuário.
- **Extensão:** tem a chave anon embutida e expõe os ícones para todas as páginas
  (`web_accessible_resources` com `<all_urls>`).
- **Texto que vai para a IA:** transcrições, base de conhecimento e documentos
  enviados entram nos prompts (risco de prompt injection).
- **`crm-sync`:** a varredura da fila aceita chamada sem credencial.
- **Dependências:** `bun audit` aponta 72 vulnerabilidades conhecidas (3
  críticas, todas em ferramentas de desenvolvimento: `vitest` e `tinypool`). No
  código que vai para o navegador, o destaque é `react-router` (redirecionamento
  aberto, moderada).
- **Função removida que pode continuar publicada:** `site-lead`, um formulário
  público antigo que gravava em `site_leads`. O código saiu do repositório, mas a
  função precisa ser despublicada no Lovable Cloud. A tabela continua no banco.
