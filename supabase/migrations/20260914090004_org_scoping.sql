-- ============================================================================
-- Escopo de organização nas tabelas existentes.
--
-- Nesta migração as colunas entram como NULL para permitir o backfill; a
-- obrigatoriedade e as policies vêm na migração de enforcement.
-- ============================================================================

-- ── Coluna de organização ───────────────────────────────────────────────────

ALTER TABLE public.teams                  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.profiles               ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles             ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.meetings               ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.transcriptions         ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.analysis_results       ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.highlights             ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_documents    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_items        ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.transcription_segments ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.live_tips              ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Índices compostos: toda consulta passa a filtrar por organização primeiro.
CREATE INDEX IF NOT EXISTS idx_teams_org                  ON public.teams (org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org               ON public.profiles (org_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org             ON public.user_roles (org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_org_created       ON public.meetings (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_org_seller        ON public.meetings (org_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_transcriptions_org         ON public.transcriptions (org_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_org       ON public.analysis_results (org_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_highlights_org             ON public.highlights (org_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_org    ON public.knowledge_documents (org_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_org        ON public.knowledge_items (org_id);
CREATE INDEX IF NOT EXISTS idx_transcription_segments_org ON public.transcription_segments (org_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_live_tips_org              ON public.live_tips (org_id, meeting_id);

-- ── Funções de contexto ─────────────────────────────────────────────────────

-- Organização do usuário autenticado. SECURITY DEFINER para ser usada dentro
-- das policies sem recursão de RLS.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- Organização ativa? Suspensa ou cancelada perde escrita, mas mantém leitura
-- para que o cliente consiga exportar os próprios dados.
CREATE OR REPLACE FUNCTION public.org_is_active(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = _org_id AND status IN ('trial', 'active', 'past_due')
  )
$$;

-- Papel do usuário dentro da própria organização. Mantém a assinatura original
-- (usada por dezenas de policies) e passa a exigir que o papel pertença à
-- organização do usuário.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND ur.org_id IS NOT DISTINCT FROM p.org_id
  )
$$;

-- ── Herança de organização nas tabelas filhas ───────────────────────────────
-- Preenche org_id a partir da reunião quando quem insere não informa. Vale
-- tanto para o app (usuário autenticado) quanto para as edge functions
-- (service role, sem auth.uid()).

CREATE OR REPLACE FUNCTION public.set_org_from_meeting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT m.org_id INTO NEW.org_id FROM public.meetings m WHERE m.id = NEW.meeting_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_org_transcriptions
  BEFORE INSERT ON public.transcriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_meeting();

CREATE TRIGGER set_org_analysis_results
  BEFORE INSERT ON public.analysis_results
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_meeting();

CREATE TRIGGER set_org_highlights
  BEFORE INSERT ON public.highlights
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_meeting();

CREATE TRIGGER set_org_transcription_segments
  BEFORE INSERT ON public.transcription_segments
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_meeting();

CREATE TRIGGER set_org_live_tips
  BEFORE INSERT ON public.live_tips
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_meeting();

-- ── Controle de compartilhamento externo ────────────────────────────────────
-- Hoje toda reunião nasce com share_token e qualquer link vaza a transcrição
-- inteira, sem expiração nem revogação. O token continua existindo, mas passa
-- a exigir ativação explícita.

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS share_enabled    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS share_revoked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS shared_by        UUID;

-- ── Vocabulário de negócio deixa de ser fixo no schema ──────────────────────

-- As faixas de temperatura passam a ser definidas pelo template de análise da
-- organização, então o CHECK fixo sai (a validação passa a ser do template).
ALTER TABLE public.meetings          DROP CONSTRAINT IF EXISTS meetings_temperature_check;
ALTER TABLE public.analysis_results  DROP CONSTRAINT IF EXISTS analysis_results_temperature_check;

-- O tipo de reunião passa a vir de meeting_types, por organização.
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_meeting_type_check;
ALTER TABLE public.meetings ALTER COLUMN meeting_type DROP DEFAULT;

-- A interface já envia "planilha" ao subir XLS/CSV, mas o CHECK rejeitava o
-- valor e o upload falhava.
ALTER TABLE public.knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_doc_type_check;
ALTER TABLE public.knowledge_documents ADD CONSTRAINT knowledge_documents_doc_type_check
  CHECK (doc_type IN ('pdf', 'doc', 'link', 'text', 'texto', 'planilha'));
