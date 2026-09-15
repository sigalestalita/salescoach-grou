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
