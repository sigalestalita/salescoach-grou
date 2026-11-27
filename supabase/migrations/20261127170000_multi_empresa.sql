-- Uma pessoa em mais de uma empresa (ex.: a mesma consultora atende duas operações).
--
-- Até aqui, profiles.org_id era a única empresa do usuário e o aceite de
-- convite recusava quem já tinha empresa. O vínculo passa a ser user_roles
-- (que já tinha org_id e papel por empresa); profiles.org_id vira a empresa
-- ATIVA. Todo o resto (RLS por current_org_id(), has_role, edge functions)
-- continua igual: enxerga a empresa ativa. Trocar de empresa = mudar a ativa.
--
-- A equipe é por empresa: profiles.team_id é a equipe na empresa ativa, e
-- user_roles.team_id guarda a equipe nas outras, para voltar ao trocar.

-- ── Equipe guardada por empresa ─────────────────────────────────────────────
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

-- ── Quem é membro da empresa atual ──────────────────────────────────────────
-- SECURITY DEFINER para a policy de profiles não depender da RLS de user_roles.
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

-- O perfil (nome, foto) de quem é da empresa continua visível para ela mesmo
-- quando a pessoa está com outra empresa ativa: senão o nome some da equipe
-- e das reuniões dela.
DROP POLICY IF EXISTS "profiles_select_membros" ON public.profiles;
CREATE POLICY "profiles_select_membros" ON public.profiles FOR SELECT TO authenticated
  USING (public.membro_da_empresa_atual(user_id));

-- ── Empresas do usuário logado ──────────────────────────────────────────────
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

-- ── Trocar a empresa ativa ──────────────────────────────────────────────────
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

  -- Guarda a equipe da empresa que a pessoa está deixando.
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

-- ── Aceite de convite: quem já é de outra empresa também entra ──────────────
-- Antes: "Usuário já pertence a uma organização". Agora a pessoa ganha o vínculo
-- com a nova empresa, que passa a ser a ativa; a anterior continua na lista.
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

  -- Já é de outra empresa: guarda a equipe de lá antes de trocar a ativa.
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
