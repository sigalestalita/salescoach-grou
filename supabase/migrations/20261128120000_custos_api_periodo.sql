-- Custos de API com período de/até (tela Plataforma → Custos de API).
--
-- platform_uso_apis passa a receber o fim do período, para "mês passado" e
-- datas escolhidas. A versão antiga (só o início) sai para não haver duas
-- assinaturas; a função platform-orgs usa a antiga enquanto esta migração não
-- estiver aplicada, só para períodos que terminam agora.

DROP FUNCTION IF EXISTS public.platform_uso_apis(TIMESTAMPTZ);

CREATE FUNCTION public.platform_uso_apis(_desde TIMESTAMPTZ, _ate TIMESTAMPTZ)
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
    WHERE created_at >= _desde AND created_at < _ate
    GROUP BY org_id, provider, operation_type, model_used
  ),
  ao_vivo AS (
    SELECT DISTINCT meeting_id FROM public.api_usage_logs
    WHERE created_at >= _desde AND created_at < _ate AND operation_type = 'live_transcricao' AND meeting_id IS NOT NULL
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
    WHERE m.created_at >= _desde AND m.created_at < _ate
    GROUP BY m.org_id
  ),
  ativos AS (
    SELECT org_id, count(DISTINCT user_id) AS usuarios_ativos FROM (
      SELECT org_id, user_id FROM public.api_usage_logs WHERE created_at >= _desde AND created_at < _ate AND user_id IS NOT NULL
      UNION
      SELECT org_id, seller_id FROM public.meetings WHERE created_at >= _desde AND created_at < _ate
    ) u GROUP BY org_id
  ),
  com_login AS (
    SELECT org_id, count(DISTINCT user_id) AS usuarios FROM public.user_roles GROUP BY org_id
  )
  SELECT jsonb_build_object(
    'desde', _desde,
    'ate', _ate,
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

REVOKE ALL ON FUNCTION public.platform_uso_apis(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_uso_apis(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
