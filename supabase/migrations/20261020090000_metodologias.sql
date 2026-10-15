-- ============================================================================
-- Várias metodologias por empresa, uma por tipo de reunião.
--
-- analysis_templates já aceitava várias linhas por organização; só a marcada
-- como is_default era usada. Agora:
--   • cada tipo de reunião pode apontar para uma metodologia
--     (meeting_types.analysis_template_id); sem apontar, vale a padrão;
--   • cada análise guarda a metodologia com que foi feita
--     (analysis_results.methodology), para as telas mostrarem os critérios
--     certos mesmo depois de a empresa mudar de metodologia;
--   • no máximo uma metodologia padrão por empresa.
-- MEDDIC e SPIN como análises extras já eram controlados por
-- analysis_templates.frameworks; a tela passa a expor o liga/desliga.
-- ============================================================================

ALTER TABLE public.meeting_types
  ADD COLUMN IF NOT EXISTS analysis_template_id UUID REFERENCES public.analysis_templates(id) ON DELETE SET NULL;

-- { "key", "label", "criteria": [{key,label,max_score}], "frameworks": {...} }
ALTER TABLE public.analysis_results
  ADD COLUMN IF NOT EXISTS methodology JSONB;

-- Se alguma empresa tiver mais de uma padrão, fica a mais recente.
UPDATE public.analysis_templates t
SET is_default = false
WHERE is_default
  AND EXISTS (
    SELECT 1 FROM public.analysis_templates o
    WHERE o.org_id = t.org_id AND o.is_default AND o.id <> t.id
      AND (o.updated_at, o.id) > (t.updated_at, t.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_templates_one_default
  ON public.analysis_templates (org_id) WHERE is_default;

-- O tipo de reunião só pode apontar para metodologia da mesma empresa.
CREATE OR REPLACE FUNCTION public.meeting_type_template_same_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.analysis_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.analysis_templates
    WHERE id = NEW.analysis_template_id AND org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION 'Metodologia de outra empresa' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meeting_type_template_same_org ON public.meeting_types;
CREATE TRIGGER meeting_type_template_same_org
  BEFORE INSERT OR UPDATE OF analysis_template_id ON public.meeting_types
  FOR EACH ROW EXECUTE FUNCTION public.meeting_type_template_same_org();

-- Sugestão de metodologia pela IA (função suggest-methodology) entra no
-- registro de consumo.
ALTER TABLE public.api_usage_logs DROP CONSTRAINT IF EXISTS api_usage_logs_operation_type_check;
ALTER TABLE public.api_usage_logs ADD CONSTRAINT api_usage_logs_operation_type_check
  CHECK (operation_type IN (
    'transcricao', 'analise', 'embedding', 'rag',
    'generate_arguments', 'live_transcricao', 'live_coach',
    'extracao_documento', 'storage', 'roleplay', 'assistant_chat',
    'sugestao_metodologia'
  ));
