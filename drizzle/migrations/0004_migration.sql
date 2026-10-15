ALTER TABLE public.meeting_types
  ADD COLUMN IF NOT EXISTS analysis_template_id UUID REFERENCES public.analysis_templates(id) ON DELETE SET NULL;

ALTER TABLE public.analysis_results
  ADD COLUMN IF NOT EXISTS methodology JSONB;

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

ALTER TABLE public.api_usage_logs DROP CONSTRAINT IF EXISTS api_usage_logs_operation_type_check;
ALTER TABLE public.api_usage_logs ADD CONSTRAINT api_usage_logs_operation_type_check
  CHECK (operation_type IN (
    'transcricao', 'analise', 'embedding', 'rag',
    'generate_arguments', 'live_transcricao', 'live_coach',
    'extracao_documento', 'storage', 'roleplay', 'assistant_chat',
    'sugestao_metodologia'
  ));