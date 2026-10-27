-- ============================================================================
-- Envio automático do e-mail de novidades: toda segunda, 8h (Brasília).
--
-- Rode UMA vez no SQL do projeto, depois de publicar a função product-updates.
-- Troque TROQUE_PELO_SEGREDO pelo MESMO valor do segredo NOVIDADES_CRON_SECRET
-- das edge functions. O segredo fica no Vault, fora do código.
-- Não é uma migração porque leva o segredo.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT vault.create_secret('TROQUE_PELO_SEGREDO', 'novidades_cron_secret');

-- 11:00 UTC = 8:00 em Brasília.
SELECT cron.schedule(
  'novidades-semanal',
  '0 11 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://xgpfuunmmjkgwjefofcd.supabase.co/functions/v1/product-updates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'novidades_cron_secret')
    ),
    body := '{"action":"cron"}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- Para conferir:   SELECT * FROM cron.job WHERE jobname = 'novidades-semanal';
-- Para desligar:   SELECT cron.unschedule('novidades-semanal');
