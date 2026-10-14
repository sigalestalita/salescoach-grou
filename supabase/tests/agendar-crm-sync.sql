-- ============================================================================
-- Agenda a fila de envio ao CRM (crm-sync) a cada 10 minutos.
--
-- Precisa das extensões pg_cron e pg_net. O segredo interno fica no Vault do
-- Supabase, nunca escrito aqui: antes de rodar, crie o segredo com o MESMO
-- valor de INTERNAL_FUNCTION_SECRET das edge functions:
--
--   select vault.create_secret('<valor de INTERNAL_FUNCTION_SECRET>', 'internal_function_secret');
--
-- Sem este agendamento, o envio ao fim da análise continua funcionando; o que
-- deixa de acontecer é a nova tentativa automática e a renovação do token de
-- clientes que passam mais de 14 dias sem reunião (o RD Station derruba a
-- conexão nesse caso, e um admin precisa reconectar).
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('crm-sync') where exists (select 1 from cron.job where jobname = 'crm-sync');

select cron.schedule(
  'crm-sync',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://xgpfuunmmjkgwjefofcd.supabase.co/functions/v1/crm-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_function_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
