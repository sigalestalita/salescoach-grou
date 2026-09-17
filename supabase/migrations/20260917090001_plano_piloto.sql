-- ============================================================================
-- Plano piloto para abrir o produto a empresas em teste.
--
-- Limites por ciclo mensal, nas mesmas chaves dos tipos de operação medidos
-- em api_usage_logs. A cota é verificada antes de disparar cada trabalho,
-- então uma empresa em teste não gera custo além do combinado.
--
-- Os números são um ponto de partida: ajuste em public.plans.limits.
-- ============================================================================

INSERT INTO public.plans (key, name, description, price_cents, limits, features, is_public, sort_order)
VALUES (
  'piloto',
  'Piloto',
  'Período de teste com limites de consumo. Sem cobrança.',
  0,
  '{"transcricao": 300, "analise": 60, "live_coach": 300, "generate_arguments": 100, "extracao_documento": 30}'::jsonb,
  '{"live_coach": true, "chrome_extension": true, "custom_domain": false, "api_access": false}'::jsonb,
  false,
  1
)
ON CONFLICT (key) DO NOTHING;
