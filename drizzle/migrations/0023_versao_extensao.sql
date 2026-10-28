ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS extensao_versao TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS extensao_vista_em TIMESTAMPTZ;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS extensao_versao TEXT;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Logados leem as configurações públicas" ON public.platform_settings;
CREATE POLICY "Logados leem as configurações públicas" ON public.platform_settings
  FOR SELECT TO authenticated USING (key IN ('extensao_atual'));

CREATE OR REPLACE FUNCTION public.registrar_extensao(_versao TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR _versao IS NULL OR _versao !~ '^[0-9]{1,3}(\.[0-9]{1,5}){0,3}$' THEN
    RETURN;
  END IF;
  UPDATE public.profiles SET extensao_versao = _versao, extensao_vista_em = now() WHERE user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_extensao(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_extensao(TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.platform_activity_people(TIMESTAMPTZ, TIMESTAMPTZ);
CREATE FUNCTION public.platform_activity_people(_desde TIMESTAMPTZ, _ate TIMESTAMPTZ)
RETURNS TABLE (
  org_id UUID,
  org_nome TEXT,
  user_id UUID,
  email TEXT,
  nome TEXT,
  papel TEXT,
  ultimo_login TIMESTAMPTZ,
  logins BIGINT,
  reunioes BIGINT,
  analises BIGINT,
  erros BIGINT,
  treinos BIGINT,
  assistente BIGINT,
  custo NUMERIC,
  ultima_atividade TIMESTAMPTZ,
  extensao_versao TEXT,
  extensao_vista_em TIMESTAMPTZ
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
         ),
         p.extensao_versao,
         p.extensao_vista_em
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.user_id
    LEFT JOIN public.organizations o ON o.id = p.org_id
   WHERE p.org_id IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.platform_activity_people(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_activity_people(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;