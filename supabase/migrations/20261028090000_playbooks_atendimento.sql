-- ============================================================================
-- Coach de atendimento: análise por playbook, além da metodologia de vendas.
--
-- Times que não vendem (Customer Success, suporte, onboarding, renovação) não
-- são avaliados por BANT/SPICED: cada conversa segue um playbook da empresa.
-- O playbook mora na mesma tabela das metodologias (analysis_templates), com
-- mode = 'playbook', e reaproveita as colunas que já existem:
--   • qualification_criteria = etapas do playbook [{key, label, description,
--     max_score, required}], com o peso de cada etapa na aderência;
--   • temperature_levels     = faixas de saúde do cliente [{key, label, criteria}];
--   • playbook (novo)        = objetivo, boas práticas, o que evitar, sinais a
--     detectar (risco, oportunidade, atenção) e informações a registrar.
-- Cada tipo de reunião já aponta para um template (meeting_types.
-- analysis_template_id): um tipo "Onboarding" aponta para o playbook de
-- onboarding e a reunião é analisada por ele.
-- O resultado detalhado da análise por playbook (etapas cumpridas, sinais,
-- compromissos) fica em analysis_results.playbook_result.
-- ============================================================================

ALTER TABLE public.analysis_templates
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'vendas';

ALTER TABLE public.analysis_templates DROP CONSTRAINT IF EXISTS analysis_templates_mode_check;
ALTER TABLE public.analysis_templates ADD CONSTRAINT analysis_templates_mode_check
  CHECK (mode IN ('vendas', 'playbook'));

-- { objetivo, boas_praticas: [..], evitar: [..],
--   sinais: [{key, label, description, tipo: risco|oportunidade|atencao}],
--   campos: [{key, label, description}] }
ALTER TABLE public.analysis_templates
  ADD COLUMN IF NOT EXISTS playbook JSONB;

ALTER TABLE public.analysis_results
  ADD COLUMN IF NOT EXISTS playbook_result JSONB;

-- Os destaques do atendimento têm outros tipos (risco, oportunidade,
-- reclamação, elogio, pedido, compromisso). O tipo passa a ser definido pelo
-- prompt, como já acontece com a temperatura.
ALTER TABLE public.highlights DROP CONSTRAINT IF EXISTS highlights_highlight_type_check;
