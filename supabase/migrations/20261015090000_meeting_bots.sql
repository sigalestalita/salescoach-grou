-- ============================================================================
-- Bot que entra na reunião (Recall.ai) e agenda conectada.
--
-- O vendedor envia o bot por link, ou conecta a agenda (Google ou Outlook) e o
-- bot entra sozinho nas reuniões com pessoas de fora. Quando a chamada acaba, a
-- gravação vai para o bucket meeting-files e entra na análise de sempre.
--
-- Só as edge functions escrevem nestas tabelas (service role). O app lê com a
-- RLS da organização.
-- ============================================================================

-- Reunião agendada para o bot e reunião sendo gravada por ele.
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_status_check;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_status_check CHECK (status = ANY (ARRAY[
  'enviado', 'baixando', 'transcrevendo', 'analisando', 'completo', 'erro', 'ao_vivo', 'agendado', 'gravando'
]));

-- Minutos gravados pelo bot entram no consumo do plano.
ALTER TABLE public.api_usage_logs DROP CONSTRAINT IF EXISTS api_usage_logs_operation_type_check;
ALTER TABLE public.api_usage_logs ADD CONSTRAINT api_usage_logs_operation_type_check
  CHECK (operation_type IN (
    'transcricao', 'analise', 'embedding', 'rag',
    'generate_arguments', 'live_transcricao', 'live_coach',
    'extracao_documento', 'storage', 'bot_gravacao'
  ));

CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL,
  provider           TEXT NOT NULL CHECK (provider IN ('google_calendar', 'microsoft_outlook')),
  recall_calendar_id TEXT NOT NULL UNIQUE,
  email              TEXT,
  status             TEXT NOT NULL DEFAULT 'conectado' CHECK (status IN ('conectado', 'desconectado')),
  -- externas: só reuniões com alguém de fora do domínio do vendedor
  -- todas: toda reunião com link de vídeo
  -- nenhuma: agenda conectada, mas o bot só vai quando enviado à mão
  mode               TEXT NOT NULL DEFAULT 'externas' CHECK (mode IN ('externas', 'todas', 'nenhuma')),
  last_error         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Uma agenda conectada por vendedor.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_connections_user_active
  ON public.calendar_connections (user_id) WHERE status = 'conectado';

CREATE TABLE IF NOT EXISTS public.meeting_bots (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meeting_id         UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL,
  recall_bot_id      TEXT NOT NULL UNIQUE,
  calendar_event_id  TEXT,
  meeting_url        TEXT NOT NULL,
  join_at            TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN (
                       'agendado', 'entrando', 'sala_de_espera', 'gravando', 'processando', 'concluido', 'erro', 'cancelado')),
  status_detail      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_bots_meeting_idx ON public.meeting_bots (meeting_id);
CREATE INDEX IF NOT EXISTS meeting_bots_event_idx ON public.meeting_bots (org_id, calendar_event_id);

GRANT SELECT ON public.calendar_connections TO authenticated;
GRANT ALL ON public.calendar_connections TO service_role;
GRANT SELECT ON public.meeting_bots TO authenticated;
GRANT ALL ON public.meeting_bots TO service_role;

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_bots ENABLE ROW LEVEL SECURITY;

-- Cada pessoa vê a própria agenda conectada.
DROP POLICY IF EXISTS "calendar_connections_select" ON public.calendar_connections;
CREATE POLICY "calendar_connections_select" ON public.calendar_connections FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND user_id = auth.uid());

-- O bot de uma reunião aparece para quem vê a reunião (a RLS de meetings vale aqui).
DROP POLICY IF EXISTS "meeting_bots_select" ON public.meeting_bots;
CREATE POLICY "meeting_bots_select" ON public.meeting_bots FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_bots.meeting_id)
  );
