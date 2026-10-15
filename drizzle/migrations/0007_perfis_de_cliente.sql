-- ============================================================================
-- Perfis de cliente para o modo de treino.
--
-- O lead simulado nascia do catálogo de dores e das objeções já vistas nas
-- reuniões da empresa. Uma empresa nova, sem reuniões, treinava contra um lead
-- genérico ("gerente comercial da Distribuidora Aliança"). Com os perfis, a
-- empresa descreve quem costuma comprar dela (segmento, cargo, porte, dores,
-- objeções, como chega e como decide) e o treino sorteia ou usa o perfil
-- escolhido. A IA também sugere perfis a partir da base de conhecimento
-- (função suggest-lead-profiles).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_profiles (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  segment         TEXT,
  role            TEXT,
  company_profile TEXT,
  pains           TEXT[] NOT NULL DEFAULT '{}',
  objections      TEXT[] NOT NULL DEFAULT '{}',
  context         TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_profiles_org ON public.lead_profiles (org_id, sort_order);

COMMENT ON TABLE public.lead_profiles IS
  'Perfis de cliente da empresa, usados para montar o lead simulado do modo de treino.';

ALTER TABLE public.lead_profiles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_lead_profiles_updated_at ON public.lead_profiles;
CREATE TRIGGER update_lead_profiles_updated_at
  BEFORE UPDATE ON public.lead_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_profiles TO authenticated;
GRANT ALL ON public.lead_profiles TO service_role;

-- Todo mundo da empresa lê (o treino é de todos); admin e gestor editam.
DROP POLICY IF EXISTS lead_profiles_select ON public.lead_profiles;
DROP POLICY IF EXISTS lead_profiles_insert ON public.lead_profiles;
DROP POLICY IF EXISTS lead_profiles_update ON public.lead_profiles;
DROP POLICY IF EXISTS lead_profiles_delete ON public.lead_profiles;
CREATE POLICY lead_profiles_select ON public.lead_profiles FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY lead_profiles_insert ON public.lead_profiles FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id() AND public.org_is_active(org_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  );
CREATE POLICY lead_profiles_update ON public.lead_profiles FOR UPDATE TO authenticated
  USING (
    org_id = public.current_org_id() AND public.org_is_active(org_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  )
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY lead_profiles_delete ON public.lead_profiles FOR DELETE TO authenticated
  USING (
    org_id = public.current_org_id() AND public.org_is_active(org_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  );

-- Modo suporte "Ver conta" é só leitura também aqui (ver 20261022090000).
DROP POLICY IF EXISTS support_no_insert ON public.lead_profiles;
DROP POLICY IF EXISTS support_no_update ON public.lead_profiles;
DROP POLICY IF EXISTS support_no_delete ON public.lead_profiles;
CREATE POLICY support_no_insert ON public.lead_profiles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.support_read_only());
CREATE POLICY support_no_update ON public.lead_profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.support_read_only());
CREATE POLICY support_no_delete ON public.lead_profiles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.support_read_only());

-- Sugestão de perfis pela IA entra no registro de consumo.
ALTER TABLE public.api_usage_logs DROP CONSTRAINT IF EXISTS api_usage_logs_operation_type_check;
ALTER TABLE public.api_usage_logs ADD CONSTRAINT api_usage_logs_operation_type_check
  CHECK (operation_type IN (
    'transcricao', 'analise', 'embedding', 'rag',
    'generate_arguments', 'live_transcricao', 'live_coach',
    'extracao_documento', 'storage', 'roleplay', 'assistant_chat',
    'sugestao_metodologia', 'sugestao_perfis'
  ));
