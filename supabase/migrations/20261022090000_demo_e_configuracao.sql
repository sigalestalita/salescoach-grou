-- ============================================================================
-- Demonstração com prazo e configuração de conta pelo operador.
--
-- 1. organizations.demo_ends_at: a empresa é demonstração até essa data. Depois
--    dela a conta se comporta como suspensa: leitura continua (RLS), escrita e
--    funções param. NULL = sem prazo (cliente normal).
--
-- 2. Modo suporte com edição: o operador da plataforma pode entrar numa conta
--    para configurá-la (base de conhecimento, metodologia, tipos de reunião,
--    marca) antes de entregar ao cliente. "Ver conta" continua só leitura;
--    "Configurar conta" libera a escrita. Entrada e saída vão para audit_log
--    com o modo usado.
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS demo_ends_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.organizations.demo_ends_at IS
  'Fim da demonstração. Depois desta data a conta perde escrita e funções, como se estivesse suspensa. NULL = sem prazo.';

CREATE OR REPLACE FUNCTION public.org_is_active(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = _org_id
      AND status IN ('trial', 'active', 'past_due')
      AND (demo_ends_at IS NULL OR demo_ends_at > now())
  )
$$;

-- O admin da empresa pode editar a própria organização (nome, por exemplo),
-- mas status e prazo da demonstração são da plataforma. Sem esta trava, um
-- admin conseguiria reativar a conta suspensa ou estender a demo sozinho.
CREATE OR REPLACE FUNCTION public.organizations_protect_billing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin(auth.uid())
     AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.demo_ends_at IS DISTINCT FROM OLD.demo_ends_at) THEN
    RAISE EXCEPTION 'Status e prazo da demonstração só podem ser alterados pela plataforma' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_protect_billing ON public.organizations;
CREATE TRIGGER organizations_protect_billing
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_protect_billing();

-- ── Suporte com edição ──────────────────────────────────────────────────────

ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS support_can_edit BOOLEAN NOT NULL DEFAULT false;

-- Verdadeiro quando o usuário atual está no modo suporte só leitura.
CREATE OR REPLACE FUNCTION public.support_read_only()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid()
      AND support_org_id IS NOT NULL
      AND support_until > now()
      AND NOT support_can_edit
  )
$$;
REVOKE ALL ON FUNCTION public.support_read_only() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_read_only() TO authenticated;

-- As policies restritivas passam a bloquear só o modo leitura.
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS support_no_insert ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS support_no_update ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS support_no_delete ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY support_no_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.support_read_only())', t.relname);
    EXECUTE format('CREATE POLICY support_no_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.support_read_only())', t.relname);
    EXECUTE format('CREATE POLICY support_no_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.support_read_only())', t.relname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS support_no_update ON public.organizations;
CREATE POLICY support_no_update ON public.organizations AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.support_read_only());

DROP POLICY IF EXISTS support_no_insert ON storage.objects;
DROP POLICY IF EXISTS support_no_update ON storage.objects;
DROP POLICY IF EXISTS support_no_delete ON storage.objects;
CREATE POLICY support_no_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.support_read_only());
CREATE POLICY support_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.support_read_only());
CREATE POLICY support_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.support_read_only());

-- Entrar: _edit = true libera a escrita.
DROP FUNCTION IF EXISTS public.platform_support_enter(UUID);
CREATE OR REPLACE FUNCTION public.platform_support_enter(_org_id UUID, _edit BOOLEAN DEFAULT false)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_until TIMESTAMP WITH TIME ZONE := now() + INTERVAL '8 hours';
  v_prev UUID;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito à administração da plataforma' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _org_id) THEN
    RAISE EXCEPTION 'Organização não encontrada' USING ERRCODE = 'P0002';
  END IF;

  SELECT support_org_id INTO v_prev FROM public.platform_admins
  WHERE user_id = auth.uid() AND support_until > now();
  IF v_prev IS NOT NULL AND v_prev <> _org_id THEN
    INSERT INTO public.audit_log (org_id, actor_user_id, action, entity, entity_id)
    VALUES (v_prev, auth.uid(), 'support.exit', 'organization', v_prev::text);
  END IF;

  UPDATE public.platform_admins
  SET support_org_id = _org_id, support_until = v_until, support_can_edit = COALESCE(_edit, false)
  WHERE user_id = auth.uid();

  INSERT INTO public.audit_log (org_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (_org_id, auth.uid(), 'support.enter', 'organization', _org_id::text,
          jsonb_build_object('until', v_until, 'modo', CASE WHEN _edit THEN 'edicao' ELSE 'leitura' END));
  RETURN v_until;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_support_exit()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
BEGIN
  SELECT support_org_id INTO v_org FROM public.platform_admins WHERE user_id = auth.uid();
  IF v_org IS NULL THEN RETURN; END IF;
  UPDATE public.platform_admins
  SET support_org_id = NULL, support_until = NULL, support_can_edit = false
  WHERE user_id = auth.uid();
  INSERT INTO public.audit_log (org_id, actor_user_id, action, entity, entity_id)
  VALUES (v_org, auth.uid(), 'support.exit', 'organization', v_org::text);
END;
$$;

DROP FUNCTION IF EXISTS public.platform_support_session();
CREATE OR REPLACE FUNCTION public.platform_support_session()
RETURNS TABLE (org_id UUID, org_name TEXT, until TIMESTAMP WITH TIME ZONE, can_edit BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, pa.support_until, pa.support_can_edit
  FROM public.platform_admins pa
  JOIN public.organizations o ON o.id = pa.support_org_id
  WHERE pa.user_id = auth.uid() AND pa.support_until > now()
$$;

REVOKE ALL ON FUNCTION public.platform_support_enter(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_support_exit() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_support_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_support_enter(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_support_exit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_support_session() TO authenticated;

-- ── Acesso do admin pelo painel da plataforma ───────────────────────────────
-- A função platform-orgs cria o admin da empresa com senha gerada. Quando o
-- e-mail já tem conta, ela precisa do id para gerar uma senha nova. Só o
-- service role chama.
CREATE OR REPLACE FUNCTION public.platform_user_id_by_email(_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.platform_user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_user_id_by_email(TEXT) TO service_role;
