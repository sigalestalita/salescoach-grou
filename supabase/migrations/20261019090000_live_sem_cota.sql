-- ============================================================================
-- Live coach e transcrição ao vivo sem cota nos planos.
--
-- Cada pedido de dica contava 1 na cota "live_coach", mesmo quando a IA não
-- emitia dica. Com o live funcionando a reunião inteira (extensão 1.9.0), são
-- até ~7 pedidos por minuto por vendedor: as 300 do plano piloto acabavam em
-- uns 40 minutos de live somando a empresa toda, e as dicas paravam.
--
-- Sem a chave no plano, check_org_quota trata a métrica como ilimitada. O
-- consumo continua registrado em api_usage_logs (custo por empresa no painel
-- da plataforma), e o recurso continua podendo ser desligado por plano em
-- features.live_coach.
-- ============================================================================

UPDATE public.plans
SET limits = limits - 'live_coach' - 'live_transcricao'
WHERE limits ?| ARRAY['live_coach', 'live_transcricao'];
