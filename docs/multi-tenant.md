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
verifica 69 afirmações — entre elas que nenhum dado perde organização, que a
configuração de hoje é preservada, que uma empresa não enxerga a outra e que os
papéis continuam se comportando como antes.

Há também `./supabase/tests/ensaio-colagem.sh`, que ensaia o caminho exato da
colagem: aplica o arquivo consolidado como bloco único e roda a verificação de
produção em cima do resultado.

Qualquer falha interrompe o script. Vale rodar depois de mexer em qualquer
policy.

## Aplicar no Lovable Cloud

O backend do Lovable é um projeto Supabase gerenciado: ele não aparece na sua
conta do supabase.com, então não há connection string nem CLI. O caminho é o
SQL do próprio Lovable (**View Backend → SQL**), com dois arquivos prontos:

1. **`supabase/tests/aplicar-migracoes.sql`** — as 7 migrações em um arquivo só,
   dentro de **uma transação**. Se qualquer comando falhar, nada é aplicado e o
   banco fica exatamente como estava. Não existe estado parcial.
2. **`supabase/tests/verificar-producao.sql`** — somente leitura. Devolve uma
   tabela em que toda linha precisa terminar em `ok`.

A ordem importa: **banco primeiro, código depois**. Se o código novo for
publicado antes das migrações, o front e as funções passam a esperar colunas
que ainda não existem.

Na janela entre uma coisa e outra, o código antigo continua funcionando: um
gatilho deriva a organização do vendedor quando quem insere não a informa, que
é o caso das edge functions rodando com service role.

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

## Identidade visual da plataforma

A casca do sistema — tipografia Poppins, tema claro, menu navy, gradiente
`#071A34 → #15498D` — é da plataforma e vale para todas as empresas. O que
cada organização sobrescreve em runtime: cor principal, cor de destaque, fundo
do menu, logo e nome do produto.

Antes do login, a tela mostra o logotipo completo do Sales Coach (ou o logo da
organização, quando o host resolve uma). Depois do login, só o símbolo. Os
ativos estão em `src/assets/salescoach-*.png`; a versão branca do símbolo é a
variante monocromática para o menu navy.

Uma organização que ainda usa o padrão antigo recebe a paleta nova pelo
`supabase/tests/aplicar-marca.sql`; quem já personalizou não é tocado.

## Quem pode subir cliente novo

**Pelo painel da plataforma** (`/plataforma`). Aparece no menu de quem está em
`platform_admins`. Lista as empresas com plano, usuários, reuniões e consumo do
ciclo; cria empresa nova (com o link de convite do primeiro administrador
pronto para copiar); suspende, reativa e troca plano.

Para liberar o painel e criar o plano piloto, rode
`supabase/tests/abrir-para-testes.sql` uma vez, com o seu e-mail.

**Pelo SQL do backend.** É o caminho de hoje e não exige cadastro nenhum: ali
não há usuário autenticado, e `provision_organization` aceita a chamada. Use
`supabase/tests/novo-cliente.sql`: ajuste nome, subdomínio, produto e e-mail do
administrador, execute, e ele devolve o link do convite.

**Pela função `platform-orgs`.** Exige um usuário cadastrado em
`platform_admins`, que é como se concede o acesso de operador da plataforma:

```sql
INSERT INTO public.platform_admins (user_id, note)
SELECT user_id, 'operação da plataforma'
FROM public.profiles
WHERE full_name = 'SEU NOME';
```

Esse acesso dá visão de organizações, planos e consumo — e nunca de conteúdo
de reunião, transcrição ou base de conhecimento dos clientes. Não há policy que
permita isso a um administrador de plataforma; para dar suporte a um cliente é
preciso ser membro da organização dele.

## Colocar uma empresa nova no ar

1. Cadastre um operador em `platform_admins` (só necessário para o caminho pela
   função; pelo SQL do backend não é preciso).
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

## Coach ao vivo

A cada trecho final da transcrição (no máximo a cada 8 s), a `live-coach`
monta o contexto da organização — persona, metodologia e critérios de
qualificação, faixas de temperatura, tipo de reunião, ofertas e os trechos da
base de conhecimento mais relacionados ao que está sendo dito — e pede uma
única orientação: por que agora (`titulo`) e a frase exata para o vendedor
falar (`acao`). A extensão e o painel da reunião mostram a frase em destaque.

A relevância da base é por sobreposição de termos com a conversa recente, não
por embeddings; é o suficiente para trazer o documento certo quando o lead
cita um produto, uma dor ou um concorrente pelo nome.

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
