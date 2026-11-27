-- Compass (CRM da Grou, compass.grougp.com) como mais um CRM da integração.
-- Conexão por token colado; ver supabase/functions/_shared/crm/compass.ts.
ALTER TABLE public.crm_connections DROP CONSTRAINT IF EXISTS crm_connections_provider_check;
ALTER TABLE public.crm_connections ADD CONSTRAINT crm_connections_provider_check
  CHECK (provider IN ('rdstation', 'hubspot', 'pipedrive', 'kommo', 'nexa', 'lumi', 'compass'));
