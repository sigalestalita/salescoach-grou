-- Custos de API: duração das reuniões e tempo dos robôs da Recall.
--
-- meetings.duration_seconds não era gravada (a análise só lia), então a Recall
-- aparecia zerada, os minutos por reunião iam a zero e a transcrição depois da
-- reunião era registrada com 0 minutos. A análise passa a gravar a duração do
-- áudio; aqui ela é preenchida nas reuniões antigas, pela última fala da
-- transcrição (ou pelas falas do coach ao vivo), e o consumo de transcrição
-- zerado é refeito com ela.
--
-- O robô passa a guardar o tempo que a Recall cobra (meeting_bots.duracao_segundos,
-- de joining_call até done). A tela usa o total da própria conta na Recall
-- quando consegue (platform-orgs) e esta soma para dividir por empresa.

ALTER TABLE public.meeting_bots ADD COLUMN IF NOT EXISTS duracao_segundos INTEGER;

-- ── Duração das reuniões antigas ────────────────────────────────────────────
UPDATE public.meetings m
   SET duration_seconds = d.segundos
  FROM (
    SELECT t.meeting_id,
           round(max(greatest(
             CASE WHEN jsonb_typeof(f->'end') = 'number' THEN (f->>'end')::numeric ELSE 0 END,
             CASE WHEN jsonb_typeof(f->'start') = 'number' THEN (f->>'start')::numeric ELSE 0 END
           )) / 1000)::int AS segundos
      FROM public.transcriptions t
     CROSS JOIN LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(t.speakers) = 'array' THEN t.speakers ELSE '[]'::jsonb END
     ) f
     GROUP BY t.meeting_id
  ) d
 WHERE d.meeting_id = m.id AND m.duration_seconds IS NULL AND d.segundos > 0;

UPDATE public.meetings m
   SET duration_seconds = d.segundos
  FROM (
    SELECT meeting_id, round(extract(epoch FROM max(created_at) - min(created_at)))::int AS segundos
      FROM public.transcription_segments
     WHERE is_final
     GROUP BY meeting_id
  ) d
 WHERE d.meeting_id = m.id AND m.duration_seconds IS NULL AND d.segundos > 0;

-- ── Transcrição depois da reunião registrada com 0 minutos ──────────────────
UPDATE public.api_usage_logs l
   SET quantity = ceil(m.duration_seconds / 60.0)
  FROM public.meetings m
 WHERE l.meeting_id = m.id
   AND l.operation_type = 'transcricao'
   AND l.provider = 'assemblyai'
   AND l.model_used = 'universal-2'
   AND coalesce(l.quantity, 0) = 0
   AND m.duration_seconds > 0;

-- ── Uso agregado ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_uso_apis(_desde TIMESTAMPTZ, _ate TIMESTAMPTZ)
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
  ),
  -- Robôs da Recall que entraram (ou tentaram entrar) numa chamada: o tempo é o
  -- cobrado pela Recall (meeting_bots.duracao_segundos) ou, nos antigos, o da
  -- reunião gravada.
  robos AS (
    SELECT b.org_id,
           count(*) AS robos,
           coalesce(sum(coalesce(b.duracao_segundos, m.duration_seconds)), 0) / 60.0 AS minutos_robos
    FROM public.meeting_bots b
    LEFT JOIN public.meetings m ON m.id = b.meeting_id
    WHERE b.provider_bot_id IS NOT NULL
      AND b.status NOT IN ('agendado', 'cancelado')
      AND coalesce(b.start_at, b.created_at) >= _desde AND coalesce(b.start_at, b.created_at) < _ate
    GROUP BY b.org_id
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
        'minutos_ao_vivo', coalesce(r.minutos_ao_vivo, 0),
        'robos', coalesce(b.robos, 0),
        'minutos_robos', coalesce(b.minutos_robos, 0)
      ) ORDER BY o.name)
      FROM public.organizations o
      LEFT JOIN com_login l ON l.org_id = o.id
      LEFT JOIN ativos a ON a.org_id = o.id
      LEFT JOIN reunioes r ON r.org_id = o.id
      LEFT JOIN robos b ON b.org_id = o.id
    ), '[]'::jsonb),
    -- Pessoas distintas: quem está em mais de uma empresa conta uma vez só.
    'usuarios_total', (SELECT count(DISTINCT user_id) FROM public.user_roles),
    'usuarios_ativos_total', (
      SELECT count(DISTINCT u) FROM (
        SELECT user_id AS u FROM public.api_usage_logs WHERE created_at >= _desde AND created_at < _ate AND user_id IS NOT NULL
        UNION
        SELECT seller_id FROM public.meetings WHERE created_at >= _desde AND created_at < _ate
      ) x
    ),
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
