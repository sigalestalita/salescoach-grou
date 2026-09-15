-- ============================================================================
-- APLICAR AS MIGRAÇÕES MULTI-TENANT
--
-- Cole este arquivo inteiro no SQL do backend (Lovable → View Backend → SQL)
-- e execute uma vez.
--
-- Tudo roda dentro de UMA transação: se qualquer comando falhar, nada é
-- aplicado e o banco continua exatamente como está. Não há estado parcial.
--
-- Antes de rodar, confira a linha `v_org_name` no bloco 5: é o nome que vai
-- aparecer na interface para o time que já usa o sistema.
--
-- Gerado a partir de:
--   20260914090001_platform_core.sql
--   20260914090002_business_config.sql
--   20260914090003_billing_usage.sql
--   20260914090004_org_scoping.sql
--   20260914090005_backfill_existing_installation.sql
--   20260914090006_rls_org_isolation.sql
--   20260914090007_provisioning_and_invites.sql
-- ============================================================================

BEGIN;



-- ==========================================================================
-- 20260914090001_platform_core.sql
-- ==========================================================================

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


-- ==========================================================================
-- 20260914090002_business_config.sql
-- ==========================================================================

-- ============================================================================
-- Configuração de negócio por organização.
--
-- Tudo que hoje está escrito dentro do prompt e dos componentes (metodologia
-- de qualificação, faixas de temperatura, tipos de reunião, catálogo de dores,
-- tipos de oferta) passa a ser dado do cliente. O backend deixa de conhecer
-- qualquer metodologia ou portfólio específico.
-- ============================================================================

-- ── Tipos de reunião ────────────────────────────────────────────────────────
-- Substitui o CHECK fixo em meetings.meeting_type.

CREATE TABLE public.meeting_types (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key            TEXT NOT NULL,
  label          TEXT NOT NULL,
  -- Contexto extra injetado no prompt quando a reunião é deste tipo.
  prompt_context TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (org_id, key),
  CONSTRAINT meeting_types_key_format CHECK (key ~ '^[a-z0-9_]{1,40}$')
);
CREATE INDEX idx_meeting_types_org ON public.meeting_types (org_id, sort_order);
ALTER TABLE public.meeting_types ENABLE ROW LEVEL SECURITY;

-- ── Templates de análise ────────────────────────────────────────────────────

CREATE TABLE public.analysis_templates (
  id                     UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                 UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  is_default             BOOLEAN NOT NULL DEFAULT false,

  -- Quem a IA é ao analisar. Neutro por padrão.
  persona                TEXT NOT NULL DEFAULT 'Você é um especialista em vendas B2B.',

  -- Metodologia de qualificação usada para a temperatura da agenda.
  methodology_key        TEXT NOT NULL DEFAULT 'BANT',
  methodology_label      TEXT NOT NULL DEFAULT 'BANT',

  -- Critérios da metodologia: [{key, label, description, max_score}]
  -- `key` vira a chave dentro de analysis_results.bant_score.
  qualification_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Faixas de temperatura, da mais fria para a mais quente:
  -- [{key, label, criteria}]
  temperature_levels     JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Blocos opcionais de análise: {"meddic": true, "spin": true, "talk_ratio": true}
  frameworks             JSONB NOT NULL DEFAULT '{"meddic": true, "spin": true, "talk_ratio": true}'::jsonb,

  -- Regras próprias do cliente, injetadas no fim do prompt.
  extra_instructions     TEXT,
  output_language        TEXT NOT NULL DEFAULT 'pt-BR',

  created_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
CREATE UNIQUE INDEX idx_analysis_templates_default
  ON public.analysis_templates (org_id) WHERE is_default;
ALTER TABLE public.analysis_templates ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.analysis_templates.qualification_criteria IS
  'Critérios da metodologia do cliente. Ex.: BANT com 4 critérios, BAN com 3, ou critérios próprios.';

-- ── Catálogo de dores (gerador de argumentos) ───────────────────────────────

CREATE TABLE public.pain_categories (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  icon       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (org_id, label)
);
CREATE INDEX idx_pain_categories_org ON public.pain_categories (org_id, sort_order);
ALTER TABLE public.pain_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pain_items (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.pain_categories(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (category_id, label)
);
CREATE INDEX idx_pain_items_category ON public.pain_items (category_id, sort_order);
CREATE INDEX idx_pain_items_org ON public.pain_items (org_id);
ALTER TABLE public.pain_items ENABLE ROW LEVEL SECURITY;

-- ── Tipos de oferta (gerador de argumentos) ─────────────────────────────────

CREATE TABLE public.offer_types (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  label        TEXT NOT NULL,
  -- Instrução de foco injetada no prompt do gerador de argumentos.
  instructions TEXT,
  -- Se verdadeiro, o executivo pode escolher itens da base de conhecimento
  -- para focar dentro desta oferta.
  allows_item_selection BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (org_id, key),
  CONSTRAINT offer_types_key_format CHECK (key ~ '^[a-z0-9_]{1,40}$')
);
CREATE INDEX idx_offer_types_org ON public.offer_types (org_id, sort_order);
ALTER TABLE public.offer_types ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_meeting_types_updated_at
  BEFORE UPDATE ON public.meeting_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_analysis_templates_updated_at
  BEFORE UPDATE ON public.analysis_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_offer_types_updated_at
  BEFORE UPDATE ON public.offer_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ==========================================================================
-- 20260914090003_billing_usage.sql
-- ==========================================================================

-- ============================================================================
-- Planos, assinatura e medição de consumo.
--
-- O custo do produto é variável (minutos transcritos, tokens de LLM, storage).
-- Sem medição não há margem conhecida nem cota aplicável, então o ledger de
-- consumo vem antes de qualquer integração de pagamento.
-- ============================================================================

-- ── Catálogo de planos (do provedor, não do cliente) ────────────────────────

CREATE TABLE public.plans (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'BRL',
  interval    TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('month', 'year')),
  -- Limites por período. Chave ausente ou nula = ilimitado.
  -- Ex.: {"transcription_minutes": 600, "analyses": 100, "seats": 10, "storage_gb": 25}
  limits      JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Recursos ligados/desligados. Ex.: {"live_coach": true, "custom_domain": false}
  features    JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  is_public   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Plano interno, sem preço e sem limites: para a própria operação do provedor
-- e para organizações que não devem ser cobradas nem limitadas.
INSERT INTO public.plans (key, name, description, price_cents, limits, features, is_public, sort_order)
VALUES (
  'internal_unlimited',
  'Interno',
  'Uso interno, sem cobrança e sem limites de consumo.',
  0,
  '{}'::jsonb,
  '{"live_coach": true, "chrome_extension": true, "custom_domain": true, "api_access": true}'::jsonb,
  false,
  0
);

-- ── Assinatura por organização ──────────────────────────────────────────────

CREATE TABLE public.subscriptions (
  id                       UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id                   UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id                  UUID NOT NULL REFERENCES public.plans(id),
  status                   TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'paused')),
  seats                    INTEGER,
  current_period_start     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT date_trunc('month', now()),
  current_period_end       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (date_trunc('month', now()) + INTERVAL '1 month'),
  trial_ends_at            TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end     BOOLEAN NOT NULL DEFAULT false,
  -- Identificadores do provedor de pagamento (preenchidos quando o checkout
  -- for ligado; o schema não depende de nenhum provedor específico).
  external_customer_id     TEXT,
  external_subscription_id TEXT,
  created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- ── Ledger de consumo ───────────────────────────────────────────────────────
-- Estende a tabela existente em vez de substituí-la, preservando o histórico.

ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS quantity NUMERIC(14,4) NOT NULL DEFAULT 0;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE public.api_usage_logs ADD COLUMN IF NOT EXISTS provider TEXT;

-- O CHECK original só aceitava quatro operações, e o gerador de argumentos
-- grava "generate_arguments" — ou seja, todo registro dele vinha sendo
-- rejeitado silenciosamente. A lista passa a cobrir o que o sistema realmente
-- emite.
ALTER TABLE public.api_usage_logs DROP CONSTRAINT IF EXISTS api_usage_logs_operation_type_check;
ALTER TABLE public.api_usage_logs ADD CONSTRAINT api_usage_logs_operation_type_check
  CHECK (operation_type IN (
    'transcricao', 'analise', 'embedding', 'rag',
    'generate_arguments', 'live_transcricao', 'live_coach',
    'extracao_documento', 'storage'
  ));

CREATE INDEX IF NOT EXISTS idx_api_usage_org_period ON public.api_usage_logs (org_id, created_at DESC);

COMMENT ON COLUMN public.api_usage_logs.quantity IS
  'Quantidade na unidade da operação: minutos para transcrição, tokens para LLM, bytes para storage.';

-- ── Contadores agregados por período ────────────────────────────────────────
-- Mantidos por trigger para que a verificação de cota seja uma leitura única.

CREATE TABLE public.usage_counters (
  org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  metric       TEXT NOT NULL,
  total        NUMERIC(16,4) NOT NULL DEFAULT 0,
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, period_start, metric)
);
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.accrue_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period DATE;
BEGIN
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_period := date_trunc('month', NEW.created_at)::date;

  INSERT INTO public.usage_counters (org_id, period_start, metric, total, updated_at)
  VALUES (NEW.org_id, v_period, NEW.operation_type, COALESCE(NEW.quantity, 0), now())
  ON CONFLICT (org_id, period_start, metric)
  DO UPDATE SET total = usage_counters.total + COALESCE(NEW.quantity, 0), updated_at = now();

  INSERT INTO public.usage_counters (org_id, period_start, metric, total, updated_at)
  VALUES (NEW.org_id, v_period, 'tokens', COALESCE(NEW.input_tokens, 0) + COALESCE(NEW.output_tokens, 0), now())
  ON CONFLICT (org_id, period_start, metric)
  DO UPDATE SET total = usage_counters.total + COALESCE(NEW.input_tokens, 0) + COALESCE(NEW.output_tokens, 0), updated_at = now();

  INSERT INTO public.usage_counters (org_id, period_start, metric, total, updated_at)
  VALUES (NEW.org_id, v_period, 'cost_usd', COALESCE(NEW.estimated_cost, 0), now())
  ON CONFLICT (org_id, period_start, metric)
  DO UPDATE SET total = usage_counters.total + COALESCE(NEW.estimated_cost, 0), updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER accrue_usage_on_insert
  AFTER INSERT ON public.api_usage_logs
  FOR EACH ROW EXECUTE FUNCTION public.accrue_usage();

-- ── Cotas ───────────────────────────────────────────────────────────────────

-- Consumo do período corrente para uma métrica.
CREATE OR REPLACE FUNCTION public.org_usage(_org_id UUID, _metric TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT total FROM public.usage_counters
      WHERE org_id = _org_id
        AND period_start = date_trunc('month', now())::date
        AND metric = _metric),
    0
  )
$$;

-- Verdadeiro se a organização ainda cabe no limite do plano para a métrica.
-- Limite ausente no plano = ilimitado. Organização sem assinatura = sem limite
-- (a cobrança é opcional; um cliente pode ser faturado fora do sistema).
CREATE OR REPLACE FUNCTION public.check_org_quota(_org_id UUID, _metric TEXT, _requested NUMERIC DEFAULT 1)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit NUMERIC;
  v_used  NUMERIC;
  v_status TEXT;
BEGIN
  SELECT s.status, (p.limits ->> _metric)::NUMERIC
    INTO v_status, v_limit
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.org_id = _org_id;

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF v_status IN ('canceled', 'paused') THEN
    RETURN false;
  END IF;

  IF v_limit IS NULL THEN
    RETURN true;
  END IF;

  v_used := public.org_usage(_org_id, _metric);
  RETURN (v_used + COALESCE(_requested, 0)) <= v_limit;
END;
$$;

-- Resumo de consumo x limites, para a tela de configurações e para o painel
-- do provedor.
CREATE OR REPLACE FUNCTION public.org_quota_status(_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limits JSONB;
  v_result JSONB := '{}'::jsonb;
  v_key    TEXT;
BEGIN
  SELECT p.limits INTO v_limits
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.org_id = _org_id;

  IF v_limits IS NULL THEN
    v_limits := '{}'::jsonb;
  END IF;

  FOR v_key IN
    SELECT DISTINCT m FROM (
      SELECT jsonb_object_keys(v_limits) AS m
      UNION
      SELECT metric FROM public.usage_counters
        WHERE org_id = _org_id AND period_start = date_trunc('month', now())::date
    ) keys
  LOOP
    v_result := v_result || jsonb_build_object(
      v_key,
      jsonb_build_object(
        'used', public.org_usage(_org_id, v_key),
        'limit', v_limits -> v_key
      )
    );
  END LOOP;

  RETURN v_result;
END;
$$;

CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ==========================================================================
-- 20260914090004_org_scoping.sql
-- ==========================================================================

-- ============================================================================
-- Escopo de organização nas tabelas existentes.
--
-- Nesta migração as colunas entram como NULL para permitir o backfill; a
-- obrigatoriedade e as policies vêm na migração de enforcement.
-- ============================================================================

-- ── Coluna de organização ───────────────────────────────────────────────────

ALTER TABLE public.teams                  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.profiles               ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles             ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.meetings               ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.transcriptions         ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.analysis_results       ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.highlights             ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_documents    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_items        ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.transcription_segments ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.live_tips              ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Índices compostos: toda consulta passa a filtrar por organização primeiro.
CREATE INDEX IF NOT EXISTS idx_teams_org                  ON public.teams (org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org               ON public.profiles (org_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org             ON public.user_roles (org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_org_created       ON public.meetings (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_org_seller        ON public.meetings (org_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_transcriptions_org         ON public.transcriptions (org_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_org       ON public.analysis_results (org_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_highlights_org             ON public.highlights (org_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_org    ON public.knowledge_documents (org_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_org        ON public.knowledge_items (org_id);
CREATE INDEX IF NOT EXISTS idx_transcription_segments_org ON public.transcription_segments (org_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_live_tips_org              ON public.live_tips (org_id, meeting_id);

-- ── Funções de contexto ─────────────────────────────────────────────────────

-- Organização do usuário autenticado. SECURITY DEFINER para ser usada dentro
-- das policies sem recursão de RLS.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- Organização ativa? Suspensa ou cancelada perde escrita, mas mantém leitura
-- para que o cliente consiga exportar os próprios dados.
CREATE OR REPLACE FUNCTION public.org_is_active(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = _org_id AND status IN ('trial', 'active', 'past_due')
  )
$$;

-- Papel do usuário dentro da própria organização. Mantém a assinatura original
-- (usada por dezenas de policies) e passa a exigir que o papel pertença à
-- organização do usuário.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND ur.org_id IS NOT DISTINCT FROM p.org_id
  )
$$;

-- ── Herança de organização nas tabelas filhas ───────────────────────────────
-- Preenche org_id a partir da reunião quando quem insere não informa. Vale
-- tanto para o app (usuário autenticado) quanto para as edge functions
-- (service role, sem auth.uid()).

CREATE OR REPLACE FUNCTION public.set_org_from_meeting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT m.org_id INTO NEW.org_id FROM public.meetings m WHERE m.id = NEW.meeting_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_org_transcriptions
  BEFORE INSERT ON public.transcriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_meeting();

CREATE TRIGGER set_org_analysis_results
  BEFORE INSERT ON public.analysis_results
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_meeting();

CREATE TRIGGER set_org_highlights
  BEFORE INSERT ON public.highlights
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_meeting();

CREATE TRIGGER set_org_transcription_segments
  BEFORE INSERT ON public.transcription_segments
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_meeting();

CREATE TRIGGER set_org_live_tips
  BEFORE INSERT ON public.live_tips
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_meeting();

-- ── Herança de organização na própria reunião ───────────────────────────────
-- Quando quem insere é uma edge function com service role, não há auth.uid() e
-- o DEFAULT não resolve. Deriva a organização do vendedor dono da reunião.
-- Também protege a janela entre aplicar o banco e publicar o código novo: o
-- código antigo continua conseguindo criar reuniões.

CREATE OR REPLACE FUNCTION public.set_org_from_seller()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL AND NEW.seller_id IS NOT NULL THEN
    SELECT p.org_id INTO NEW.org_id FROM public.profiles p WHERE p.user_id = NEW.seller_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_org_meetings
  BEFORE INSERT ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_seller();

-- ── Controle de compartilhamento externo ────────────────────────────────────
-- Hoje toda reunião nasce com share_token e qualquer link vaza a transcrição
-- inteira, sem expiração nem revogação. O token continua existindo, mas passa
-- a exigir ativação explícita.

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS share_enabled    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS share_revoked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS shared_by        UUID;

-- ── Vocabulário de negócio deixa de ser fixo no schema ──────────────────────

-- As faixas de temperatura passam a ser definidas pelo template de análise da
-- organização, então o CHECK fixo sai (a validação passa a ser do template).
ALTER TABLE public.meetings          DROP CONSTRAINT IF EXISTS meetings_temperature_check;
ALTER TABLE public.analysis_results  DROP CONSTRAINT IF EXISTS analysis_results_temperature_check;

-- O tipo de reunião passa a vir de meeting_types, por organização.
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_meeting_type_check;
ALTER TABLE public.meetings ALTER COLUMN meeting_type DROP DEFAULT;

-- A interface já envia "planilha" ao subir XLS/CSV, mas o CHECK rejeitava o
-- valor e o upload falhava.
ALTER TABLE public.knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_doc_type_check;
ALTER TABLE public.knowledge_documents ADD CONSTRAINT knowledge_documents_doc_type_check
  CHECK (doc_type IN ('pdf', 'doc', 'link', 'text', 'texto', 'planilha'));


-- ==========================================================================
-- 20260914090005_backfill_existing_installation.sql
-- ==========================================================================

-- ============================================================================
-- Backfill da instalação existente.
--
-- Move os dados que já estão no banco para dentro de uma organização e grava,
-- COMO DADO DESSA ORGANIZAÇÃO, a configuração que hoje está escrita no código:
-- metodologia de qualificação, faixas de temperatura, tipos de reunião,
-- catálogo de dores, tipos de oferta e identidade visual.
--
-- Efeito para quem já usa o sistema: nada muda. Mesmas cores, mesmo logo,
-- mesmos tipos de reunião, mesma metodologia de análise, mesmos limites
-- (nenhum). A diferença é que essa configuração deixa de ser o padrão do
-- produto e passa a ser a preferência de um cliente entre outros.
--
-- Em uma instalação sem dados anteriores esta migração não faz nada.
-- ============================================================================

DO $$
DECLARE
  -- Identificação da organização já existente nesta instalação.
  v_org_name  TEXT := 'Grou';
  v_org_slug  TEXT := 'grou';

  v_org_id    UUID;
  v_plan_id   UUID;
  v_cat_id    UUID;
  v_has_data  BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.profiles) INTO v_has_data;

  IF NOT v_has_data THEN
    RAISE NOTICE 'Nenhum dado anterior encontrado; backfill ignorado.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE org_id IS NOT NULL) THEN
    RAISE NOTICE 'Backfill já aplicado; nada a fazer.';
    RETURN;
  END IF;

  INSERT INTO public.organizations (name, slug, status)
  VALUES (v_org_name, v_org_slug, 'active')
  RETURNING id INTO v_org_id;

  -- ── Dados existentes passam a pertencer a essa organização ────────────────

  UPDATE public.teams                  SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.profiles               SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.user_roles             SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.meetings               SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.transcriptions         SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.analysis_results       SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.highlights             SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.knowledge_documents    SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.knowledge_items        SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.transcription_segments SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.live_tips              SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.api_usage_logs         SET org_id = v_org_id WHERE org_id IS NULL;

  -- Links de compartilhamento que já estão em circulação continuam válidos.
  -- Reuniões criadas a partir de agora exigem ativação explícita.
  UPDATE public.meetings
     SET share_enabled = true
   WHERE share_token IS NOT NULL AND share_enabled = false;

  -- ── Identidade visual atual ───────────────────────────────────────────────

  INSERT INTO public.organization_branding (
    org_id, product_name, primary_hsl, primary_fg_hsl, accent_hsl, sidebar_hsl,
    login_headline, login_subheadline
  ) VALUES (
    v_org_id,
    'Sales Coach',
    '24 95% 53%',
    '0 0% 100%',
    '24 100% 55%',
    '222 47% 6%',
    'Sales Coach',
    'Análise inteligente de reuniões comerciais com IA avançada'
  );

  -- ── Preferências operacionais ─────────────────────────────────────────────

  INSERT INTO public.org_settings (org_id, argument_audiences, argument_context_fields)
  VALUES (
    v_org_id,
    '[{"key":"rh","label":"profissionais de RH"},
      {"key":"c-level","label":"decisores C-Level"},
      {"key":"gestores","label":"gestores operacionais"}]'::jsonb,
    '[{"key":"segment","label":"Segmento"},
      {"key":"companySize","label":"Tamanho da empresa","suffix":"colaboradores"},
      {"key":"hrMaturity","label":"Maturidade de RH"},
      {"key":"saleType","label":"Tipo de venda"},
      {"key":"estimatedTicket","label":"Ticket estimado"}]'::jsonb
  );

  -- ── Plano interno: sem cobrança e sem limites ─────────────────────────────

  SELECT id INTO v_plan_id FROM public.plans WHERE key = 'internal_unlimited';

  INSERT INTO public.subscriptions (org_id, plan_id, status)
  VALUES (v_org_id, v_plan_id, 'active');

  -- ── Tipos de reunião ──────────────────────────────────────────────────────

  INSERT INTO public.meeting_types (org_id, key, label, prompt_context, sort_order) VALUES
    (v_org_id, 'empresa', 'Empresa', NULL, 1),
    (v_org_id, 'consultoria', 'Consultoria',
     'CONTEXTO DE PREÇOS PARA CONSULTORIA:
- Esta é uma reunião de CONSULTORIA. Use as tabelas "Créditos PDA - Consultoria" (para clientes existentes/recargas) e "Programa de Partners" (para novos clientes) ao avaliar propostas de valor e oportunidades.
- NÃO use a tabela de Licenças PDA para empresas neste contexto.
- Créditos PDA - Consultoria = recargas para consultores já clientes.
- Programa de Partners = entrada de novos consultores com pacotes de licenças (Bronze a Safira).
- Avalie se o vendedor apresentou a faixa correta do programa com base no perfil do prospect.',
     2);

  -- ── Template de análise em uso hoje ───────────────────────────────────────

  INSERT INTO public.analysis_templates (
    org_id, name, is_default, persona,
    methodology_key, methodology_label,
    qualification_criteria, temperature_levels, frameworks, extra_instructions
  ) VALUES (
    v_org_id,
    'Metodologia padrão',
    true,
    'Você é um especialista em vendas B2B.',
    'BAN',
    'BAN',
    '[{"key":"budget","label":"Budget","description":"Orçamento disponível e confirmado","max_score":33},
      {"key":"authority","label":"Authority","description":"Acesso ao decisor econômico","max_score":33},
      {"key":"need","label":"Need","description":"Dor reconhecida, quantificada e priorizada","max_score":33}]'::jsonb,
    '[{"key":"congelado","label":"Congelado","criteria":"0-1 critério BAN. Sem perfil para o negócio (descartar)."},
      {"key":"frio","label":"Frio","criteria":"1 critério BAN atendido. Dor genérica, sem orçamento definido, sem acesso ao decisor; precisa de nutrição."},
      {"key":"morno","label":"Morno","criteria":"2 critérios BAN atendidos. Necessidade identificada, mas budget incerto OU sem acesso direto ao decisor; dor reconhecida sem priorização."},
      {"key":"quente","label":"Quente","criteria":"3 critérios BAN atendidos com alguma ressalva. Budget provável, acesso ao decisor, necessidade validada com dor reconhecida."},
      {"key":"muito_quente","label":"Muito quente","criteria":"Os 3 critérios BAN plenamente atendidos. Budget confirmado, decisor presente, dor urgente e quantificada, próximo passo de proposta acordado."}]'::jsonb,
    '{"meddic": true, "spin": true, "talk_ratio": true}'::jsonb,
    'O ciclo de venda é consultivo e complexo. NÃO use prazo/timeline/urgência temporal ("quando vai fechar", "em X dias/meses") como critério de qualificação. Avalie APENAS profundidade da dor, clareza da necessidade, orçamento e acesso ao decisor.
- A temperatura DEVE seguir rigorosamente os critérios BAN (apenas 3 critérios: Budget, Authority, Need). NUNCA considere Timeline/prazo — a metodologia é BAN, NÃO BANT. O total máximo é SEMPRE 3 critérios, nunca 4.
- Na justificativa da temperatura ("temperature_reason"), escreva SEMPRE no formato "X de 3 critérios BAN atendidos" (jamais "de 4", jamais "BANT") e cite quais foram atendidos entre Budget, Authority e Need. É PROIBIDO mencionar a letra T, a palavra "Timeline", a sigla "BANT" ou qualquer janela de tempo (dias, meses, prazos, urgência temporal).
- Em "decision_process" do MEDDIC, foque apenas no fluxo de aprovação e steps, SEM estimar prazos.'
  );

  -- ── Tipos de oferta do gerador de argumentos ──────────────────────────────

  INSERT INTO public.offer_types (org_id, key, label, instructions, allows_item_selection, sort_order) VALUES
    (v_org_id, 'pda', 'Licença PDA',
     'FOCO EXCLUSIVO: Licença PDA (Personal Development Analysis).
Todos os argumentos devem girar em torno do produto PDA: assessment comportamental, licença PDA, ROI de mapeamento de perfis, assertividade em contratação e desenvolvimento.
NÃO mencione serviços de consultoria ou treinamento — foque apenas no produto/licença.',
     false, 1),
    (v_org_id, 'servicos', 'Serviços e Treinamentos',
     'FOCO EXCLUSIVO: Serviços e Treinamentos.
Todos os argumentos devem girar em torno dos serviços oferecidos (consultorias, treinamentos, diagnósticos comportamentais, workshops).
NÃO foque no produto PDA como licença — foque nos serviços que geram valor com a metodologia.',
     true, 2),
    (v_org_id, 'ambos', 'Licença PDA + Serviços',
     'FOCO: Licença PDA + Serviços combinados.
Gere argumentos que cubram tanto o produto PDA (assessment, licença PDA) quanto os serviços complementares (consultorias, treinamentos, diagnósticos).',
     true, 3);

  -- ── Catálogo de dores do gerador de argumentos ────────────────────────────

  INSERT INTO public.pain_categories (org_id, label, icon, sort_order)
  VALUES (v_org_id, 'Pessoas & Turnover', 'Users', 1) RETURNING id INTO v_cat_id;
  INSERT INTO public.pain_items (org_id, category_id, label, sort_order) VALUES
    (v_org_id, v_cat_id, 'Alto turnover', 1),
    (v_org_id, v_cat_id, 'Baixa retenção de talentos', 2),
    (v_org_id, v_cat_id, 'Contratações erradas (fit comportamental inadequado)', 3),
    (v_org_id, v_cat_id, 'Falta de plano de desenvolvimento individual (PDI)', 4),
    (v_org_id, v_cat_id, 'Baixo engajamento do time', 5);

  INSERT INTO public.pain_categories (org_id, label, icon, sort_order)
  VALUES (v_org_id, 'Recrutamento & Seleção', 'Clock', 2) RETURNING id INTO v_cat_id;
  INSERT INTO public.pain_items (org_id, category_id, label, sort_order) VALUES
    (v_org_id, v_cat_id, 'Tempo elevado de contratação (time-to-hire alto)', 1),
    (v_org_id, v_cat_id, 'Alto custo por contratação', 2),
    (v_org_id, v_cat_id, 'Baixa assertividade nos processos seletivos', 3),
    (v_org_id, v_cat_id, 'Excesso de retrabalho em seleção', 4),
    (v_org_id, v_cat_id, 'Falta de critérios objetivos para contratação', 5);

  INSERT INTO public.pain_categories (org_id, label, icon, sort_order)
  VALUES (v_org_id, 'Performance & Produtividade', 'BarChart3', 3) RETURNING id INTO v_cat_id;
  INSERT INTO public.pain_items (org_id, category_id, label, sort_order) VALUES
    (v_org_id, v_cat_id, 'Baixa produtividade dos times', 1),
    (v_org_id, v_cat_id, 'Falta de clareza de perfil ideal por função', 2),
    (v_org_id, v_cat_id, 'Equipes desalinhadas com as demandas do negócio', 3),
    (v_org_id, v_cat_id, 'Dificuldade em montar times de alta performance', 4),
    (v_org_id, v_cat_id, 'Baixa previsibilidade de performance', 5);

  INSERT INTO public.pain_categories (org_id, label, icon, sort_order)
  VALUES (v_org_id, 'Custos & Eficiência Operacional', 'DollarSign', 4) RETURNING id INTO v_cat_id;
  INSERT INTO public.pain_items (org_id, category_id, label, sort_order) VALUES
    (v_org_id, v_cat_id, 'Alto custo operacional em RH', 1),
    (v_org_id, v_cat_id, 'Processos manuais e pouco escaláveis', 2),
    (v_org_id, v_cat_id, 'Falta de dados para tomada de decisão', 3),
    (v_org_id, v_cat_id, 'Baixa eficiência em gestão de pessoas', 4),
    (v_org_id, v_cat_id, 'Desperdício de investimento em contratações erradas', 5);

  INSERT INTO public.pain_categories (org_id, label, icon, sort_order)
  VALUES (v_org_id, 'Liderança & Gestão', 'Brain', 5) RETURNING id INTO v_cat_id;
  INSERT INTO public.pain_items (org_id, category_id, label, sort_order) VALUES
    (v_org_id, v_cat_id, 'Líderes despreparados para gerir pessoas', 1),
    (v_org_id, v_cat_id, 'Falta de inteligência comportamental na gestão', 2),
    (v_org_id, v_cat_id, 'Dificuldade em dar feedbacks eficazes', 3),
    (v_org_id, v_cat_id, 'Conflitos internos recorrentes', 4),
    (v_org_id, v_cat_id, 'Falta de visão estratégica sobre o time', 5);

  INSERT INTO public.pain_categories (org_id, label, icon, sort_order)
  VALUES (v_org_id, 'Crescimento & Escala', 'TrendingUp', 6) RETURNING id INTO v_cat_id;
  INSERT INTO public.pain_items (org_id, category_id, label, sort_order) VALUES
    (v_org_id, v_cat_id, 'Crescimento desorganizado do time', 1),
    (v_org_id, v_cat_id, 'Dificuldade em escalar cultura', 2),
    (v_org_id, v_cat_id, 'Falta de padronização nos processos de pessoas', 3),
    (v_org_id, v_cat_id, 'Risco ao crescer sem estrutura de RH madura', 4);

  RAISE NOTICE 'Backfill concluído para a organização % (%).', v_org_name, v_org_id;
END
$$;


-- ==========================================================================
-- 20260914090006_rls_org_isolation.sql
-- ==========================================================================

-- ============================================================================
-- Isolamento por organização.
--
-- Toda policy passa a começar por org_id = current_org_id(). As regras de
-- papel (vendedor vê o próprio, gestor vê o time, admin vê tudo) continuam
-- exatamente como eram — só deixam de valer entre empresas diferentes.
-- ============================================================================

-- ── Obrigatoriedade e preenchimento automático ──────────────────────────────
-- profiles.org_id continua opcional: um usuário recém-cadastrado só ganha
-- organização ao aceitar um convite.

ALTER TABLE public.teams                  ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.meetings               ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.knowledge_documents    ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.knowledge_items        ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.api_usage_logs         ALTER COLUMN org_id SET DEFAULT public.current_org_id();

ALTER TABLE public.teams                  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.user_roles             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.meetings               ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.transcriptions         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.analysis_results       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.highlights             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.knowledge_documents    ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.knowledge_items        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.transcription_segments ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.live_tips              ALTER COLUMN org_id SET NOT NULL;

-- Um papel passa a ser por organização.
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_org_role_key
  ON public.user_roles (user_id, org_id, role);

-- ── Permissões de tabela ────────────────────────────────────────────────────

GRANT SELECT ON public.organizations, public.organization_branding, public.org_settings,
  public.meeting_types, public.analysis_templates, public.pain_categories, public.pain_items,
  public.offer_types, public.plans, public.subscriptions, public.usage_counters,
  public.organization_invites, public.audit_log, public.reserved_slugs, public.platform_admins
  TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.organization_branding, public.org_settings,
  public.meeting_types, public.analysis_templates, public.pain_categories, public.pain_items,
  public.offer_types, public.organization_invites
  TO authenticated;

GRANT UPDATE ON public.organizations TO authenticated;

GRANT ALL ON public.organizations, public.organization_branding, public.org_settings,
  public.meeting_types, public.analysis_templates, public.pain_categories, public.pain_items,
  public.offer_types, public.plans, public.subscriptions, public.usage_counters,
  public.organization_invites, public.audit_log, public.reserved_slugs, public.platform_admins
  TO service_role;

-- ============================================================================
-- Tabelas existentes
-- ============================================================================

-- ── teams ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "teams_select"       ON public.teams;
DROP POLICY IF EXISTS "teams_admin_insert" ON public.teams;
DROP POLICY IF EXISTS "teams_admin_update" ON public.teams;
DROP POLICY IF EXISTS "teams_admin_delete" ON public.teams;

CREATE POLICY "teams_select" ON public.teams FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "teams_admin_insert" ON public.teams FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "teams_admin_update" ON public.teams FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "teams_admin_delete" ON public.teams FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

-- ── profiles ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_select"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_delete" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR org_id = public.current_org_id());

-- O usuário não pode mudar a própria organização.
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND org_id IS NOT DISTINCT FROM public.current_org_id());

CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND org_id IS NOT DISTINCT FROM public.current_org_id());

CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "profiles_admin_delete" ON public.profiles FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

-- ── user_roles ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "roles_select_own"   ON public.user_roles;
DROP POLICY IF EXISTS "roles_admin_insert" ON public.user_roles;
DROP POLICY IF EXISTS "roles_admin_update" ON public.user_roles;
DROP POLICY IF EXISTS "roles_admin_delete" ON public.user_roles;

CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY "roles_admin_insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_update" ON public.user_roles FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "roles_admin_delete" ON public.user_roles FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

-- ── meetings ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;

CREATE POLICY "meetings_select" ON public.meetings FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (
      seller_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'gestor')
    )
  );
CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND public.org_is_active(org_id)
    AND (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  );
CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));

-- ── transcriptions ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "transcriptions_select" ON public.transcriptions;
DROP POLICY IF EXISTS "transcriptions_insert" ON public.transcriptions;
DROP POLICY IF EXISTS "transcriptions_delete" ON public.transcriptions;

CREATE POLICY "transcriptions_select" ON public.transcriptions FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = transcriptions.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
    )
  );
CREATE POLICY "transcriptions_insert" ON public.transcriptions FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = transcriptions.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );
CREATE POLICY "transcriptions_delete" ON public.transcriptions FOR DELETE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = transcriptions.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ── analysis_results ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "analysis_select" ON public.analysis_results;
DROP POLICY IF EXISTS "analysis_insert" ON public.analysis_results;
DROP POLICY IF EXISTS "analysis_delete" ON public.analysis_results;

CREATE POLICY "analysis_select" ON public.analysis_results FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = analysis_results.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
    )
  );
CREATE POLICY "analysis_insert" ON public.analysis_results FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = analysis_results.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );
CREATE POLICY "analysis_delete" ON public.analysis_results FOR DELETE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = analysis_results.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ── highlights ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "highlights_select" ON public.highlights;
DROP POLICY IF EXISTS "highlights_insert" ON public.highlights;
DROP POLICY IF EXISTS "highlights_delete" ON public.highlights;

CREATE POLICY "highlights_select" ON public.highlights FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = highlights.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
    )
  );
CREATE POLICY "highlights_insert" ON public.highlights FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = highlights.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );
CREATE POLICY "highlights_delete" ON public.highlights FOR DELETE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = highlights.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ── transcription_segments ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "segments_select" ON public.transcription_segments;
DROP POLICY IF EXISTS "segments_insert" ON public.transcription_segments;
DROP POLICY IF EXISTS "segments_delete" ON public.transcription_segments;

CREATE POLICY "segments_select" ON public.transcription_segments FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = transcription_segments.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
    )
  );
CREATE POLICY "segments_insert" ON public.transcription_segments FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = transcription_segments.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );
CREATE POLICY "segments_delete" ON public.transcription_segments FOR DELETE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = transcription_segments.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ── live_tips ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tips_select" ON public.live_tips;
DROP POLICY IF EXISTS "tips_insert" ON public.live_tips;
DROP POLICY IF EXISTS "tips_delete" ON public.live_tips;

CREATE POLICY "tips_select" ON public.live_tips FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = live_tips.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
    )
  );
CREATE POLICY "tips_insert" ON public.live_tips FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = live_tips.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );
CREATE POLICY "tips_delete" ON public.live_tips FOR DELETE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = live_tips.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ── knowledge_documents / knowledge_items ───────────────────────────────────

DROP POLICY IF EXISTS "knowledge_docs_select"       ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_docs_admin_insert" ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_docs_admin_update" ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_docs_admin_delete" ON public.knowledge_documents;

CREATE POLICY "knowledge_docs_select" ON public.knowledge_documents FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "knowledge_docs_admin_insert" ON public.knowledge_documents FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "knowledge_docs_admin_update" ON public.knowledge_documents FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "knowledge_docs_admin_delete" ON public.knowledge_documents FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "knowledge_items_select"       ON public.knowledge_items;
DROP POLICY IF EXISTS "knowledge_items_admin_insert" ON public.knowledge_items;
DROP POLICY IF EXISTS "knowledge_items_admin_update" ON public.knowledge_items;
DROP POLICY IF EXISTS "knowledge_items_admin_delete" ON public.knowledge_items;

CREATE POLICY "knowledge_items_select" ON public.knowledge_items FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "knowledge_items_admin_insert" ON public.knowledge_items FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "knowledge_items_admin_update" ON public.knowledge_items FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "knowledge_items_admin_delete" ON public.knowledge_items FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

-- ── api_usage_logs ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "api_logs_select" ON public.api_usage_logs;
DROP POLICY IF EXISTS "api_logs_insert" ON public.api_usage_logs;

CREATE POLICY "api_logs_select" ON public.api_usage_logs FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  );
CREATE POLICY "api_logs_insert" ON public.api_usage_logs FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND user_id = auth.uid());

-- ============================================================================
-- Tabelas novas
-- ============================================================================

CREATE POLICY "orgs_select" ON public.organizations FOR SELECT TO authenticated
  USING (id = public.current_org_id() OR public.is_platform_admin());
CREATE POLICY "orgs_admin_update" ON public.organizations FOR UPDATE TO authenticated
  USING (
    (id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
    OR public.is_platform_admin()
  )
  WITH CHECK (id = public.current_org_id() OR public.is_platform_admin());

-- A identidade visual não é legível em massa: a tela de login resolve a marca
-- de UMA organização pela função pública get-branding, sem expor a carteira de
-- clientes.
CREATE POLICY "branding_select_members" ON public.organization_branding FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() OR public.is_platform_admin());
CREATE POLICY "branding_admin_write" ON public.organization_branding FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "branding_admin_update" ON public.organization_branding FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "settings_select" ON public.org_settings FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "settings_admin_insert" ON public.org_settings FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "settings_admin_update" ON public.org_settings FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "platform_admins_select" ON public.platform_admins FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "reserved_slugs_select" ON public.reserved_slugs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "invites_admin_select" ON public.organization_invites FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "invites_admin_insert" ON public.organization_invites FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND public.has_role(auth.uid(), 'admin')
    AND public.org_is_active(org_id)
  );
CREATE POLICY "invites_admin_update" ON public.organization_invites FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "audit_select" ON public.audit_log FOR SELECT TO authenticated
  USING (
    (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
    OR public.is_platform_admin()
  );

CREATE POLICY "plans_select" ON public.plans FOR SELECT TO authenticated
  USING (is_active OR public.is_platform_admin());

CREATE POLICY "subscriptions_select" ON public.subscriptions FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() OR public.is_platform_admin());

CREATE POLICY "usage_counters_select" ON public.usage_counters FOR SELECT TO authenticated
  USING (
    (org_id = public.current_org_id()
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor')))
    OR public.is_platform_admin()
  );

-- ── Configuração de negócio ─────────────────────────────────────────────────

CREATE POLICY "meeting_types_select" ON public.meeting_types FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "meeting_types_admin_insert" ON public.meeting_types FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "meeting_types_admin_update" ON public.meeting_types FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "meeting_types_admin_delete" ON public.meeting_types FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "templates_select" ON public.analysis_templates FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "templates_admin_insert" ON public.analysis_templates FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "templates_admin_update" ON public.analysis_templates FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "templates_admin_delete" ON public.analysis_templates FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "pain_categories_select" ON public.pain_categories FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "pain_categories_admin_write" ON public.pain_categories FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pain_categories_admin_update" ON public.pain_categories FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "pain_categories_admin_delete" ON public.pain_categories FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "pain_items_select" ON public.pain_items FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "pain_items_admin_write" ON public.pain_items FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pain_items_admin_update" ON public.pain_items FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "pain_items_admin_delete" ON public.pain_items FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "offer_types_select" ON public.offer_types FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "offer_types_admin_write" ON public.offer_types FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "offer_types_admin_update" ON public.offer_types FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "offer_types_admin_delete" ON public.offer_types FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- Storage
-- ============================================================================

-- Gravações: a leitura passa a exigir ser o dono do arquivo ou ter acesso à
-- reunião correspondente dentro da mesma organização. Antes, qualquer usuário
-- autenticado baixava qualquer arquivo do bucket.
DROP POLICY IF EXISTS "meeting_files_select" ON storage.objects;
CREATE POLICY "meeting_files_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'meeting-files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.meetings m
        WHERE m.file_url = storage.objects.name
          AND m.org_id = public.current_org_id()
          AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
      )
    )
  );

DROP POLICY IF EXISTS "knowledge_files_select" ON storage.objects;
CREATE POLICY "knowledge_files_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'knowledge-files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.knowledge_documents d
        WHERE d.file_url = storage.objects.name
          AND d.org_id = public.current_org_id()
      )
    )
  );

-- Identidade visual: bucket público para leitura (logo aparece na tela de
-- login), escrita restrita ao admin da organização dona da pasta.
DROP POLICY IF EXISTS "org_assets_insert" ON storage.objects;
DROP POLICY IF EXISTS "org_assets_update" ON storage.objects;
DROP POLICY IF EXISTS "org_assets_delete" ON storage.objects;

CREATE POLICY "org_assets_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "org_assets_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "org_assets_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND public.has_role(auth.uid(), 'admin')
  );


-- ==========================================================================
-- 20260914090007_provisioning_and_invites.sql
-- ==========================================================================

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


COMMIT;

-- Terminou sem erro? O banco está migrado. Rode agora o verificar-producao.sql.
