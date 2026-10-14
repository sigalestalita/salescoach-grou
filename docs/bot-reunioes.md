# Bot nas reuniões (Recall.ai)

Um participante "Sales Coach · gravação" entra na reunião, avisa no chat que
está gravando e, quando a chamada termina, o áudio vai para o bucket
`meeting-files` e entra na análise de sempre (`analyze-meeting`). Funciona no
Google Meet, no Microsoft Teams e no Zoom.

Dois jeitos de usar, na página **Agendas**:

- **Enviar o bot:** cola o link da reunião, agora ou num horário.
- **Conectar a agenda** (Google ou Outlook): o bot entra sozinho nas reuniões
  com link de vídeo. A regra é do vendedor: só reuniões com alguém de fora da
  empresa (padrão), todas, ou nenhuma (só envio manual).

A reunião aparece na lista desde o agendamento, com o status "Bot agendado".
Na página da reunião, o vendedor acompanha o bot (entrando, sala de espera,
gravando) e pode cancelar.

A extensão continua existindo: é o caminho discreto, sem bot na sala e com
coach ao vivo. O bot não dá dicas ao vivo nesta versão.

## Peças

| Peça | Onde |
| --- | --- |
| Tabelas e status novos | `supabase/migrations/20261015090000_meeting_bots.sql` |
| Cliente da Recall, regra de gravação, assinatura dos webhooks | `supabase/functions/_shared/recall.ts` |
| Ciclo de vida do bot e sincronização da agenda | `supabase/functions/_shared/bots.ts` |
| OAuth do Google e do Outlook | `supabase/functions/_shared/calendar-oauth.ts`, `supabase/functions/calendar-oauth` |
| Ações do app | `supabase/functions/meeting-bot` |
| Webhooks da Recall | `supabase/functions/recall-webhook` |
| Telas | `src/components/BotPanel.tsx`, `src/components/MeetingBotStatus.tsx` |
| Verificação | `supabase/functions/_shared/tests/bots_check.ts` |

## Colocar no ar

1. **Conta na Recall.ai** (<https://www.recall.ai>). Pague conforme o uso na
   região `us-west-2`. Em Developers → API Keys:
   - crie uma chave → `RECALL_API_KEY`
   - gere o segredo de verificação do workspace (começa com `whsec_`) →
     `RECALL_WEBHOOK_SECRET`
2. **Webhook na Recall** (Webhooks → Add Endpoint):
   `https://xgpfuunmmjkgwjefofcd.supabase.co/functions/v1/recall-webhook`,
   com os eventos `bot.*`, `calendar.update` e `calendar.sync_events`.
3. **Google Agenda** (opcional; sem ele, o botão não aparece). No Google Cloud:
   - ative a Google Calendar API;
   - tela de consentimento com os escopos `calendar.events.readonly` e
     `userinfo.email`;
   - credencial OAuth do tipo "Aplicativo da Web" com a URL de retorno
     `https://xgpfuunmmjkgwjefofcd.supabase.co/functions/v1/calendar-oauth`
   - `GOOGLE_CALENDAR_CLIENT_ID` e `GOOGLE_CALENDAR_CLIENT_SECRET`.

   Enquanto o app não passa na verificação do Google (o escopo da agenda é
   sensível), só os usuários de teste cadastrados conseguem conectar, e a
   conexão cai depois de 7 dias. Para clientes, é preciso pedir a verificação
   (o Google pede vídeo do fluxo e política de privacidade).
4. **Outlook** (opcional). No Microsoft Entra (portal do Azure), registre um
   app para "qualquer locatário do Entra ID e contas Microsoft pessoais", com a
   mesma URL de retorno e a permissão delegada `Calendars.Read` →
   `MICROSOFT_CALENDAR_CLIENT_ID` e `MICROSOFT_CALENDAR_CLIENT_SECRET`.
5. **Segredos das funções:** os acima, mais `RECALL_API_BASE` =
   `https://us-west-2.recall.ai`. A volta do OAuth usa a mesma `CRM_TOKEN_KEY`
   da integração com CRM para assinar o `state`.
6. **Banco:** aplicar `20261015090000_meeting_bots.sql`.
7. **Funções:** publicar `meeting-bot`, `recall-webhook` e `calendar-oauth`
   (as duas últimas sem verificação de JWT, ver `supabase/config.toml`).

## Testar antes de publicar

```bash
cd supabase/functions
CRM_TOKEN_KEY=uma-chave-de-teste-com-32-caracteres deno run --allow-env --allow-net --allow-read _shared/tests/bots_check.ts
```

Simula a Recall, o Storage e o banco: envio por link, sala de espera,
gravação, download do áudio, análise disparada, webhook repetido, falha do bot,
cancelamento e sincronização da agenda (só reuniões com gente de fora, sem
duplicar, e retirada do bot quando a regra muda). Antes de liberar para
clientes, vale testar com uma reunião real em cada plataforma.

## O que saber

- **Custo:** a Recall cobra por hora de bot gravando e pelo armazenamento. Os
  minutos entram no consumo da organização como `bot_gravacao`.
- **Sala de espera:** se a reunião tiver sala de espera, alguém precisa admitir
  o bot. Se ninguém admitir, ele desiste e a reunião fica com o erro explicado.
- **Zoom:** dependendo da configuração da conta Zoom do anfitrião, o bot pede
  permissão para gravar. Recusada, a reunião fica com o erro "O anfitrião não
  permitiu a gravação".
- **Bot de última hora:** com menos de 10 minutos de antecedência, o bot sai
  de um grupo de bots prontos da Recall, que pode esgotar em picos. O app avisa
  e pede para tentar de novo.
- **Arquivo grande:** o áudio é copiado em fluxo para o bucket. Se o Storage
  recusar (limite de tamanho do arquivo), a análise lê direto do link da
  Recall, que vale por algumas horas, e a reunião fica sem o player.
- **Consentimento:** o bot se apresenta pelo nome e avisa no chat que está
  gravando, o que ajuda no consentimento exigido pela LGPD.
