# Agenda do vendedor (Google Agenda e Outlook)

Com a agenda conectada, a gravação já nasce com:

- o título do evento;
- os participantes, com nome e e-mail;
- o lead, que é o primeiro participante de fora da empresa que não recusou o convite.

O e-mail do lead também é o que o CRM usa para achar o contato. É só leitura e
não tem custo por hora: o Sales Coach lê direto as APIs do Google e da
Microsoft.

O vendedor conecta em **Agendas → Sua agenda**. A extensão consulta a agenda
quando ele entra numa reunião:

- **Google Meet:** acha o evento pelo código da sala.
- **Teams:** a página nem sempre mostra o id da reunião, então acha pelo título
  ou por ser a única reunião online acontecendo agora.
- **Link avulso do Meet**, que não está na agenda, não é associado a nenhum
  evento. Nesse caso a gravação segue com o título da aba, e a análise
  identifica o lead pela conversa.

## Peças

| Peça | Onde |
| --- | --- |
| Tabelas e colunas novas em `meetings` | `supabase/migrations/20261017090000_calendar_accounts.sql` |
| OAuth, leitura dos eventos, escolha do evento e do lead | `supabase/functions/_shared/calendar.ts` |
| Conectar, voltar do OAuth, status, consultar | `supabase/functions/calendar` |
| Tela | `src/components/CalendarConnect.tsx` (Agendas), participantes em `MeetingDetail` |
| Extensão | `extension/background.js` (`calendarLookup`), `autodetect.js`, `popup.js` |
| Verificação | `supabase/functions/_shared/tests/calendar_check.ts` |

Os tokens ficam criptografados em `calendar_tokens`, que só as edge functions
leem, com a mesma chave dos tokens de CRM (`CRM_TOKEN_KEY`).

## Colocar no ar

A URL de retorno é a mesma nas duas agendas:
`https://xgpfuunmmjkgwjefofcd.supabase.co/functions/v1/calendar`

### Google Agenda

No [Google Cloud Console](https://console.cloud.google.com):

1. Crie um projeto, ou use um existente, e ative a **Google Calendar API**.
2. Configure a **Tela de consentimento OAuth**:
   - tipo **Externo**;
   - nome "Sales Coach", e-mail de suporte, logo;
   - link da política de privacidade;
   - escopos `.../auth/calendar.events.readonly` e `.../auth/userinfo.email`.
3. Em **Credenciais → Criar credenciais → ID do cliente OAuth**, crie uma
   credencial do tipo **Aplicativo da Web**, com a URL de retorno acima em
   "URIs de redirecionamento autorizados".
4. Guarde o ID e a chave secreta nos segredos das funções:
   `GOOGLE_CALENDAR_CLIENT_ID` e `GOOGLE_CALENDAR_CLIENT_SECRET`.

O escopo da agenda é **sensível**. Enquanto o app não passa na verificação do
Google:

- só os e-mails cadastrados como **usuários de teste** (até 100) conseguem
  conectar;
- a conexão cai depois de 7 dias.

Para liberar para clientes, peça a verificação na tela de consentimento. O
Google pede:

- um vídeo mostrando onde e por que a agenda é usada: a tela Agendas e o
  cartão da extensão;
- o domínio verificado;
- a política de privacidade.

A verificação é gratuita. A auditoria paga só é exigida para escopos
restritos, que não usamos.

### Outlook (Microsoft 365)

No [portal do Azure](https://portal.azure.com), em **Microsoft Entra ID →
Registros de aplicativo → Novo registro**:

1. Tipos de conta: **contas em qualquer diretório organizacional e contas
   Microsoft pessoais**.
2. URI de redirecionamento: plataforma **Web**, com a URL acima.
3. Em **Permissões de API → Microsoft Graph → Permissões delegadas**,
   adicione:
   - `Calendars.Read`
   - `User.Read`
   - `offline_access`
   - `openid`
   - `email`
4. Em **Certificados e segredos**, crie um segredo do cliente. Ele vence, então
   anote a data.
5. Guarde nos segredos das funções:
   - o **ID do aplicativo (cliente)** em `MICROSOFT_CALENDAR_CLIENT_ID`;
   - o segredo em `MICROSOFT_CALENDAR_CLIENT_SECRET`.

Em empresas que bloqueiam o consentimento do próprio usuário, o administrador
de TI do cliente precisa aprovar o app uma vez.

### Banco e funções

1. Aplicar `20261017090000_calendar_accounts.sql`.
2. Publicar a função `calendar` sem verificação de JWT (ver
   `supabase/config.toml`), e também as atualizadas: `upload-recording` e
   `analyze-meeting`.

Sem os segredos de uma agenda, o botão dela não aparece. Sem nenhum dos dois,
o cartão "Sua agenda" some da tela.

## Testar antes de publicar

```bash
cd supabase/functions
CRM_TOKEN_KEY=uma-chave-de-teste-com-32-caracteres deno run --allow-env --allow-read --allow-net _shared/tests/calendar_check.ts
```

O teste simula o Google e o Outlook e cobre:

- a escolha do evento pelo código do Meet e pelo título no Teams;
- um link avulso, que não é associado a nenhum evento;
- quem é lead e quem é da equipe;
- salas de reunião ficando de fora;
- a renovação do token, inclusive o refresh token que a Microsoft gira;
- o acesso revogado, que pede para reconectar.
