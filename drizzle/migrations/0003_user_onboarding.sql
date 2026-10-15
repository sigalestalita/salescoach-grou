CREATE TABLE IF NOT EXISTS public.user_onboarding (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT public.current_org_id(),
  completed_steps  TEXT[] NOT NULL DEFAULT '{}',
  welcome_seen_at  TIMESTAMPTZ,
  tour_done_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_onboarding TO authenticated;
GRANT ALL ON public.user_onboarding TO service_role;

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

DROP POLICY IF EXISTS support_no_insert ON public.user_onboarding;
DROP POLICY IF EXISTS support_no_update ON public.user_onboarding;
CREATE POLICY support_no_insert ON public.user_onboarding AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.support_org_id() IS NULL);
CREATE POLICY support_no_update ON public.user_onboarding AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.support_org_id() IS NULL);

DROP TRIGGER IF EXISTS update_user_onboarding_updated_at ON public.user_onboarding;
CREATE TRIGGER update_user_onboarding_updated_at
  BEFORE UPDATE ON public.user_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();