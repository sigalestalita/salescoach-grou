ALTER TABLE public.crm_connections DROP CONSTRAINT IF EXISTS crm_connections_provider_check;
ALTER TABLE public.crm_connections ADD CONSTRAINT crm_connections_provider_check
  CHECK (provider IN ('rdstation', 'hubspot', 'pipedrive', 'kommo', 'nexa'));