-- ============================================================================
-- Agenda do vendedor (Google Agenda e Outlook), só leitura.
--
-- Com a agenda conectada, a extensão acha o evento da reunião em que o
-- vendedor está e traz o título, os participantes (nome e e-mail) e o lead
-- (o participante de fora da empresa). Sem custo por hora: leitura direta
-- das APIs do Google e da Microsoft.
--
-- O que o app enxerga:
--   • calendar_accounts — qual agenda o vendedor conectou e o estado dela
-- O que só as edge functions enxergam:
--   • calendar_tokens   — tokens criptografados (sem nenhuma policy)
--
-- Na reunião: o link, o evento da agenda e os participantes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.calendar_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Uma agenda por vendedor.
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
  -- [{ "name": "...", "email": "...", "externo": true }]
  ADD COLUMN IF NOT EXISTS attendees         JSONB;

-- ── Acesso ─────────────────────────────────────────────────────────────────
ALTER TABLE public.calendar_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_tokens   ENABLE ROW LEVEL SECURITY;

-- Tokens: só a service role (edge functions). Nenhuma policy, e sem grant.
REVOKE ALL ON public.calendar_tokens FROM anon, authenticated;

-- O vendedor vê a própria conexão; o admin vê as da empresa (para saber quem
-- conectou). Quem escreve é a função calendar, com a service role.
DROP POLICY IF EXISTS "calendar_accounts_select" ON public.calendar_accounts;
CREATE POLICY "calendar_accounts_select" ON public.calendar_accounts FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  );

CREATE TRIGGER update_calendar_accounts_updated_at
  BEFORE UPDATE ON public.calendar_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
