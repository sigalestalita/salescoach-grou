-- ============================================================================
-- Isolamento por organização.
--
-- Toda policy passa a começar por org_id = current_org_id(). As regras de
-- papel (vendedor vê o próprio, gestor vê o time, admin vê tudo) continuam
-- exatamente como eram — só deixam de valer entre empresas diferentes.
-- ============================================================================

-- ── Obrigatoriedade e preenchimento automático ──────────────────────────────
-- profiles.org_id continua opcional: um usuário recém-cadastrado só ganha
-- organização ao aceitar um convite.

ALTER TABLE public.teams                  ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.meetings               ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.knowledge_documents    ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.knowledge_items        ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.api_usage_logs         ALTER COLUMN org_id SET DEFAULT public.current_org_id();

ALTER TABLE public.teams                  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.user_roles             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.meetings               ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.transcriptions         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.analysis_results       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.highlights             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.knowledge_documents    ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.knowledge_items        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.transcription_segments ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.live_tips              ALTER COLUMN org_id SET NOT NULL;

-- Um papel passa a ser por organização.
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_org_role_key
  ON public.user_roles (user_id, org_id, role);

-- ── Permissões de tabela ────────────────────────────────────────────────────

GRANT SELECT ON public.organizations, public.organization_branding, public.org_settings,
  public.meeting_types, public.analysis_templates, public.pain_categories, public.pain_items,
  public.offer_types, public.plans, public.subscriptions, public.usage_counters,
  public.organization_invites, public.audit_log, public.reserved_slugs, public.platform_admins
  TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.organization_branding, public.org_settings,
  public.meeting_types, public.analysis_templates, public.pain_categories, public.pain_items,
  public.offer_types, public.organization_invites
  TO authenticated;

GRANT UPDATE ON public.organizations TO authenticated;

GRANT ALL ON public.organizations, public.organization_branding, public.org_settings,
  public.meeting_types, public.analysis_templates, public.pain_categories, public.pain_items,
  public.offer_types, public.plans, public.subscriptions, public.usage_counters,
  public.organization_invites, public.audit_log, public.reserved_slugs, public.platform_admins
  TO service_role;

-- ============================================================================
-- Tabelas existentes
-- ============================================================================

-- ── teams ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "teams_select"       ON public.teams;
DROP POLICY IF EXISTS "teams_admin_insert" ON public.teams;
DROP POLICY IF EXISTS "teams_admin_update" ON public.teams;
DROP POLICY IF EXISTS "teams_admin_delete" ON public.teams;

CREATE POLICY "teams_select" ON public.teams FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "teams_admin_insert" ON public.teams FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "teams_admin_update" ON public.teams FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "teams_admin_delete" ON public.teams FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

-- ── profiles ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_select"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_delete" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR org_id = public.current_org_id());

-- O usuário não pode mudar a própria organização.
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND org_id IS NOT DISTINCT FROM public.current_org_id());

CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND org_id IS NOT DISTINCT FROM public.current_org_id());

CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "profiles_admin_delete" ON public.profiles FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

-- ── user_roles ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "roles_select_own"   ON public.user_roles;
DROP POLICY IF EXISTS "roles_admin_insert" ON public.user_roles;
DROP POLICY IF EXISTS "roles_admin_update" ON public.user_roles;
DROP POLICY IF EXISTS "roles_admin_delete" ON public.user_roles;

CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY "roles_admin_insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_update" ON public.user_roles FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "roles_admin_delete" ON public.user_roles FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

-- ── meetings ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;

CREATE POLICY "meetings_select" ON public.meetings FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (
      seller_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'gestor')
    )
  );
CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND public.org_is_active(org_id)
    AND (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  );
CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND (seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));

-- ── transcriptions ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "transcriptions_select" ON public.transcriptions;
DROP POLICY IF EXISTS "transcriptions_insert" ON public.transcriptions;
DROP POLICY IF EXISTS "transcriptions_delete" ON public.transcriptions;

CREATE POLICY "transcriptions_select" ON public.transcriptions FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = transcriptions.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
    )
  );
CREATE POLICY "transcriptions_insert" ON public.transcriptions FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = transcriptions.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );
CREATE POLICY "transcriptions_delete" ON public.transcriptions FOR DELETE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = transcriptions.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ── analysis_results ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "analysis_select" ON public.analysis_results;
DROP POLICY IF EXISTS "analysis_insert" ON public.analysis_results;
DROP POLICY IF EXISTS "analysis_delete" ON public.analysis_results;

CREATE POLICY "analysis_select" ON public.analysis_results FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = analysis_results.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
    )
  );
CREATE POLICY "analysis_insert" ON public.analysis_results FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = analysis_results.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );
CREATE POLICY "analysis_delete" ON public.analysis_results FOR DELETE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = analysis_results.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ── highlights ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "highlights_select" ON public.highlights;
DROP POLICY IF EXISTS "highlights_insert" ON public.highlights;
DROP POLICY IF EXISTS "highlights_delete" ON public.highlights;

CREATE POLICY "highlights_select" ON public.highlights FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = highlights.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
    )
  );
CREATE POLICY "highlights_insert" ON public.highlights FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = highlights.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );
CREATE POLICY "highlights_delete" ON public.highlights FOR DELETE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = highlights.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ── transcription_segments ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "segments_select" ON public.transcription_segments;
DROP POLICY IF EXISTS "segments_insert" ON public.transcription_segments;
DROP POLICY IF EXISTS "segments_delete" ON public.transcription_segments;

CREATE POLICY "segments_select" ON public.transcription_segments FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = transcription_segments.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
    )
  );
CREATE POLICY "segments_insert" ON public.transcription_segments FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = transcription_segments.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );
CREATE POLICY "segments_delete" ON public.transcription_segments FOR DELETE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = transcription_segments.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ── live_tips ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tips_select" ON public.live_tips;
DROP POLICY IF EXISTS "tips_insert" ON public.live_tips;
DROP POLICY IF EXISTS "tips_delete" ON public.live_tips;

CREATE POLICY "tips_select" ON public.live_tips FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = live_tips.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
    )
  );
CREATE POLICY "tips_insert" ON public.live_tips FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = live_tips.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );
CREATE POLICY "tips_delete" ON public.live_tips FOR DELETE TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = live_tips.meeting_id
        AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ── knowledge_documents / knowledge_items ───────────────────────────────────

DROP POLICY IF EXISTS "knowledge_docs_select"       ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_docs_admin_insert" ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_docs_admin_update" ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_docs_admin_delete" ON public.knowledge_documents;

CREATE POLICY "knowledge_docs_select" ON public.knowledge_documents FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "knowledge_docs_admin_insert" ON public.knowledge_documents FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "knowledge_docs_admin_update" ON public.knowledge_documents FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "knowledge_docs_admin_delete" ON public.knowledge_documents FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "knowledge_items_select"       ON public.knowledge_items;
DROP POLICY IF EXISTS "knowledge_items_admin_insert" ON public.knowledge_items;
DROP POLICY IF EXISTS "knowledge_items_admin_update" ON public.knowledge_items;
DROP POLICY IF EXISTS "knowledge_items_admin_delete" ON public.knowledge_items;

CREATE POLICY "knowledge_items_select" ON public.knowledge_items FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "knowledge_items_admin_insert" ON public.knowledge_items FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "knowledge_items_admin_update" ON public.knowledge_items FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "knowledge_items_admin_delete" ON public.knowledge_items FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

-- ── api_usage_logs ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "api_logs_select" ON public.api_usage_logs;
DROP POLICY IF EXISTS "api_logs_insert" ON public.api_usage_logs;

CREATE POLICY "api_logs_select" ON public.api_usage_logs FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  );
CREATE POLICY "api_logs_insert" ON public.api_usage_logs FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND user_id = auth.uid());

-- ============================================================================
-- Tabelas novas
-- ============================================================================

CREATE POLICY "orgs_select" ON public.organizations FOR SELECT TO authenticated
  USING (id = public.current_org_id() OR public.is_platform_admin());
CREATE POLICY "orgs_admin_update" ON public.organizations FOR UPDATE TO authenticated
  USING (
    (id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
    OR public.is_platform_admin()
  )
  WITH CHECK (id = public.current_org_id() OR public.is_platform_admin());

-- A identidade visual não é legível em massa: a tela de login resolve a marca
-- de UMA organização pela função pública get-branding, sem expor a carteira de
-- clientes.
CREATE POLICY "branding_select_members" ON public.organization_branding FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() OR public.is_platform_admin());
CREATE POLICY "branding_admin_write" ON public.organization_branding FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "branding_admin_update" ON public.organization_branding FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "settings_select" ON public.org_settings FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "settings_admin_insert" ON public.org_settings FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "settings_admin_update" ON public.org_settings FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "platform_admins_select" ON public.platform_admins FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "reserved_slugs_select" ON public.reserved_slugs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "invites_admin_select" ON public.organization_invites FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "invites_admin_insert" ON public.organization_invites FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_org_id()
    AND public.has_role(auth.uid(), 'admin')
    AND public.org_is_active(org_id)
  );
CREATE POLICY "invites_admin_update" ON public.organization_invites FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "audit_select" ON public.audit_log FOR SELECT TO authenticated
  USING (
    (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
    OR public.is_platform_admin()
  );

CREATE POLICY "plans_select" ON public.plans FOR SELECT TO authenticated
  USING (is_active OR public.is_platform_admin());

CREATE POLICY "subscriptions_select" ON public.subscriptions FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() OR public.is_platform_admin());

CREATE POLICY "usage_counters_select" ON public.usage_counters FOR SELECT TO authenticated
  USING (
    (org_id = public.current_org_id()
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor')))
    OR public.is_platform_admin()
  );

-- ── Configuração de negócio ─────────────────────────────────────────────────

CREATE POLICY "meeting_types_select" ON public.meeting_types FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "meeting_types_admin_insert" ON public.meeting_types FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "meeting_types_admin_update" ON public.meeting_types FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "meeting_types_admin_delete" ON public.meeting_types FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "templates_select" ON public.analysis_templates FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "templates_admin_insert" ON public.analysis_templates FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "templates_admin_update" ON public.analysis_templates FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "templates_admin_delete" ON public.analysis_templates FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "pain_categories_select" ON public.pain_categories FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "pain_categories_admin_write" ON public.pain_categories FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pain_categories_admin_update" ON public.pain_categories FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "pain_categories_admin_delete" ON public.pain_categories FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "pain_items_select" ON public.pain_items FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "pain_items_admin_write" ON public.pain_items FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pain_items_admin_update" ON public.pain_items FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "pain_items_admin_delete" ON public.pain_items FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "offer_types_select" ON public.offer_types FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY "offer_types_admin_write" ON public.offer_types FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "offer_types_admin_update" ON public.offer_types FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY "offer_types_admin_delete" ON public.offer_types FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- Storage
-- ============================================================================

-- Gravações: a leitura passa a exigir ser o dono do arquivo ou ter acesso à
-- reunião correspondente dentro da mesma organização. Antes, qualquer usuário
-- autenticado baixava qualquer arquivo do bucket.
DROP POLICY IF EXISTS "meeting_files_select" ON storage.objects;
CREATE POLICY "meeting_files_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'meeting-files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.meetings m
        WHERE m.file_url = storage.objects.name
          AND m.org_id = public.current_org_id()
          AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
      )
    )
  );

DROP POLICY IF EXISTS "knowledge_files_select" ON storage.objects;
CREATE POLICY "knowledge_files_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'knowledge-files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.knowledge_documents d
        WHERE d.file_url = storage.objects.name
          AND d.org_id = public.current_org_id()
      )
    )
  );

-- Identidade visual: bucket público para leitura (logo aparece na tela de
-- login), escrita restrita ao admin da organização dona da pasta.
DROP POLICY IF EXISTS "org_assets_insert" ON storage.objects;
DROP POLICY IF EXISTS "org_assets_update" ON storage.objects;
DROP POLICY IF EXISTS "org_assets_delete" ON storage.objects;

CREATE POLICY "org_assets_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "org_assets_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "org_assets_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND public.has_role(auth.uid(), 'admin')
  );
