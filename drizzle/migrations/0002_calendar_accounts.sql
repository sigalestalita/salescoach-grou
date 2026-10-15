CREATE TABLE IF NOT EXISTS public.calendar_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  email         TEXT,
  status        TEXT NOT NULL DEFAULT 'conectado' CHECK (status IN ('conectado', 'erro')),
  last_error    TEXT,
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calendar_accounts_org ON public.calendar_accounts (org_id);

CREATE TABLE IF NOT EXISTS public.calendar_tokens (
  account_id         UUID PRIMARY KEY REFERENCES public.calendar_accounts(id) ON DELETE CASCADE,
  access_token_enc   TEXT,
  refresh_token_enc  TEXT NOT NULL,
  expires_at         TIMESTAMPTZ,
  refreshed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS meeting_url       TEXT,
  ADD COLUMN IF NOT EXISTS calendar_event_id TEXT,
  ADD COLUMN IF NOT EXISTS attendees         JSONB;

GRANT SELECT ON public.calendar_accounts TO authenticated;
GRANT ALL ON public.calendar_accounts TO service_role;
GRANT ALL ON public.calendar_tokens TO service_role;

ALTER TABLE public.calendar_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_tokens   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.calendar_tokens FROM anon, authenticated;

DROP POLICY IF EXISTS "calendar_accounts_select" ON public.calendar_accounts;
CREATE POLICY "calendar_accounts_select" ON public.calendar_accounts FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  );

DROP TRIGGER IF EXISTS update_calendar_accounts_updated_at ON public.calendar_accounts;
CREATE TRIGGER update_calendar_accounts_updated_at
  BEFORE UPDATE ON public.calendar_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();