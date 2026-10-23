# Novidades e e-mail semanal

As novidades da plataforma aparecem no Início de quem usa e saem num e-mail toda segunda, às 8h, com a marca de cada empresa.

## Como funciona

1. **Rascunho.** Na tela **Plataforma**, quadro "Novidades e e-mail semanal", clique em **Rascunhar com IA**. A IA lê as mudanças publicadas no período (com o `GITHUB_TOKEN`) e as suas anotações, e escreve até 4 novidades para quem usa. Ela ignora o que é interno: testes, banco e correções invisíveis.
2. **Revisão.** Edite o texto, o botão e para quem é cada novidade (executivos, gestores, admins). Clique em **Publicar**. Daí em diante a novidade aparece no Início, no quadro "Novidades", por 30 dias.
3. **Teste.** **Enviar teste para mim** manda o e-mail só para você, com "[Teste]" no assunto.
4. **Envio.**
   - **Automático:** toda segunda às 8h vão as novidades publicadas e ainda não enviadas. Semana sem novidade publicada não tem e-mail.
   - **Manual:** **Enviar agora** manda na hora.
   - Cada pessoa recebe só as novidades do próprio papel, uma vez. Repetir o envio não duplica, e quem deu erro entra de novo na próxima tentativa.
5. **Descadastro.** O rodapé tem o link "Não quero mais receber as novidades", que abre uma página com o botão de confirmar. O e-mail também leva o cabeçalho de descadastro em um clique (Gmail e Outlook).

Destinatários: todas as pessoas com papel numa empresa ativa (teste, ativa ou com pagamento pendente), com e-mail confirmado e sem descadastro.

## Configuração (uma vez)

### 1. Resend

1. Crie a conta em [resend.com](https://resend.com).
2. Em **Domains → Add Domain**, informe `grougp.com.br`. Se preferir separar o e-mail de produto, use um subdomínio, como `mail.grougp.com.br`.
3. O Resend mostra os registros de DNS (SPF, DKIM e, opcionalmente, DMARC). Crie esses registros onde o DNS do domínio é gerenciado e clique em **Verify**. A propagação leva de minutos a algumas horas.
4. Em **API Keys → Create API Key**, crie uma chave com permissão **Sending access**, só para esse domínio.

Planos: o gratuito permite 100 e-mails por dia e 3.000 por mês. Com mais de 100 usuários, o envio de segunda passa do limite diário: use o plano pago.

### 2. Segredos das edge functions (no Lovable: Cloud → Secrets)

| Segredo | Valor |
| --- | --- |
| `RESEND_API_KEY` | a chave criada no Resend |
| `NOVIDADES_FROM` | o remetente, por exemplo `novidades@grougp.com.br`. O nome que aparece é o do produto de cada empresa |
| `NOVIDADES_CRON_SECRET` | um texto aleatório e longo, que você inventa. O agendador usa o mesmo valor |
| `GITHUB_TOKEN` (opcional) | token do GitHub com leitura de pull requests do repositório. Sem ele, a IA rascunha só a partir das anotações |
| `APP_URL` (opcional) | endereço do app nos links do e-mail. Padrão: `https://salescoach.grougp.com.br`. Empresas com domínio próprio usam o delas |

O link de descadastro é assinado com `EMAIL_TOKEN_SECRET`, ou com o `CRM_TOKEN_KEY`, que já existe.

### 3. Banco e funções

- Aplique a migração `20261023170000_novidades.sql`. Ela cria as tabelas e quatro rascunhos com as novidades destas semanas.
- Publique as funções `product-updates` e `email-preferences`.

### 4. Agendamento de segunda

Rode uma vez o `supabase/manual/agendar-novidades.sql` no SQL do projeto, trocando `TROQUE_PELO_SEGREDO` pelo mesmo valor do `NOVIDADES_CRON_SECRET`. Sem esse passo, o envio funciona pelo botão **Enviar agora**.

## Onde fica o código

- `supabase/functions/product-updates`: rascunho, publicação, teste e envio.
- `supabase/functions/email-preferences`: descadastro.
- `supabase/functions/_shared/novidades.ts`: o e-mail, o prompt da IA e o token de descadastro. Os testes estão em `_shared/tests/novidades_check.ts`.
- `src/components/plataforma/Novidades.tsx`: o quadro da tela Plataforma.
- Quadro "Novidades" do Início: `src/pages/Inicio.tsx`.
