-- ============================================================================
-- Robô de reunião (protótipo, Recall.ai).
--
-- O vendedor manda o robô para uma reunião da agenda. O robô entra na chamada
-- pelos servidores da Recall e grava; o computador do vendedor não grava nada.
-- Quando a gravação fica pronta, a função meeting-bot-webhook cria a reunião e
-- dispara a mesma análise das gravações da extensão.
--
-- Só as funções meeting-bot e meeting-bot-webhook escrevem (service role).
-- Cada vendedor lê os próprios robôs, para a tela Minha agenda.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meeting_bots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL,
  calendar_event_id TEXT,
  meeting_url       TEXT NOT NULL,
  title             TEXT,
  start_at          TIMESTAMPTZ,
  meeting_type      TEXT,
  lead_name         TEXT,
  lead_company      TEXT,
  lead_email        TEXT,
  attendees         JSONB,
  provider          TEXT NOT NULL DEFAULT 'recall',
  provider_bot_id   TEXT UNIQUE,
  -- agendado, entrando, sala_de_espera, na_chamada, gravando, processando, concluido, cancelado, erro
  status            TEXT NOT NULL DEFAULT 'agendado',
  status_detail     TEXT,
  meeting_id        UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_bots_user_start ON public.meeting_bots (user_id, start_at);
CREATE INDEX IF NOT EXISTS meeting_bots_event ON public.meeting_bots (user_id, calendar_event_id);

ALTER TABLE public.meeting_bots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendedor vê os próprios robôs" ON public.meeting_bots;
CREATE POLICY "Vendedor vê os próprios robôs" ON public.meeting_bots
  FOR SELECT USING (user_id = auth.uid());
