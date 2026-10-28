-- ============================================================================
-- Robô automático: o vendedor escolhe em quais reuniões da agenda o robô entra
-- sozinho (desligado, só reuniões com cliente ou todas as reuniões com link).
-- O agendador (pg_cron, supabase/manual/agendar-robo.sql) chama a função
-- meeting-bot de 10 em 10 minutos e agenda os robôs das próximas 24 horas.
--
-- Em cada reunião o vendedor escolhe como gravar: Robô, Extensão ou Não
-- gravar. A escolha que não é o robô fica em meeting_bots, com status
-- cancelado e a escolha, e o robô automático não volta para aquela reunião.
-- Só a função meeting-bot escreve.
--
-- Com o robô na chamada, a extensão liga só o coach ao vivo: a reunião que
-- ela cria guarda meeting_bot_id, e a gravação do robô entra nela.
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

-- Como o vendedor escolheu gravar esta reunião (quando não é o robô).
ALTER TABLE public.meeting_bots ADD COLUMN IF NOT EXISTS escolha TEXT
  CHECK (escolha IN ('robo', 'extensao', 'nao_gravar'));

-- Reunião aberta pela extensão só com o coach ao vivo: a gravação deste robô
-- entra nela (meeting-bot-webhook confere que é do mesmo vendedor).
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS meeting_bot_id UUID
  REFERENCES public.meeting_bots(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS meetings_meeting_bot ON public.meetings (meeting_bot_id) WHERE meeting_bot_id IS NOT NULL;
