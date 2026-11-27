ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.membro_da_empresa_atual(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND org_id = public.current_org_id()
  )
$$;

DROP POLICY IF EXISTS "profiles_select_membros" ON public.profiles;
CREATE POLICY "profiles_select_membros" ON public.profiles FOR SELECT TO authenticated
  USING (public.membro_da_empresa_atual(user_id));

CREATE OR REPLACE FUNCTION public.minhas_empresas()
RETURNS TABLE (org_id UUID, nome TEXT, slug TEXT, papel TEXT, ativa BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id,
         o.name,
         o.slug,
         min(ur.role::text),
         o.id IS NOT DISTINCT FROM (SELECT p.org_id FROM public.profiles p WHERE p.user_id = auth.uid())
  FROM public.user_roles ur
  JOIN public.organizations o ON o.id = ur.org_id
  WHERE ur.user_id = auth.uid()
  GROUP BY o.id, o.name, o.slug
  ORDER BY o.name
$$;

REVOKE ALL ON FUNCTION public.minhas_empresas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.minhas_empresas() TO authenticated;

CREATE OR REPLACE FUNCTION public.trocar_empresa(_org_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_atual UUID;
  v_time UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Faça login para trocar de empresa';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND org_id = _org_id) THEN
    RAISE EXCEPTION 'Você não faz parte desta empresa';
  END IF;

  SELECT org_id, team_id INTO v_atual, v_time
  FROM public.profiles WHERE user_id = v_uid
  FOR UPDATE;

  IF v_atual IS NOT DISTINCT FROM _org_id THEN
    RETURN _org_id;
  END IF;

  IF v_atual IS NOT NULL THEN
    UPDATE public.user_roles SET team_id = v_time
    WHERE user_id = v_uid AND org_id = v_atual;
  END IF;

  INSERT INTO public.profiles (user_id, org_id, team_id)
  VALUES (
    v_uid, _org_id,
    (SELECT ur.team_id FROM public.user_roles ur
       JOIN public.teams t ON t.id = ur.team_id AND t.org_id = _org_id
      WHERE ur.user_id = v_uid AND ur.org_id = _org_id
      LIMIT 1)
  )
  ON CONFLICT (user_id) DO UPDATE
    SET org_id = EXCLUDED.org_id,
        team_id = EXCLUDED.team_id;

  INSERT INTO public.audit_log (org_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (_org_id, v_uid, 'user.org_switched', 'user', v_uid::text,
          jsonb_build_object('from', v_atual));

  RETURN _org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.trocar_empresa(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trocar_empresa(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_invite(_token UUID, _user_id UUID, _email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.organization_invites%ROWTYPE;
  v_atual UUID;
  v_time UUID;
BEGIN
  SELECT * INTO v_invite
  FROM public.organization_invites
  WHERE token = _token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite inválido';
  END IF;

  IF v_invite.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Convite já utilizado';
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Convite revogado';
  END IF;

  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'Convite expirado';
  END IF;

  IF lower(v_invite.email) <> lower(_email) THEN
    RAISE EXCEPTION 'Convite emitido para outro e-mail';
  END IF;

  SELECT org_id, team_id INTO v_atual, v_time FROM public.profiles WHERE user_id = _user_id FOR UPDATE;

  IF v_atual IS NOT NULL AND v_atual <> v_invite.org_id THEN
    UPDATE public.user_roles SET team_id = v_time
    WHERE user_id = _user_id AND org_id = v_atual;
  END IF;

  INSERT INTO public.profiles (user_id, org_id, team_id)
  VALUES (_user_id, v_invite.org_id, v_invite.team_id)
  ON CONFLICT (user_id) DO UPDATE
    SET org_id = EXCLUDED.org_id,
        team_id = CASE WHEN profiles.org_id IS NOT DISTINCT FROM EXCLUDED.org_id
                       THEN COALESCE(EXCLUDED.team_id, profiles.team_id)
                       ELSE EXCLUDED.team_id END;

  INSERT INTO public.user_roles (user_id, org_id, role, team_id)
  VALUES (_user_id, v_invite.org_id, v_invite.role, v_invite.team_id)
  ON CONFLICT DO NOTHING;

  UPDATE public.organization_invites
     SET accepted_at = now()
   WHERE id = v_invite.id;

  INSERT INTO public.audit_log (org_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (v_invite.org_id, _user_id, 'invite.accepted', 'user', _user_id::text,
          jsonb_build_object('role', v_invite.role, 'outra_empresa', v_atual IS NOT NULL AND v_atual <> v_invite.org_id));

  RETURN v_invite.org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invite(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invite(UUID, UUID, TEXT) TO service_role;