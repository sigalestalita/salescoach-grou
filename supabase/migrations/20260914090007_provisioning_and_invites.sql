-- ============================================================================
-- Provisionamento de organização e entrada de usuários.
--
-- Antes: qualquer cadastro no Supabase Auth ganhava automaticamente um perfil
-- e o papel de vendedor — em um SaaS aberto, isso é escalada de acesso. Agora
-- o cadastro cria apenas o perfil, sem organização e sem papel; o vínculo só
-- acontece por convite.
-- ============================================================================

-- ── Cadastro não concede mais acesso ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Cria apenas o perfil. Organização e papel vêm da aceitação de um convite.';

-- ── Provisionamento de uma nova organização ─────────────────────────────────
-- Cria a organização com padrões neutros de plataforma: metodologia BANT,
-- tipos de reunião genéricos e identidade visual padrão. Nenhum conteúdo de
-- cliente existente é usado como modelo.

CREATE OR REPLACE FUNCTION public.provision_organization(
  _name       TEXT,
  _slug       TEXT,
  _plan_key   TEXT DEFAULT NULL,
  _product_name TEXT DEFAULT 'Sales Coach'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id  UUID;
  v_plan_id UUID;
BEGIN
  IF NOT public.is_platform_admin() AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Apenas administradores da plataforma podem criar organizações';
  END IF;

  IF EXISTS (SELECT 1 FROM public.reserved_slugs WHERE slug = lower(_slug)) THEN
    RAISE EXCEPTION 'Subdomínio reservado: %', _slug;
  END IF;

  INSERT INTO public.organizations (name, slug, status)
  VALUES (_name, lower(_slug), 'trial')
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_branding (org_id, product_name)
  VALUES (v_org_id, COALESCE(_product_name, 'Sales Coach'));

  INSERT INTO public.org_settings (org_id, argument_audiences, argument_context_fields)
  VALUES (
    v_org_id,
    '[{"key":"decisor","label":"decisores C-Level"},
      {"key":"tecnico","label":"avaliadores técnicos"},
      {"key":"operacional","label":"gestores operacionais"}]'::jsonb,
    '[{"key":"segment","label":"Segmento"},
      {"key":"companySize","label":"Tamanho da empresa","suffix":"colaboradores"},
      {"key":"saleType","label":"Tipo de venda"},
      {"key":"estimatedTicket","label":"Ticket estimado"}]'::jsonb
  );

  IF _plan_key IS NOT NULL THEN
    SELECT id INTO v_plan_id FROM public.plans WHERE key = _plan_key;
    IF v_plan_id IS NOT NULL THEN
      INSERT INTO public.subscriptions (org_id, plan_id, status)
      VALUES (v_org_id, v_plan_id, 'trialing');
    END IF;
  END IF;

  -- Tipos de reunião neutros, válidos para qualquer operação comercial.
  INSERT INTO public.meeting_types (org_id, key, label, sort_order) VALUES
    (v_org_id, 'descoberta',   'Descoberta',            1),
    (v_org_id, 'apresentacao', 'Apresentação / Demo',   2),
    (v_org_id, 'negociacao',   'Negociação / Proposta', 3),
    (v_org_id, 'follow_up',    'Follow-up',             4);

  -- Metodologia padrão de plataforma: BANT completo, sem regras específicas.
  INSERT INTO public.analysis_templates (
    org_id, name, is_default, persona,
    methodology_key, methodology_label,
    qualification_criteria, temperature_levels, frameworks
  ) VALUES (
    v_org_id,
    'Metodologia padrão',
    true,
    'Você é um especialista em vendas B2B.',
    'BANT',
    'BANT',
    '[{"key":"budget","label":"Budget","description":"Orçamento disponível e confirmado","max_score":25},
      {"key":"authority","label":"Authority","description":"Acesso ao decisor econômico","max_score":25},
      {"key":"need","label":"Need","description":"Dor reconhecida e priorizada","max_score":25},
      {"key":"timeline","label":"Timeline","description":"Janela de decisão definida","max_score":25}]'::jsonb,
    '[{"key":"congelado","label":"Congelado","criteria":"Nenhum critério atendido. Sem perfil para o negócio."},
      {"key":"frio","label":"Frio","criteria":"1 critério atendido. Precisa de nutrição."},
      {"key":"morno","label":"Morno","criteria":"2 critérios atendidos. Necessidade identificada, qualificação incompleta."},
      {"key":"quente","label":"Quente","criteria":"3 critérios atendidos. Oportunidade real com alguma ressalva."},
      {"key":"muito_quente","label":"Muito quente","criteria":"Todos os critérios atendidos e próximo passo acordado."}]'::jsonb,
    '{"meddic": true, "spin": true, "talk_ratio": true}'::jsonb
  );

  INSERT INTO public.offer_types (org_id, key, label, sort_order)
  VALUES (v_org_id, 'padrao', 'Portfólio completo', 1);

  INSERT INTO public.audit_log (org_id, actor_user_id, action, entity, entity_id)
  VALUES (v_org_id, auth.uid(), 'organization.provisioned', 'organization', v_org_id::text);

  RETURN v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_organization(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_organization(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ── Aceite de convite ───────────────────────────────────────────────────────
-- Vincula um usuário autenticado a uma organização. Chamada pela edge function
-- accept-invite, que confere que o e-mail do convite é o do usuário.

CREATE OR REPLACE FUNCTION public.accept_invite(_token UUID, _user_id UUID, _email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.organization_invites%ROWTYPE;
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

  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND org_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Usuário já pertence a uma organização';
  END IF;

  INSERT INTO public.profiles (user_id, org_id, team_id)
  VALUES (_user_id, v_invite.org_id, v_invite.team_id)
  ON CONFLICT (user_id) DO UPDATE
    SET org_id = EXCLUDED.org_id,
        team_id = COALESCE(EXCLUDED.team_id, profiles.team_id);

  INSERT INTO public.user_roles (user_id, org_id, role)
  VALUES (_user_id, v_invite.org_id, v_invite.role)
  ON CONFLICT DO NOTHING;

  UPDATE public.organization_invites
     SET accepted_at = now()
   WHERE id = v_invite.id;

  INSERT INTO public.audit_log (org_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (v_invite.org_id, _user_id, 'invite.accepted', 'user', _user_id::text,
          jsonb_build_object('role', v_invite.role));

  RETURN v_invite.org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invite(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invite(UUID, UUID, TEXT) TO service_role;

-- ── Marca pública por slug ──────────────────────────────────────────────────
-- Retorna a identidade visual de UMA organização, sem permitir listagem.

CREATE OR REPLACE FUNCTION public.branding_for_host(_slug TEXT, _domain TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'org_id', o.id,
    'org_name', o.name,
    'slug', o.slug,
    'status', o.status,
    'product_name', b.product_name,
    'logo_url', b.logo_url,
    'logo_dark_url', b.logo_dark_url,
    'favicon_url', b.favicon_url,
    'primary_hsl', b.primary_hsl,
    'primary_fg_hsl', b.primary_fg_hsl,
    'accent_hsl', b.accent_hsl,
    'sidebar_hsl', b.sidebar_hsl,
    'login_headline', b.login_headline,
    'login_subheadline', b.login_subheadline,
    'support_email', b.support_email
  )
  FROM public.organizations o
  JOIN public.organization_branding b ON b.org_id = o.id
  WHERE (_slug IS NOT NULL AND o.slug = lower(_slug))
     OR (_domain IS NOT NULL AND o.custom_domain = lower(_domain))
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.branding_for_host(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.branding_for_host(TEXT, TEXT) TO service_role;
