# Integração com CRM

O Sales Coach grava no negócio do CRM do cliente o resultado de cada análise:
campos (nota, temperatura, critérios, próximo passo…), uma anotação com o resumo
e uma tarefa com o próximo passo. CRMs disponíveis: **RD Station CRM (API v2)**
e **HubSpot (CRM API v3)**. Pipedrive e Kommo entram como novos conectores, sem
mudar o resto. Cada organização usa um CRM por vez: conectar um desliga o outro.

## Como funciona

1. **Conectar** (admin, em Configurações → Integração com CRM): o admin autoriza
   no RD Station e volta para o app. Os tokens ficam criptografados
   (`crm_credentials`, sem acesso pelo app).
2. **Mapear campos**: para cada dado do Sales Coach, o admin escolhe o campo do
   negócio no CRM e a regra (`Sempre` ou `Só se vazio`). O botão "Criar campos do
   Sales Coach" cria os campos no CRM e já faz o mapeamento.
3. **Enviar**: ao fim de cada análise, a `analyze-meeting` chama a `crm-sync`. O
   negócio é o vinculado na reunião; sem vínculo, o único negócio aberto do
   contato com o e-mail do lead. Com nenhum ou mais de um, o envio fica em
   "Escolha o negócio" e o vendedor escolhe no cartão do CRM da reunião.
4. **Fila**: falhas temporárias (limite de requisições, CRM fora do ar) voltam
   para a fila com espera crescente, até 5 tentativas. Uma nova tentativa não
   repete o que já deu certo (sem anotação ou tarefa duplicadas).

| Peça | Onde |
| --- | --- |
| Tabelas e regras de acesso | `supabase/migrations/20261014090000_crm_integration.sql` |
| Conectar (OAuth) | `supabase/functions/crm-oauth` |
| Ações do app | `supabase/functions/crm-api` |
| Fila e renovação de token | `supabase/functions/crm-sync` |
| Conector RD Station | `supabase/functions/_shared/crm/rdstation.ts` |
| Conector HubSpot | `supabase/functions/_shared/crm/hubspot.ts` |
| Dado → campo, anotação, tarefa | `supabase/functions/_shared/crm/mapping.ts` (testado em `src/test/crm-mapping.test.ts`) |
| Tela de configuração | `src/components/settings/CrmSettings.tsx` |
| Cartão na reunião | `src/components/CrmMeetingCard.tsx` |

A análise passou a pedir à IA a data do próximo passo combinada
(`sales_coach.next_step_date`), usada como prazo da tarefa. Sem data combinada,
a tarefa vence em 2 dias úteis.

## Colocar no ar

1. **App no RD Station** — em <https://appstore.rdstation.com/pt-BR/publisher>,
   criar um app do produto **RD Station CRM** com a URL de retorno
   `https://xgpfuunmmjkgwjefofcd.supabase.co/functions/v1/crm-oauth`. Ele gera o
   `client_id` e o `client_secret`.
   **App no HubSpot** — numa conta de desenvolvedor do HubSpot, criar um app
   público (OAuth) com a mesma URL de retorno e os escopos `oauth`,
   `crm.objects.deals.read`, `crm.objects.deals.write`,
   `crm.objects.contacts.read`, `crm.objects.contacts.write`,
   `crm.schemas.deals.read` e `crm.schemas.deals.write`. Com distribuição pelo
   Marketplace, o app aceita até 25 contas instaladas antes da revisão do
   HubSpot; a listagem pede 3 instalações ativas.
2. **Segredos das edge functions** (Lovable → backend → secrets):
   - `RDSTATION_CRM_CLIENT_ID` e `RDSTATION_CRM_CLIENT_SECRET`: do app da RD
   - `HUBSPOT_CLIENT_ID` e `HUBSPOT_CLIENT_SECRET`: do app do HubSpot
   - `CRM_TOKEN_KEY`: texto aleatório de 32 caracteres ou mais. Se mudar, todas
     as conexões precisam ser refeitas.
   - `APP_URL`: endereço do app (ex.: `https://salescoach.groupp.com.br`), usado
     no link da análise e na volta do OAuth
   - `INTERNAL_FUNCTION_SECRET`: o mesmo que as funções já usam
3. **Banco**: aplicar a migração `20261014090000_crm_integration.sql`.
4. **Funções**: publicar `crm-oauth`, `crm-api`, `crm-sync` e a `analyze-meeting`
   atualizada. `crm-oauth` e `crm-sync` rodam sem verificação de JWT (ver
   `supabase/config.toml`); as duas validam a chamada por conta própria.
5. **Agendamento**: rodar `supabase/tests/agendar-crm-sync.sql` para a fila e a
   renovação dos tokens a cada 10 minutos.

## Testar antes de publicar

```bash
npx vitest run src/test/crm-mapping.test.ts src/test/rls-isolation.test.ts
cd supabase/functions
CRM_TOKEN_KEY=uma-chave-de-teste-com-32-caracteres deno run --allow-env _shared/crm/tests/rdstation_check.ts
CRM_TOKEN_KEY=uma-chave-de-teste-com-32-caracteres deno run --allow-env --allow-net --allow-read _shared/crm/tests/sync_check.ts
CRM_TOKEN_KEY=uma-chave-de-teste-com-32-caracteres deno run --allow-env --allow-net --allow-read _shared/crm/tests/hubspot_check.ts
```

As verificações em Deno usam CRMs e um banco simulados. Antes do piloto,
validar com contas reais:
- **RD Station** (sandbox de parceiro da RD): a documentação tem pequenas
  divergências (endereço do token, `PUT` × `PATCH` no negócio, formato de
  múltipla escolha) que só o teste real confirma.
- **HubSpot** (conta de teste de desenvolvedor, gratuita): conferir a criação
  do grupo e das propriedades "Sales Coach" e a associação de nota e tarefa.

Diferenças entre os dois que o núcleo já trata:
- No HubSpot, uma propriedade de lista grava o `value` da opção; o conector
  traduz o rótulo (ex.: "Muito quente" → `muito_quente`).
- No HubSpot, o "Próximo passo" nativo do negócio (`hs_next_step`) aparece na
  lista de campos, junto com as propriedades personalizadas.
- O refresh token do RD Station morre com 14 dias sem uso (a `crm-sync` renova);
  o do HubSpot vale enquanto o app estiver instalado.

## Limitações desta primeira versão

- RD Station CRM e HubSpot; um CRM por organização.
- Grava no negócio (deal); contato e empresa não são atualizados.
- A etapa do funil não muda sozinha.
- O vendedor escolhe o negócio no app; a escolha direto na extensão do Chrome
  fica para a próxima etapa.
