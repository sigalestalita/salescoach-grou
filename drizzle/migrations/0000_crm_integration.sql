CREATE TABLE IF NOT EXISTS public.crm_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('rdstation', 'hubspot', 'pipedrive', 'kommo')),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'erro', 'desconectado')),
  account_label TEXT,
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  settings JSONB NOT NULL DEFAULT '{"criar_anotacao": true, "criar_tarefa": true, "envio_automatico": true}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider)
);

CREATE TABLE IF NOT EXISTS public.crm_credentials (
  connection_id UUID PRIMARY KEY REFERENCES public.crm_connections(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  expires_at TIMESTAMPTZ,
  api_domain TEXT,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source_key TEXT NOT NULL,
  target_entity TEXT NOT NULL DEFAULT 'deal',
  target_field TEXT NOT NULL,
  target_label TEXT,
  target_type TEXT,
  target_options JSONB,
  mode TEXT NOT NULL DEFAULT 'se_vazio' CHECK (mode IN ('sempre', 'se_vazio')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider, source_key)
);

CREATE TABLE IF NOT EXISTS public.crm_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviando', 'enviado', 'erro', 'aguardando_vinculo')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deal_id TEXT,
  last_error TEXT,
  sent JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_sync_jobs_meeting_idx ON public.crm_sync_jobs (meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_sync_jobs_fila_idx ON public.crm_sync_jobs (status, next_attempt_at) WHERE status IN ('pendente', 'erro');

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS crm_provider TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS crm_deal_id TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS crm_deal_name TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS crm_linked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS crm_linked_at TIMESTAMPTZ;

GRANT SELECT ON public.crm_connections TO authenticated;
GRANT ALL ON public.crm_connections TO service_role;
GRANT ALL ON public.crm_credentials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_field_mappings TO authenticated;
GRANT ALL ON public.crm_field_mappings TO service_role;
GRANT SELECT ON public.crm_sync_jobs TO authenticated;
GRANT ALL ON public.crm_sync_jobs TO service_role;

ALTER TABLE public.crm_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sync_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.crm_credentials FROM anon, authenticated;

DROP POLICY IF EXISTS "crm_connections_select" ON public.crm_connections;
CREATE POLICY "crm_connections_select" ON public.crm_connections FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "crm_mappings_select" ON public.crm_field_mappings;
DROP POLICY IF EXISTS "crm_mappings_admin_insert" ON public.crm_field_mappings;
DROP POLICY IF EXISTS "crm_mappings_admin_update" ON public.crm_field_mappings;
DROP POLICY IF EXISTS "crm_mappings_admin_delete" ON public.crm_field_mappings;
CREATE POLICY "crm_mappings_select" ON public.crm_field_mappings FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "crm_mappings_admin_insert" ON public.crm_field_mappings FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "crm_mappings_admin_update" ON public.crm_field_mappings FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "crm_mappings_admin_delete" ON public.crm_field_mappings FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "crm_jobs_select" ON public.crm_sync_jobs;
CREATE POLICY "crm_jobs_select" ON public.crm_sync_jobs FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = crm_sync_jobs.meeting_id));