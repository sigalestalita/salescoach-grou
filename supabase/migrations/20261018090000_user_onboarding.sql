-- ============================================================================
-- Jornada de primeiros passos e tour guiado, por usuário.
--
-- A maior parte das etapas é detectada pelos próprios dados (base de
-- conhecimento enviada, CRM conectado, primeira reunião analisada...). Aqui
-- ficam só o que não dá para deduzir: as etapas que a pessoa marcou como
-- concluídas, se ela já viu as boas-vindas e se fez o tour.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_onboarding (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  completed_steps  TEXT[] NOT NULL DEFAULT '{}',
  welcome_seen_at  TIMESTAMPTZ,
  tour_done_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_onboarding_select" ON public.user_onboarding;
CREATE POLICY "user_onboarding_select" ON public.user_onboarding FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS "user_onboarding_insert" ON public.user_onboarding;
CREATE POLICY "user_onboarding_insert" ON public.user_onboarding FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS "user_onboarding_update" ON public.user_onboarding;
CREATE POLICY "user_onboarding_update" ON public.user_onboarding FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND user_id = auth.uid())
  WITH CHECK (org_id = public.current_org_id() AND user_id = auth.uid());

-- Modo suporte é só leitura (ver 20261016090000_support_access.sql).
DROP POLICY IF EXISTS support_no_insert ON public.user_onboarding;
DROP POLICY IF EXISTS support_no_update ON public.user_onboarding;
CREATE POLICY support_no_insert ON public.user_onboarding AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.support_org_id() IS NULL);
CREATE POLICY support_no_update ON public.user_onboarding AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.support_org_id() IS NULL);

CREATE TRIGGER update_user_onboarding_updated_at
  BEFORE UPDATE ON public.user_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
