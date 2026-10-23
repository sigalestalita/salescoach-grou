-- ============================================================================
-- Dica do dia da tela Início.
--
-- A função daily-tip escreve, com IA, uma dica por pessoa por dia a partir das
-- últimas análises dela, da metodologia e da base de conhecimento da empresa.
-- Fica guardada aqui para sair uma vez só por dia (abrir a tela de novo não
-- gasta outra chamada de IA). Só a função lê e escreve (service role).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.daily_tips (
  user_id     UUID NOT NULL,
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  tip         JSONB NOT NULL,
  model       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

GRANT ALL ON public.daily_tips TO service_role;

CREATE INDEX IF NOT EXISTS daily_tips_org_day ON public.daily_tips (org_id, day);

ALTER TABLE public.daily_tips ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: o navegador não lê nem escreve aqui, só a função.
REVOKE ALL ON public.daily_tips FROM anon, authenticated;

-- Consumo de IA da dica do dia.
ALTER TABLE public.api_usage_logs DROP CONSTRAINT IF EXISTS api_usage_logs_operation_type_check;
ALTER TABLE public.api_usage_logs ADD CONSTRAINT api_usage_logs_operation_type_check
  CHECK (operation_type IN (
    'transcricao', 'analise', 'embedding', 'rag',
    'generate_arguments', 'live_transcricao', 'live_coach',
    'extracao_documento', 'storage', 'roleplay', 'assistant_chat',
    'sugestao_metodologia', 'sugestao_perfis', 'dica_do_dia'
  ));