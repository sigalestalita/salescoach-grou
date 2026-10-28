CREATE TABLE IF NOT EXISTS public.meeting_bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  calendar_event_id TEXT,
  meeting_url TEXT NOT NULL,
  title TEXT,
  start_at TIMESTAMPTZ,
  meeting_type TEXT,
  lead_name TEXT,
  lead_company TEXT,
  lead_email TEXT,
  attendees JSONB,
  provider TEXT NOT NULL DEFAULT 'recall',
  provider_bot_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'agendado',
  status_detail TEXT,
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.meeting_bots TO authenticated;
GRANT ALL ON public.meeting_bots TO service_role;
CREATE INDEX IF NOT EXISTS meeting_bots_user_start ON public.meeting_bots (user_id, start_at);
CREATE INDEX IF NOT EXISTS meeting_bots_event ON public.meeting_bots (user_id, calendar_event_id);
ALTER TABLE public.meeting_bots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Vendedor vê os próprios robôs" ON public.meeting_bots;
CREATE POLICY "Vendedor vê os próprios robôs" ON public.meeting_bots FOR SELECT TO authenticated USING (user_id = auth.uid());