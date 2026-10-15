ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS support_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS support_until  TIMESTAMP WITH TIME ZONE;

COMMENT ON TABLE public.platform_admins IS
  'Operadores do SaaS. Veem metadados de todas as organizações e, no modo suporte (support_org_id), o conteúdo de uma organização por vez, só leitura e com registro em audit_log.';

CREATE OR REPLACE FUNCTION public.support_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT support_org_id FROM public.platform_admins
  WHERE user_id = auth.uid()
    AND support_org_id IS NOT NULL
    AND support_until > now()
$$;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.support_org_id(),
    (SELECT org_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id = auth.uid() AND public.support_org_id() IS NOT NULL THEN _role = 'admin'
    ELSE EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE ur.user_id = _user_id
        AND ur.role = _role
        AND ur.org_id IS NOT DISTINCT FROM p.org_id
    )
  END
$$;

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
    EXECUTE format('CREATE POLICY support_no_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.support_org_id() IS NULL)', t.relname);
    EXECUTE format('CREATE POLICY support_no_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.support_org_id() IS NULL)', t.relname);
    EXECUTE format('CREATE POLICY support_no_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.support_org_id() IS NULL)', t.relname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS support_no_update ON public.organizations;
CREATE POLICY support_no_update ON public.organizations AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.support_org_id() IS NULL);

DROP POLICY IF EXISTS support_no_insert ON storage.objects;
DROP POLICY IF EXISTS support_no_update ON storage.objects;
DROP POLICY IF EXISTS support_no_delete ON storage.objects;
CREATE POLICY support_no_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.support_org_id() IS NULL);
CREATE POLICY support_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.support_org_id() IS NULL);
CREATE POLICY support_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.support_org_id() IS NULL);

CREATE OR REPLACE FUNCTION public.platform_support_enter(_org_id UUID)
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
  SET support_org_id = _org_id, support_until = v_until
  WHERE user_id = auth.uid();

  INSERT INTO public.audit_log (org_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (_org_id, auth.uid(), 'support.enter', 'organization', _org_id::text,
          jsonb_build_object('until', v_until));

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
  SET support_org_id = NULL, support_until = NULL
  WHERE user_id = auth.uid();

  INSERT INTO public.audit_log (org_id, actor_user_id, action, entity, entity_id)
  VALUES (v_org, auth.uid(), 'support.exit', 'organization', v_org::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_support_session()
RETURNS TABLE (org_id UUID, org_name TEXT, until TIMESTAMP WITH TIME ZONE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, pa.support_until
  FROM public.platform_admins pa
  JOIN public.organizations o ON o.id = pa.support_org_id
  WHERE pa.user_id = auth.uid() AND pa.support_until > now()
$$;

REVOKE ALL ON FUNCTION public.platform_support_enter(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_support_exit() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_support_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_support_enter(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_support_exit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_support_session() TO authenticated;