# Multi-tenant e whitelabel

Este documento descreve como o sistema passou de instalação única para
plataforma multi-cliente, o que precisa ser feito no deploy e como colocar uma
empresa nova no ar.

## O princípio

**O código não conhece nenhum cliente.** Metodologia de qualificação, faixas de
temperatura, tipos de reunião, catálogo de dores, tipos de oferta, cores, logo e
nome do produto são dados de cada organização. Os padrões que ficaram no código
são neutros de plataforma (BANT completo, azul, "Sales Coach").

Dois testes protegem isso:

- `src/test/rls-isolation.test.ts` — falha se qualquer policy de tabela com dado
  de cliente não filtrar por organização.
- `src/test/no-tenant-hardcoding.test.ts` — falha se um termo de negócio de um
  cliente específico voltar para dentro do código.

## Ensaiar antes de aplicar

O repositório traz um ensaio que roda a migração inteira contra um Postgres
local, sem depender de Supabase nem de credencial:

```bash
brew install postgresql@16   # uma vez
./supabase/tests/ensaio.sh
```

O script sobe um cluster temporário, aplica um shim do Supabase (papéis,
`auth.uid()`, schema de storage), roda as migrações que já estão em produção,
recria um banco com o estado de hoje (usuários, reuniões, análises, base de
conhecimento, arquivos, links de compartilhamento), aplica as migrações novas e
verifica 56 afirmações — entre elas que nenhum dado perde organização, que a
configuração de hoje é preservada, que uma empresa não enxerga a outra e que os
papéis continuam se comportando como antes.

Qualquer falha interrompe o script. Vale rodar depois de mexer em qualquer
policy.

## Ordem do deploy

As migrações são incrementais e dependentes entre si. Aplique na ordem:

| # | Migração | O que faz |
|---|----------|-----------|
| 1 | `20260914090001_platform_core` | organizações, identidade visual, convites, admins da plataforma, auditoria |
| 2 | `20260914090002_business_config` | tipos de reunião, templates de análise, dores, ofertas |
| 3 | `20260914090003_billing_usage` | planos, assinatura, ledger de consumo, cotas |
| 4 | `20260914090004_org_scoping` | `org_id` nas tabelas existentes, controles de compartilhamento |
| 5 | `20260914090005_backfill_existing_installation` | move os dados atuais para uma organização e grava a configuração de hoje como dado dela |
| 6 | `20260914090006_rls_org_isolation` | `NOT NULL`, reescrita de todas as policies, policies de storage |
| 7 | `20260914090007_provisioning_and_invites` | provisionamento de organização, aceite de convite, marca por host |

> **Antes de aplicar em produção:** a migração 5 identifica a organização já
> existente pelas variáveis `v_org_name` e `v_org_slug`, no topo do arquivo.
> Confira se o nome está como você quer que apareça na interface. Em um banco
> vazio ela não faz nada.

Depois da 6, um usuário sem `org_id` perde acesso — por isso a 5 precisa rodar
antes, e é ela que garante que quem já usa o sistema continue exatamente como
estava: mesmas cores, mesmo logo, mesmos tipos de reunião, mesma metodologia,
mesmos links de compartilhamento que já estavam em circulação, e plano interno
sem limite de consumo.

## Variáveis de ambiente

Nenhuma é obrigatória para o sistema continuar funcionando como hoje. Cada uma
liga uma proteção ou um recurso:

| Variável | Efeito se ausente | Para que serve |
|----------|-------------------|----------------|
| `PLATFORM_DOMAINS` | CORS continua aberto (`*`), como hoje | Lista de domínios da plataforma; qualquer subdomínio deles é aceito |
| `ALLOWED_ORIGINS` | — | Origens extras liberadas (ex.: preview do Lovable) |
| `ALLOWED_EXTENSION_IDS` | Extensão bloqueada quando o CORS estiver restrito | IDs da extensão Chrome autorizados |
| `INTERNAL_FUNCTION_SECRET` | Chamadas internas caem no reconhecimento por service role | Segredo compartilhado entre funções |
| `ANALYSIS_MODEL` | `google/gemini-2.5-flash` | Modelo da análise |
| `LIVE_COACH_MODEL` | `google/gemini-3.5-flash` | Modelo do coach ao vivo |
| `ARGUMENTS_MODEL` | `google/gemini-3-flash-preview` | Modelo do gerador de argumentos |
| `PLATFORM_PRODUCT_NAME` | `Sales Coach` | Nome exibido antes de resolver a marca do cliente |

> Os três modelos ficaram com o valor que já estava em uso, para não mudar o
> comportamento de quem está em produção. Vale conferir se
> `google/gemini-3.5-flash` existe no gateway: se não existir, o coach ao vivo
> nunca emitiu dica e a variável acima resolve sem novo deploy.

## Colocar uma empresa nova no ar

1. Cadastre um operador em `platform_admins` (uma vez, direto no banco):
   ```sql
   INSERT INTO public.platform_admins (user_id, note)
   VALUES ('<uuid do usuário>', 'operação da plataforma');
   ```
2. Chame a função `platform-orgs` com `action: "create_org"`:
   ```json
   {
     "action": "create_org",
     "name": "Empresa Nova",
     "slug": "empresanova",
     "plan_key": "profissional",
     "product_name": "Coach de Vendas",
     "admin_email": "admin@empresanova.com"
   }
   ```
   Isso cria a organização com padrões neutros (BANT, tipos de reunião
   genéricos, azul de plataforma) e devolve o token do convite do primeiro
   administrador.
3. Envie o link `https://<host>/convite/<token>`.
4. O administrador da empresa ajusta marca e metodologia em **Configurações**.

O subdomínio (`empresanova.seudominio.com`) resolve a marca antes do login. Um
domínio próprio é o campo `custom_domain` na organização, apontado por CNAME.

## O que mudou no acesso

- **Cadastro não concede mais acesso.** O gatilho cria só o perfil; organização
  e papel vêm do aceite de convite. Quem se cadastra sem convite cai em
  `/sem-organizacao`.
- **Compartilhamento externo é opt-in.** Reuniões novas nascem com o link
  desativado; ativar define validade e permite revogar. Os links que já estavam
  em uso continuam válidos (o backfill os mantém ativos).
- **Leitura de gravação no storage** exige ser dono do arquivo ou ter acesso à
  reunião, dentro da mesma organização.
- **`live-coach`** só aceita chamada interna ou usuário com acesso à reunião.
- **Administrador da plataforma** vê organizações, planos e consumo — nunca
  conteúdo de reunião, transcrição ou base de conhecimento dos clientes.

## Medição e cotas

Toda operação que custa dinheiro grava em `api_usage_logs` com `org_id`, e um
gatilho mantém `usage_counters` por mês. Os limites ficam em `plans.limits`,
com as chaves iguais aos tipos de operação:

```json
{ "transcricao": 600, "analise": 100, "live_coach": 500, "generate_arguments": 200 }
```

Chave ausente = ilimitado. Organização sem assinatura = sem limite. A
verificação acontece **antes** de disparar o trabalho (`check_org_quota`).

## O que ainda não está pronto

- **Checkout.** O schema de planos e assinatura está montado e os campos
  `external_customer_id` / `external_subscription_id` aguardam o provedor de
  pagamento. Não há integração de cobrança nem webhook.
- **Envio de e-mail de convite.** A função devolve o link; o disparo depende de
  um provedor de e-mail configurado.
- **Marca da extensão Chrome.** Os tipos de reunião já vêm da organização, mas
  nome, ícone e cores da extensão continuam fixos no pacote.
- **RAG.** A base de conhecimento continua sendo concatenada no prompt (agora
  isolada por organização). Embeddings e busca semântica seguem pendentes.
- **Fila de processamento.** A análise continua em `EdgeRuntime.waitUntil`, sem
  retry nem fila de erro.
