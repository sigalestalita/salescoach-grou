-- ============================================================================
-- Atividade dos usuários no painel da plataforma.
--
-- A dona do produto acompanha o uso de todas as empresas: linha do tempo
-- (logins, reuniões, análises, erros, treinos, assistente e ações de
-- administração), resumo por pessoa e, a partir dele, a saúde de cada
-- empresa. Só metadados: quem, o quê, quando e custo. Nada do conteúdo das
-- reuniões, transcrições ou análises (isso continua só no modo suporte).
--
-- Os logins vêm de auth.audit_log_entries e o último acesso de auth.users,
-- que o app não lê. Só a função platform-orgs chama (service role), e ela já
-- exige platform_admins.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.platform_activity(
  _desde  TIMESTAMPTZ,
  _ate    TIMESTAMPTZ,
  _org    UUID DEFAULT NULL,
  _email  TEXT DEFAULT NULL,
  _tipo   TEXT DEFAULT NULL,
  _limite INT DEFAULT 100,
  _offset INT DEFAULT 0
)
RETURNS TABLE (
  em       TIMESTAMPTZ,
  tipo     TEXT,
  org_id   UUID,
  org_nome TEXT,
  user_id  UUID,
  email    TEXT,
  nome     TEXT,
  titulo   TEXT,
  detalhe  TEXT,
  ref      TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH ev AS (
    -- Logins (o histórico completo, quando o Auth registra; senão só o último acesso, no resumo por pessoa).
    SELECT a.created_at AS em, 'login'::TEXT AS tipo, NULL::UUID AS org_id, (a.payload ->> 'actor_id')::UUID AS user_id,
           'Entrou no sistema'::TEXT AS titulo, NULLIF(a.payload -> 'traits' ->> 'provider', '') AS detalhe, NULL::TEXT AS ref
      FROM auth.audit_log_entries a
     WHERE a.payload ->> 'action' = 'login' AND a.created_at BETWEEN _desde AND _ate
       AND (a.payload ->> 'actor_id') ~ '^[0-9a-f-]{36}$'
    UNION ALL
    -- Reunião enviada (gravação da extensão, arquivo ou link).
    SELECT m.created_at, 'reuniao', m.org_id, m.seller_id, 'Reunião enviada',
           CASE WHEN m.file_url IS NOT NULL THEN 'gravação' WHEN m.youtube_url IS NOT NULL THEN 'link' ELSE NULL END, m.id::TEXT
      FROM public.meetings m WHERE m.created_at BETWEEN _desde AND _ate
    UNION ALL
    -- Análise concluída.
    SELECT ar.created_at, 'analise', m.org_id, m.seller_id, 'Análise concluída',
           CASE WHEN ar.overall_score IS NOT NULL THEN 'score ' || ar.overall_score::TEXT END, m.id::TEXT
      FROM public.analysis_results ar JOIN public.meetings m ON m.id = ar.meeting_id
     WHERE ar.created_at BETWEEN _desde AND _ate
    UNION ALL
    -- Análise com erro (a mensagem é técnica, não traz conteúdo da reunião).
    SELECT m.updated_at, 'erro', m.org_id, m.seller_id, 'Análise com erro', left(m.error_message, 300), m.id::TEXT
      FROM public.meetings m WHERE m.status = 'erro' AND m.updated_at BETWEEN _desde AND _ate
    UNION ALL
    -- Treino com cliente simulado.
    SELECT r.created_at, 'treino', r.org_id, r.user_id, 'Treino iniciado',
           concat_ws(' · ', r.training_mode, r.difficulty, CASE WHEN r.overall_score IS NOT NULL THEN 'score ' || r.overall_score::TEXT END), r.id::TEXT
      FROM public.roleplay_sessions r WHERE r.created_at BETWEEN _desde AND _ate
    UNION ALL
    -- Conversa com o assistente.
    SELECT c.created_at, 'assistente', c.org_id, c.user_id, 'Conversa com o assistente', NULL, c.id::TEXT
      FROM public.assistant_conversations c WHERE c.created_at BETWEEN _desde AND _ate
    UNION ALL
    -- Ações de administração e de configuração (audit_log).
    SELECT l.created_at, 'admin', l.org_id, l.actor_user_id, l.action,
           left(NULLIF(l.metadata::TEXT, '{}'), 300), l.entity_id
      FROM public.audit_log l WHERE l.created_at BETWEEN _desde AND _ate
  )
  SELECT ev.em, ev.tipo, COALESCE(ev.org_id, p.org_id), o.name, ev.user_id, u.email::TEXT, p.full_name, ev.titulo, ev.detalhe, ev.ref
    FROM ev
    LEFT JOIN auth.users u ON u.id = ev.user_id
    LEFT JOIN public.profiles p ON p.user_id = ev.user_id
    LEFT JOIN public.organizations o ON o.id = COALESCE(ev.org_id, p.org_id)
   WHERE (_org IS NULL OR COALESCE(ev.org_id, p.org_id) = _org)
     AND (_email IS NULL OR u.email ILIKE '%' || _email || '%' OR p.full_name ILIKE '%' || _email || '%')
     AND (_tipo IS NULL OR ev.tipo = _tipo)
   ORDER BY ev.em DESC
   LIMIT LEAST(GREATEST(_limite, 1), 500) OFFSET GREATEST(_offset, 0)
$$;

-- Resumo por pessoa no período: o que cada uma fez e quanto custou.
CREATE OR REPLACE FUNCTION public.platform_activity_people(_desde TIMESTAMPTZ, _ate TIMESTAMPTZ)
RETURNS TABLE (
  org_id           UUID,
  org_nome         TEXT,
  user_id          UUID,
  email            TEXT,
  nome             TEXT,
  papel            TEXT,
  ultimo_login     TIMESTAMPTZ,
  logins           BIGINT,
  reunioes         BIGINT,
  analises         BIGINT,
  erros            BIGINT,
  treinos          BIGINT,
  assistente       BIGINT,
  custo            NUMERIC,
  ultima_atividade TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT p.org_id, o.name, u.id, u.email::TEXT, p.full_name,
         (SELECT ur.role::TEXT FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.org_id = p.org_id
           ORDER BY CASE ur.role::TEXT WHEN 'admin' THEN 1 WHEN 'gestor' THEN 2 ELSE 3 END LIMIT 1),
         u.last_sign_in_at,
         (SELECT count(*) FROM auth.audit_log_entries a WHERE a.payload ->> 'action' = 'login' AND a.payload ->> 'actor_id' = u.id::TEXT AND a.created_at BETWEEN _desde AND _ate),
         (SELECT count(*) FROM public.meetings m WHERE m.seller_id = u.id AND m.created_at BETWEEN _desde AND _ate),
         (SELECT count(*) FROM public.analysis_results ar JOIN public.meetings m ON m.id = ar.meeting_id WHERE m.seller_id = u.id AND ar.created_at BETWEEN _desde AND _ate),
         (SELECT count(*) FROM public.meetings m WHERE m.seller_id = u.id AND m.status = 'erro' AND m.updated_at BETWEEN _desde AND _ate),
         (SELECT count(*) FROM public.roleplay_sessions r WHERE r.user_id = u.id AND r.created_at BETWEEN _desde AND _ate),
         (SELECT count(*) FROM public.assistant_conversations c WHERE c.user_id = u.id AND c.created_at BETWEEN _desde AND _ate),
         (SELECT COALESCE(sum(l.estimated_cost), 0) FROM public.api_usage_logs l WHERE l.user_id = u.id AND l.created_at BETWEEN _desde AND _ate),
         GREATEST(
           u.last_sign_in_at,
           (SELECT max(m.created_at) FROM public.meetings m WHERE m.seller_id = u.id),
           (SELECT max(r.created_at) FROM public.roleplay_sessions r WHERE r.user_id = u.id),
           (SELECT max(c.created_at) FROM public.assistant_conversations c WHERE c.user_id = u.id)
         )
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.user_id
    LEFT JOIN public.organizations o ON o.id = p.org_id
   WHERE p.org_id IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.platform_activity(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_activity(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, INT, INT) TO service_role;
REVOKE ALL ON FUNCTION public.platform_activity_people(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_activity_people(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- Índices para a linha do tempo por período.
CREATE INDEX IF NOT EXISTS idx_meetings_updated_erro ON public.meetings (updated_at) WHERE status = 'erro';
CREATE INDEX IF NOT EXISTS idx_analysis_results_created ON public.analysis_results (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log (created_at);