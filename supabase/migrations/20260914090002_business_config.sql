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
