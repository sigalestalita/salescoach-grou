-- ============================================================================
-- Núcleo da plataforma multi-tenant.
--
-- Introduz o conceito de "organização" (empresa cliente). Nenhuma organização
-- é privilegiada pelo código: toda configuração específica de negócio vive em
-- dados, por organização. Os padrões definidos aqui são neutros e servem a
-- qualquer cliente novo.
-- ============================================================================

-- ── Organizações ────────────────────────────────────────────────────────────

CREATE TABLE public.organizations (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  custom_domain TEXT UNIQUE,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('trial', 'active', 'past_due', 'suspended', 'canceled')),
  locale        TEXT NOT NULL DEFAULT 'pt-BR',
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  CONSTRAINT organizations_domain_format CHECK (custom_domain IS NULL OR custom_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$')
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.organizations IS
  'Empresa cliente. O slug é o subdomínio; custom_domain é opcional (CNAME).';

-- Slugs reservados: não podem ser usados como subdomínio de cliente.
CREATE TABLE public.reserved_slugs (
  slug TEXT PRIMARY KEY
);
ALTER TABLE public.reserved_slugs ENABLE ROW LEVEL SECURITY;

INSERT INTO public.reserved_slugs (slug) VALUES
  ('www'), ('app'), ('admin'), ('api'), ('auth'), ('login'), ('account'),
  ('billing'), ('status'), ('docs'), ('support'), ('help'), ('mail'),
  ('static'), ('assets'), ('cdn'), ('dev'), ('staging'), ('test'), ('demo'),
  ('platform'), ('console'), ('dashboard'), ('extension');

-- ── Identidade visual (whitelabel) ──────────────────────────────────────────
-- Tabela separada de `organizations` porque é o único dado do tenant que
-- precisa ser legível ANTES do login (a tela de login já carrega a marca).
-- Contém apenas informação pública: nome do produto, logo, cores.

CREATE TABLE public.organization_branding (
  org_id             UUID NOT NULL PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_name       TEXT NOT NULL DEFAULT 'Sales Coach',
  logo_url           TEXT,
  logo_dark_url      TEXT,
  favicon_url        TEXT,
  -- Cores em componentes HSL ("H S% L%"), no mesmo formato dos design tokens
  -- já usados pela interface. O padrão é um azul neutro de plataforma.
  primary_hsl        TEXT NOT NULL DEFAULT '217 91% 60%',
  primary_fg_hsl     TEXT NOT NULL DEFAULT '0 0% 100%',
  accent_hsl         TEXT NOT NULL DEFAULT '199 89% 48%',
  sidebar_hsl        TEXT NOT NULL DEFAULT '222 47% 6%',
  login_headline     TEXT,
  login_subheadline  TEXT,
  support_email      TEXT,
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT branding_primary_hsl_format CHECK (primary_hsl ~ '^\d{1,3} \d{1,3}% \d{1,3}%$'),
  CONSTRAINT branding_primary_fg_hsl_format CHECK (primary_fg_hsl ~ '^\d{1,3} \d{1,3}% \d{1,3}%$'),
  CONSTRAINT branding_accent_hsl_format CHECK (accent_hsl ~ '^\d{1,3} \d{1,3}% \d{1,3}%$'),
  CONSTRAINT branding_sidebar_hsl_format CHECK (sidebar_hsl ~ '^\d{1,3} \d{1,3}% \d{1,3}%$')
);
ALTER TABLE public.organization_branding ENABLE ROW LEVEL SECURITY;

-- ── Preferências operacionais da organização ────────────────────────────────

CREATE TABLE public.org_settings (
  org_id                 UUID NOT NULL PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Público-alvo oferecido no gerador de argumentos: [{key, label}]
  argument_audiences     JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Campos de contexto do gerador de argumentos: [{key, label, placeholder}]
  argument_context_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Compartilhamento externo de reunião por link
  sharing_enabled        BOOLEAN NOT NULL DEFAULT true,
  share_default_ttl_days INTEGER NOT NULL DEFAULT 14 CHECK (share_default_ttl_days BETWEEN 1 AND 365),
  -- Retenção de dados (LGPD). NULL = manter indefinidamente.
  retention_days         INTEGER CHECK (retention_days IS NULL OR retention_days >= 7),
  -- Chave própria de IA (BYOK). Quando presente, o backend usa o provedor do cliente.
  ai_provider            TEXT CHECK (ai_provider IS NULL OR ai_provider IN ('platform', 'openai', 'anthropic', 'google')),
  created_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

-- ── Administradores da plataforma (provedor do SaaS) ────────────────────────
-- Gerencia organizações, planos e consumo. NÃO dá acesso a conteúdo de
-- reunião, transcrição ou base de conhecimento de nenhum cliente — acesso a
-- conteúdo continua exigindo ser membro da organização.

CREATE TABLE public.platform_admins (
  user_id    UUID NOT NULL PRIMARY KEY,
  note       TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.platform_admins IS
  'Operadores do SaaS. Acesso restrito a metadados de organização, plano e consumo — nunca a conteúdo de reuniões dos clientes.';

-- ── Convites ────────────────────────────────────────────────────────────────

CREATE TABLE public.organization_invites (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        app_role NOT NULL DEFAULT 'vendedor',
  team_id     UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  token       UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  invited_by  UUID,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMP WITH TIME ZONE,
  revoked_at  TIMESTAMP WITH TIME ZONE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_invites_pending_email
  ON public.organization_invites (org_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX idx_invites_org ON public.organization_invites (org_id, created_at DESC);
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- ── Trilha de auditoria ─────────────────────────────────────────────────────

CREATE TABLE public.audit_log (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  actor_user_id UUID,
  action        TEXT NOT NULL,
  entity        TEXT,
  entity_id     TEXT,
  metadata      JSONB,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_org ON public.audit_log (org_id, created_at DESC);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ── Funções auxiliares ──────────────────────────────────────────────────────
-- (current_org_id() e org_is_active() são criadas na migração de escopo, que é
--  onde profiles.org_id passa a existir.)

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id)
$$;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organization_branding_updated_at
  BEFORE UPDATE ON public.organization_branding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_org_settings_updated_at
  BEFORE UPDATE ON public.org_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Bucket público de identidade visual ─────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('org-assets', 'org-assets', true)
ON CONFLICT (id) DO NOTHING;
