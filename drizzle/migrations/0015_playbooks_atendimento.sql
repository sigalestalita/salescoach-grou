ALTER TABLE public.analysis_templates
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'vendas';

ALTER TABLE public.analysis_templates DROP CONSTRAINT IF EXISTS analysis_templates_mode_check;
ALTER TABLE public.analysis_templates ADD CONSTRAINT analysis_templates_mode_check
  CHECK (mode IN ('vendas', 'playbook'));

ALTER TABLE public.analysis_templates
  ADD COLUMN IF NOT EXISTS playbook JSONB;

ALTER TABLE public.analysis_results
  ADD COLUMN IF NOT EXISTS playbook_result JSONB;

ALTER TABLE public.highlights DROP CONSTRAINT IF EXISTS highlights_highlight_type_check;