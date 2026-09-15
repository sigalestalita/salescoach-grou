-- ============================================================================
-- VERIFICAR A MIGRAÇÃO
--
-- Cole no SQL do backend depois de aplicar as migrações. É somente leitura:
-- não cria, não altera e não apaga nada.
--
-- Devolve uma tabela. Toda linha precisa terminar em "ok". Qualquer "FALHOU"
-- é motivo para não seguir com o deploy do código.
-- ============================================================================

WITH tabelas_tenant AS (
  SELECT unnest(ARRAY[
    'teams','meetings','transcriptions','analysis_results','highlights',
    'transcription_segments','live_tips','knowledge_documents','knowledge_items',
    'api_usage_logs','user_roles','meeting_types','analysis_templates',
    'pain_categories','pain_items','offer_types','org_settings','organization_invites'
  ]) AS tabela
),
verificacoes AS (

  -- ── Estrutura ─────────────────────────────────────────────────────────────

  SELECT 1 AS ordem, 'Organizações existentes' AS verificacao, '1' AS esperado,
         (SELECT count(*)::text FROM public.organizations) AS obtido

  UNION ALL SELECT 2, 'Nome da organização (confira se é o que você espera)', '(informativo)',
         COALESCE((SELECT name FROM public.organizations ORDER BY created_at LIMIT 1), '(nenhuma)')

  -- ── Nada ficou órfão ──────────────────────────────────────────────────────

  UNION ALL SELECT 10, 'Reuniões sem organização', '0',
         (SELECT count(*)::text FROM public.meetings WHERE org_id IS NULL)
  UNION ALL SELECT 11, 'Perfis sem organização', '0',
         (SELECT count(*)::text FROM public.profiles WHERE org_id IS NULL)
  UNION ALL SELECT 12, 'Papéis sem organização', '0',
         (SELECT count(*)::text FROM public.user_roles WHERE org_id IS NULL)
  UNION ALL SELECT 13, 'Transcrições sem organização', '0',
         (SELECT count(*)::text FROM public.transcriptions WHERE org_id IS NULL)
  UNION ALL SELECT 14, 'Análises sem organização', '0',
         (SELECT count(*)::text FROM public.analysis_results WHERE org_id IS NULL)
  UNION ALL SELECT 15, 'Highlights sem organização', '0',
         (SELECT count(*)::text FROM public.highlights WHERE org_id IS NULL)
  UNION ALL SELECT 16, 'Documentos da base sem organização', '0',
         (SELECT count(*)::text FROM public.knowledge_documents WHERE org_id IS NULL)
  UNION ALL SELECT 17, 'Itens da base sem organização', '0',
         (SELECT count(*)::text FROM public.knowledge_items WHERE org_id IS NULL)
  UNION ALL SELECT 18, 'Segmentos ao vivo sem organização', '0',
         (SELECT count(*)::text FROM public.transcription_segments WHERE org_id IS NULL)
  UNION ALL SELECT 19, 'Dicas ao vivo sem organização', '0',
         (SELECT count(*)::text FROM public.live_tips WHERE org_id IS NULL)

  -- ── Ninguém perde acesso ──────────────────────────────────────────────────

  UNION ALL SELECT 20, 'Usuários que ficariam sem papel (perderiam acesso)', '0',
         (SELECT count(*)::text FROM public.profiles p
           WHERE p.org_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.user_roles r
                              WHERE r.user_id = p.user_id AND r.org_id = p.org_id))

  UNION ALL SELECT 21, 'Administradores na organização', '>= 1',
         CASE WHEN (SELECT count(*) FROM public.user_roles WHERE role = 'admin') >= 1
              THEN '>= 1' ELSE '0' END

  -- ── A configuração de hoje foi preservada ─────────────────────────────────

  UNION ALL SELECT 30, 'Template de análise padrão', '1',
         (SELECT count(*)::text FROM public.analysis_templates WHERE is_default)
  UNION ALL SELECT 31, 'Metodologia gravada', '(informativo)',
         COALESCE((SELECT methodology_label FROM public.analysis_templates WHERE is_default LIMIT 1), '(nenhuma)')
  UNION ALL SELECT 32, 'Critérios de qualificação', '(informativo)',
         COALESCE((SELECT jsonb_array_length(qualification_criteria)::text
                     FROM public.analysis_templates WHERE is_default LIMIT 1), '0')
  UNION ALL SELECT 33, 'Faixas de temperatura', '(informativo)',
         COALESCE((SELECT jsonb_array_length(temperature_levels)::text
                     FROM public.analysis_templates WHERE is_default LIMIT 1), '0')
  UNION ALL SELECT 34, 'Regras específicas preservadas no template', 'sim',
         CASE WHEN EXISTS (SELECT 1 FROM public.analysis_templates
                            WHERE is_default AND extra_instructions IS NOT NULL)
              THEN 'sim' ELSE 'não' END

  UNION ALL SELECT 35, 'Tipos de reunião cadastrados', '(informativo)',
         (SELECT count(*)::text FROM public.meeting_types)
  UNION ALL SELECT 36, 'Reuniões com tipo que não existe no cadastro', '0',
         (SELECT count(*)::text FROM public.meetings m
           WHERE m.meeting_type IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.meeting_types t
                              WHERE t.org_id = m.org_id AND t.key = m.meeting_type))

  UNION ALL SELECT 37, 'Categorias de dor', '(informativo)',
         (SELECT count(*)::text FROM public.pain_categories)
  UNION ALL SELECT 38, 'Dores no catálogo', '(informativo)',
         (SELECT count(*)::text FROM public.pain_items)
  UNION ALL SELECT 39, 'Tipos de oferta', '(informativo)',
         (SELECT count(*)::text FROM public.offer_types)

  UNION ALL SELECT 40, 'Identidade visual gravada', '1',
         (SELECT count(*)::text FROM public.organization_branding)
  UNION ALL SELECT 41, 'Cor principal', '(informativo)',
         COALESCE((SELECT primary_hsl FROM public.organization_branding LIMIT 1), '(nenhuma)')

  -- ── Plano e compartilhamento ──────────────────────────────────────────────

  UNION ALL SELECT 50, 'Organização no plano interno (sem cobrança e sem limite)', 'sim',
         CASE WHEN EXISTS (SELECT 1 FROM public.subscriptions s
                             JOIN public.plans p ON p.id = s.plan_id
                            WHERE p.key = 'internal_unlimited')
              THEN 'sim' ELSE 'não' END

  UNION ALL SELECT 51, 'Links de compartilhamento já emitidos que foram desativados', '0',
         (SELECT count(*)::text FROM public.meetings
           WHERE share_token IS NOT NULL AND share_enabled = false)

  -- ── Isolamento e segurança ────────────────────────────────────────────────

  UNION ALL SELECT 60, 'Policies de dados de cliente SEM filtro de organização', '0',
         (SELECT count(*)::text
            FROM pg_policies p
            JOIN tabelas_tenant t ON t.tabela = p.tablename
           WHERE p.schemaname = 'public'
             AND COALESCE(p.qual, '') || COALESCE(p.with_check, '') NOT LIKE '%current_org_id%')

  UNION ALL SELECT 61, 'Tabelas de cliente sem RLS ativada', '0',
         (SELECT count(*)::text
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN tabelas_tenant t ON t.tabela = c.relname
           WHERE n.nspname = 'public' AND NOT c.relrowsecurity)

  UNION ALL SELECT 62, 'Cadastro novo recebe papel automático', 'não',
         CASE WHEN (SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user' LIMIT 1)
                   ILIKE '%user_roles%'
              THEN 'sim' ELSE 'não' END

  UNION ALL SELECT 63, 'Leitura de gravação no storage valida dono/organização', 'sim',
         CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                            WHERE policyname = 'meeting_files_select'
                              AND qual LIKE '%current_org_id%')
              THEN 'sim' ELSE 'não' END

  UNION ALL SELECT 64, 'Funções de contexto criadas', '3',
         (SELECT count(*)::text FROM pg_proc
           WHERE proname IN ('current_org_id', 'is_platform_admin', 'org_is_active'))

  -- ── Volume de dados (compare com o que você tinha antes) ──────────────────

  UNION ALL SELECT 70, 'Total de reuniões', '(informativo)',
         (SELECT count(*)::text FROM public.meetings)
  UNION ALL SELECT 71, 'Total de análises', '(informativo)',
         (SELECT count(*)::text FROM public.analysis_results)
  UNION ALL SELECT 72, 'Total de usuários', '(informativo)',
         (SELECT count(*)::text FROM public.profiles)
  UNION ALL SELECT 73, 'Total de documentos na base', '(informativo)',
         (SELECT count(*)::text FROM public.knowledge_documents)
)
SELECT
  ordem,
  verificacao,
  esperado,
  obtido,
  CASE
    WHEN esperado = '(informativo)' THEN 'ℹ️'
    WHEN esperado = obtido          THEN 'ok'
    ELSE                                 'FALHOU'
  END AS status
FROM verificacoes
ORDER BY ordem;
