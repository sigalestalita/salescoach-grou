-- Custos de sustentação das APIs (tela Plataforma → Custos de API).
--
-- O uso já fica registrado: api_usage_logs (AssemblyAI em minutos, Gemini em
-- tokens, pelo gateway da Lovable) e meetings (gravações do robô da Recall.ai,
-- com a duração). Esta função só soma por empresa e por tipo de uso, no banco,
-- para a tela não precisar baixar milhares de linhas (o coach ao vivo registra
-- uma linha por dica). O preço de cada API fica numa tabela editável pela
-- administração da plataforma; o cálculo do custo e da projeção é feito na tela.

-- ── Preços (uma linha só) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_custos_precos (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  precos JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

-- Só a função platform-orgs (service role) lê e grava.
ALTER TABLE public.platform_custos_precos ENABLE ROW LEVEL SECURITY;

-- ── Uso agregado desde uma data ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_uso_apis(_desde TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH logs AS (
    SELECT org_id, provider, operation_type, model_used,
           count(*)                         AS chamadas,
           coalesce(sum(input_tokens), 0)   AS tokens_entrada,
           coalesce(sum(output_tokens), 0)  AS tokens_saida,
           coalesce(sum(quantity), 0)       AS quantidade,
           max(unit)                        AS unidade
    FROM public.api_usage_logs
    WHERE created_at >= _desde
    GROUP BY org_id, provider, operation_type, model_used
  ),
  ao_vivo AS (
    SELECT DISTINCT meeting_id FROM public.api_usage_logs
    WHERE created_at >= _desde AND operation_type = 'live_transcricao' AND meeting_id IS NOT NULL
  ),
  reunioes AS (
    SELECT m.org_id,
           count(*)                                                           AS reunioes,
           coalesce(sum(m.duration_seconds), 0) / 60.0                        AS minutos,
           count(*) FILTER (WHERE m.meeting_bot_id IS NOT NULL)               AS reunioes_robo,
           coalesce(sum(m.duration_seconds) FILTER (WHERE m.meeting_bot_id IS NOT NULL), 0) / 60.0 AS minutos_robo,
           count(*) FILTER (WHERE m.id IN (SELECT meeting_id FROM ao_vivo))   AS reunioes_ao_vivo,
           coalesce(sum(m.duration_seconds) FILTER (WHERE m.id IN (SELECT meeting_id FROM ao_vivo)), 0) / 60.0 AS minutos_ao_vivo
    FROM public.meetings m
    WHERE m.created_at >= _desde
    GROUP BY m.org_id
  ),
  ativos AS (
    SELECT org_id, count(DISTINCT user_id) AS usuarios_ativos FROM (
      SELECT org_id, user_id FROM public.api_usage_logs WHERE created_at >= _desde AND user_id IS NOT NULL
      UNION
      SELECT org_id, seller_id FROM public.meetings WHERE created_at >= _desde
    ) u GROUP BY org_id
  ),
  com_login AS (
    SELECT org_id, count(DISTINCT user_id) AS usuarios FROM public.user_roles GROUP BY org_id
  )
  SELECT jsonb_build_object(
    'desde', _desde,
    'empresas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'org_id', o.id,
        'nome', o.name,
        'status', o.status,
        'usuarios', coalesce(l.usuarios, 0),
        'usuarios_ativos', coalesce(a.usuarios_ativos, 0),
        'reunioes', coalesce(r.reunioes, 0),
        'minutos', coalesce(r.minutos, 0),
        'reunioes_robo', coalesce(r.reunioes_robo, 0),
        'minutos_robo', coalesce(r.minutos_robo, 0),
        'reunioes_ao_vivo', coalesce(r.reunioes_ao_vivo, 0),
        'minutos_ao_vivo', coalesce(r.minutos_ao_vivo, 0)
      ) ORDER BY o.name)
      FROM public.organizations o
      LEFT JOIN com_login l ON l.org_id = o.id
      LEFT JOIN ativos a ON a.org_id = o.id
      LEFT JOIN reunioes r ON r.org_id = o.id
    ), '[]'::jsonb),
    'uso', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'org_id', org_id, 'provedor', provider, 'operacao', operation_type, 'modelo', model_used,
        'chamadas', chamadas, 'tokens_entrada', tokens_entrada, 'tokens_saida', tokens_saida,
        'quantidade', quantidade, 'unidade', unidade
      ))
      FROM logs
    ), '[]'::jsonb)
  )
$$;

REVOKE ALL ON FUNCTION public.platform_uso_apis(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_uso_apis(TIMESTAMPTZ) TO service_role;
