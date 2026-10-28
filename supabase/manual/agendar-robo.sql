-- ============================================================================
-- Robô automático: a cada 10 minutos, agenda os robôs das próximas 24 horas
-- de quem ligou o modo automático na tela Minha agenda.
--
-- Rode UMA vez no SQL do projeto, depois de publicar a função meeting-bot.
-- Troque TROQUE_PELO_SEGREDO pelo MESMO valor do segredo ROBO_CRON_SECRET
-- das edge functions. O segredo fica no Vault, fora do código.
-- Não é uma migração porque leva o segredo.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT vault.create_secret('TROQUE_PELO_SEGREDO', 'robo_cron_secret');

SELECT cron.schedule(
  'robo-automatico',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xgpfuunmmjkgwjefofcd.supabase.co/functions/v1/meeting-bot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'robo_cron_secret')
    ),
    body := '{"action":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Para conferir:   SELECT * FROM cron.job WHERE jobname = 'robo-automatico';
-- Últimas rodadas: SELECT status_code, content FROM net._http_response ORDER BY created DESC LIMIT 5;
-- Para desligar:   SELECT cron.unschedule('robo-automatico');
