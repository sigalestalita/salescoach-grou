-- ============================================================================
-- Robô automático: o vendedor escolhe em quais reuniões da agenda o robô entra
-- sozinho (desligado, só reuniões com cliente ou todas as reuniões com link).
-- O agendador (pg_cron, supabase/manual/agendar-robo.sql) chama a função
-- meeting-bot de 10 em 10 minutos e agenda os robôs das próximas 24 horas.
--
-- As exceções ("não gravar esta reunião", robô cancelado pelo vendedor) ficam
-- em meeting_bots, com status cancelado. Só a função meeting-bot escreve.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meeting_bot_prefs (
  user_id    UUID PRIMARY KEY,
  org_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  modo       TEXT NOT NULL DEFAULT 'desligado' CHECK (modo IN ('desligado', 'clientes', 'todas')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_bot_prefs_ligados ON public.meeting_bot_prefs (modo) WHERE modo <> 'desligado';

ALTER TABLE public.meeting_bot_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendedor vê a própria preferência do robô" ON public.meeting_bot_prefs;
CREATE POLICY "Vendedor vê a própria preferência do robô" ON public.meeting_bot_prefs
  FOR SELECT USING (user_id = auth.uid());

-- Robô agendado pelo modo automático (o tirado pelo sistema some da tabela;
-- o do vendedor fica, como exceção).
ALTER TABLE public.meeting_bots ADD COLUMN IF NOT EXISTS automatico BOOLEAN NOT NULL DEFAULT false;
