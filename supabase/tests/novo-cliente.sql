-- ============================================================================
-- SUBIR UM CLIENTE NOVO
--
-- Cole no SQL do backend, ajuste os quatro valores abaixo e execute.
-- Devolve o link de convite do primeiro administrador da empresa.
--
-- A organização nova nasce neutra: metodologia BANT com 4 critérios, cor
-- padrão da plataforma, tipos de reunião genéricos e nenhum catálogo herdado
-- de outro cliente. O administrador dela ajusta marca e metodologia depois,
-- em Configurações.
-- ============================================================================

DO $$
DECLARE
  -- ── Ajuste aqui ───────────────────────────────────────────────────────────
  v_nome         TEXT := 'Empresa Exemplo';       -- nome da empresa cliente
  v_slug         TEXT := 'empresa-exemplo';       -- subdomínio (a-z, 0-9 e hífen)
  v_produto      TEXT := 'Sales Coach';           -- nome do produto para essa empresa
  v_email_admin  TEXT := 'admin@empresa.com';     -- quem recebe o convite de admin
  v_plano        TEXT := NULL;                    -- chave do plano, ou NULL por enquanto
  -- ──────────────────────────────────────────────────────────────────────────

  v_org_id UUID;
  v_token  UUID;
  v_expira TIMESTAMPTZ;
BEGIN
  v_org_id := public.provision_organization(v_nome, v_slug, v_plano, v_produto);

  INSERT INTO public.organization_invites (org_id, email, role)
  VALUES (v_org_id, lower(v_email_admin), 'admin')
  RETURNING token, expires_at INTO v_token, v_expira;

  RAISE NOTICE '';
  RAISE NOTICE '  Empresa criada: % (%)', v_nome, v_org_id;
  RAISE NOTICE '  Convite para:   %', v_email_admin;
  RAISE NOTICE '  Expira em:      %', v_expira;
  RAISE NOTICE '';
END
$$;

-- O link para enviar ao administrador da empresa nova.
-- Troque o domínio pelo endereço onde o sistema está publicado.
SELECT
  o.name                                        AS empresa,
  o.slug                                        AS subdominio,
  i.email                                       AS convidado,
  'https://SEU-DOMINIO/convite/' || i.token     AS link_do_convite,
  i.expires_at                                  AS expira_em
FROM public.organization_invites i
JOIN public.organizations o ON o.id = i.org_id
WHERE i.accepted_at IS NULL
  AND i.revoked_at IS NULL
  AND i.expires_at > now()
ORDER BY i.created_at DESC
LIMIT 1;
