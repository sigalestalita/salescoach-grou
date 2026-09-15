-- ============================================================================
-- Verificação do ensaio.
--
-- Cada bloco falha com exceção se o resultado não for o esperado, então o
-- script inteiro só chega ao fim se a migração estiver correta.
-- ============================================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.check(cond BOOLEAN, msg TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'FALHOU: %', msg;
  END IF;
  RAISE NOTICE '  ok  %', msg;
END
$$;

\echo ''
\echo '=== 1. Backfill: os dados de hoje continuam inteiros ==='

DO $$
DECLARE
  v_org UUID;
  n INT;
BEGIN
  SELECT id INTO v_org FROM public.organizations;
  PERFORM pg_temp.check(v_org IS NOT NULL, 'organização criada para a instalação existente');

  SELECT count(*) INTO n FROM public.organizations;
  PERFORM pg_temp.check(n = 1, 'exatamente uma organização após o backfill');

  SELECT count(*) INTO n FROM public.meetings WHERE org_id IS NULL;
  PERFORM pg_temp.check(n = 0, 'nenhuma reunião ficou sem organização');

  SELECT count(*) INTO n FROM public.profiles WHERE org_id IS NULL;
  PERFORM pg_temp.check(n = 0, 'nenhum perfil ficou sem organização');

  SELECT count(*) INTO n FROM public.user_roles WHERE org_id IS NULL;
  PERFORM pg_temp.check(n = 0, 'nenhum papel ficou sem organização');

  SELECT count(*) INTO n FROM public.transcriptions WHERE org_id IS NULL;
  PERFORM pg_temp.check(n = 0, 'transcrições com organização');

  SELECT count(*) INTO n FROM public.analysis_results WHERE org_id IS NULL;
  PERFORM pg_temp.check(n = 0, 'análises com organização');

  SELECT count(*) INTO n FROM public.knowledge_documents WHERE org_id IS NULL;
  PERFORM pg_temp.check(n = 0, 'base de conhecimento com organização');

  SELECT count(*) INTO n FROM public.meetings;
  PERFORM pg_temp.check(n = 3, 'as 3 reuniões continuam lá');

  SELECT count(*) INTO n FROM public.analysis_results;
  PERFORM pg_temp.check(n = 2, 'as 2 análises continuam lá');
END
$$;

\echo ''
\echo '=== 2. Configuração de hoje virou dado da organização ==='

DO $$
DECLARE
  t RECORD;
  n INT;
BEGIN
  SELECT * INTO t FROM public.analysis_templates WHERE is_default;
  PERFORM pg_temp.check(t.methodology_label = 'BAN', 'metodologia preservada: BAN');
  PERFORM pg_temp.check(jsonb_array_length(t.qualification_criteria) = 3, 'os 3 critérios BAN');
  PERFORM pg_temp.check(jsonb_array_length(t.temperature_levels) = 5, 'as 5 faixas de temperatura');
  PERFORM pg_temp.check(t.extra_instructions ILIKE '%NÃO use prazo%', 'regra de não usar prazo preservada');

  SELECT count(*) INTO n FROM public.meeting_types;
  PERFORM pg_temp.check(n = 2, 'os 2 tipos de reunião de hoje');

  PERFORM pg_temp.check(
    EXISTS (SELECT 1 FROM public.meeting_types WHERE key = 'consultoria' AND prompt_context IS NOT NULL),
    'contexto de consultoria preservado no tipo de reunião');

  SELECT count(*) INTO n FROM public.pain_categories;
  PERFORM pg_temp.check(n = 6, 'as 6 categorias de dor');

  SELECT count(*) INTO n FROM public.pain_items;
  PERFORM pg_temp.check(n = 29, 'as 29 dores do catálogo');

  SELECT count(*) INTO n FROM public.offer_types;
  PERFORM pg_temp.check(n = 3, 'os 3 tipos de oferta');

  PERFORM pg_temp.check(
    (SELECT primary_hsl FROM public.organization_branding) = '24 95% 53%',
    'cor principal de hoje preservada');
END
$$;

\echo ''
\echo '=== 3. Plano interno sem limite e links antigos ainda válidos ==='

DO $$
DECLARE
  n INT;
  v_org UUID;
BEGIN
  SELECT id INTO v_org FROM public.organizations;

  PERFORM pg_temp.check(
    EXISTS (SELECT 1 FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
            WHERE s.org_id = v_org AND p.key = 'internal_unlimited'),
    'organização existente no plano interno');

  PERFORM pg_temp.check(public.check_org_quota(v_org, 'analise', 999999),
    'plano interno não impõe limite');

  SELECT count(*) INTO n FROM public.meetings WHERE share_enabled;
  PERFORM pg_temp.check(n = 3, 'links de compartilhamento já emitidos continuam ativos');
END
$$;

\echo ''
\echo '=== 4. Cadastro não concede mais acesso ==='

DO $$
DECLARE
  n INT;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('99999999-9999-9999-9999-999999999999', 'estranho@fora.com', '{"full_name":"Estranho"}'::jsonb);

  SELECT count(*) INTO n FROM public.profiles WHERE user_id = '99999999-9999-9999-9999-999999999999';
  PERFORM pg_temp.check(n = 1, 'cadastro cria o perfil');

  SELECT count(*) INTO n FROM public.profiles
   WHERE user_id = '99999999-9999-9999-9999-999999999999' AND org_id IS NOT NULL;
  PERFORM pg_temp.check(n = 0, 'cadastro NÃO entra em nenhuma organização');

  SELECT count(*) INTO n FROM public.user_roles WHERE user_id = '99999999-9999-9999-9999-999999999999';
  PERFORM pg_temp.check(n = 0, 'cadastro NÃO recebe papel automático');
END
$$;

\echo ''
\echo '=== 5. Segunda organização, provisionada do zero ==='

DO $$
DECLARE
  v_org_b UUID;
  t RECORD;
BEGIN
  v_org_b := public.provision_organization('Empresa B', 'empresa-b', NULL, 'Coach de Vendas');

  SELECT * INTO t FROM public.analysis_templates WHERE org_id = v_org_b AND is_default;
  PERFORM pg_temp.check(t.methodology_label = 'BANT', 'organização nova nasce com BANT, não com a metodologia do outro cliente');
  PERFORM pg_temp.check(jsonb_array_length(t.qualification_criteria) = 4, 'BANT com 4 critérios');

  PERFORM pg_temp.check(
    (SELECT primary_hsl FROM public.organization_branding WHERE org_id = v_org_b) = '217 91% 60%',
    'organização nova nasce com a cor neutra da plataforma');

  PERFORM pg_temp.check(
    (SELECT count(*) FROM public.pain_categories WHERE org_id = v_org_b) = 0,
    'organização nova NÃO herda o catálogo de dores do outro cliente');

  PERFORM pg_temp.check(
    (SELECT count(*) FROM public.meeting_types WHERE org_id = v_org_b) = 4,
    'organização nova recebe tipos de reunião genéricos');

  -- Um usuário e uma reunião na organização B, para os testes de isolamento.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('55555555-5555-5555-5555-555555555555', 'admin@empresab.com', '{"full_name":"Bia"}'::jsonb);

  UPDATE public.profiles SET org_id = v_org_b WHERE user_id = '55555555-5555-5555-5555-555555555555';
  INSERT INTO public.user_roles (user_id, org_id, role)
  VALUES ('55555555-5555-5555-5555-555555555555', v_org_b, 'admin');

  INSERT INTO public.meetings (title, org_id, seller_id, status, share_token)
  VALUES ('Reunião da Empresa B', v_org_b, '55555555-5555-5555-5555-555555555555', 'completo', gen_random_uuid());
END
$$;

\echo ''
\echo '=== 6. Isolamento: a empresa B não enxerga a empresa A ==='

BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

  DO $$
  DECLARE n INT;
  BEGIN
    SELECT count(*) INTO n FROM public.meetings;
    PERFORM pg_temp.check(n = 1, 'admin da empresa B vê só a reunião dela (e não as 3 da outra)');

    SELECT count(*) INTO n FROM public.transcriptions;
    PERFORM pg_temp.check(n = 0, 'admin da empresa B não vê transcrição alheia');

    SELECT count(*) INTO n FROM public.analysis_results;
    PERFORM pg_temp.check(n = 0, 'admin da empresa B não vê análise alheia');

    SELECT count(*) INTO n FROM public.knowledge_documents;
    PERFORM pg_temp.check(n = 0, 'admin da empresa B não vê base de conhecimento alheia');

    SELECT count(*) INTO n FROM public.profiles;
    PERFORM pg_temp.check(n = 1, 'admin da empresa B só enxerga o próprio time');

    SELECT count(*) INTO n FROM public.teams;
    PERFORM pg_temp.check(n = 0, 'admin da empresa B não vê times alheios');

    SELECT count(*) INTO n FROM public.analysis_templates;
    PERFORM pg_temp.check(n = 1, 'admin da empresa B só vê o próprio template');

    SELECT count(*) INTO n FROM storage.objects;
    PERFORM pg_temp.check(n = 0, 'admin da empresa B não baixa arquivo de gravação alheio');

    SELECT count(*) INTO n FROM public.live_tips;
    PERFORM pg_temp.check(n = 0, 'admin da empresa B não vê dicas ao vivo alheias');

    SELECT count(*) INTO n FROM public.api_usage_logs;
    PERFORM pg_temp.check(n = 0, 'admin da empresa B não vê consumo alheio');
  END
  $$;
ROLLBACK;

\echo ''
\echo '=== 7. Dentro da empresa, os papéis continuam como eram ==='

BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
  DO $$
  DECLARE n INT;
  BEGIN
    SELECT count(*) INTO n FROM public.meetings;
    PERFORM pg_temp.check(n = 2, 'vendedor vê apenas as próprias reuniões');

    SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'meeting-files';
    PERFORM pg_temp.check(n = 1, 'vendedor baixa apenas a própria gravação');

    SELECT count(*) INTO n FROM public.knowledge_documents;
    PERFORM pg_temp.check(n = 2, 'vendedor continua lendo a base de conhecimento da empresa');
  END
  $$;
ROLLBACK;

BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  DO $$
  DECLARE n INT;
  BEGIN
    SELECT count(*) INTO n FROM public.meetings;
    PERFORM pg_temp.check(n = 3, 'gestor continua vendo todas as reuniões da empresa');

    SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'meeting-files';
    PERFORM pg_temp.check(n = 2, 'gestor acessa as gravações da empresa');
  END
  $$;
ROLLBACK;

BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
  DO $$
  DECLARE n INT;
  BEGIN
    SELECT count(*) INTO n FROM public.meetings;
    PERFORM pg_temp.check(n = 3, 'admin continua vendo todas as reuniões da empresa');

    SELECT count(*) INTO n FROM public.profiles;
    PERFORM pg_temp.check(n = 4, 'admin continua vendo o time inteiro');
  END
  $$;
ROLLBACK;

\echo ''
\echo '=== 8. Usuário sem organização não enxerga nada ==='

BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
  DO $$
  DECLARE n INT;
  BEGIN
    SELECT count(*) INTO n FROM public.meetings;
    PERFORM pg_temp.check(n = 0, 'quem se cadastrou sozinho não vê reunião nenhuma');

    SELECT count(*) INTO n FROM public.knowledge_documents;
    PERFORM pg_temp.check(n = 0, 'nem base de conhecimento');

    SELECT count(*) INTO n FROM public.profiles;
    PERFORM pg_temp.check(n = 1, 'enxerga apenas o próprio perfil');
  END
  $$;
ROLLBACK;

\echo ''
\echo '=== 9. Um admin não consegue agir sobre outra organização ==='

BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
  DO $$
  DECLARE
    v_org_a UUID;
    n INT;
  BEGIN
    SELECT id INTO v_org_a FROM public.organizations WHERE slug <> 'empresa-b' LIMIT 1;

    -- Tenta escrever na organização alheia: a RLS precisa recusar.
    BEGIN
      INSERT INTO public.meetings (title, org_id, seller_id, status)
      VALUES ('Invasão', v_org_a, '55555555-5555-5555-5555-555555555555', 'enviado');
      RAISE EXCEPTION 'FALHOU: admin da empresa B conseguiu criar reunião na organização alheia';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE '  ok  escrita em organização alheia recusada';
    END;

    -- Tenta promover a si mesmo na organização alheia.
    BEGIN
      INSERT INTO public.user_roles (user_id, org_id, role)
      VALUES ('55555555-5555-5555-5555-555555555555', v_org_a, 'admin');
      RAISE EXCEPTION 'FALHOU: admin da empresa B conseguiu se dar papel na organização alheia';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE '  ok  autopromoção em organização alheia recusada';
    END;

    -- Tenta mudar a própria organização no perfil: a RLS recusa a escrita.
    BEGIN
      UPDATE public.profiles SET org_id = v_org_a WHERE user_id = '55555555-5555-5555-5555-555555555555';
      RAISE EXCEPTION 'FALHOU: usuário conseguiu se mudar de organização';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE '  ok  usuário não consegue se mudar de organização';
    END;

    SELECT count(*) INTO n FROM public.profiles
      WHERE user_id = '55555555-5555-5555-5555-555555555555' AND org_id = v_org_a;
    PERFORM pg_temp.check(n = 0, 'perfil permanece na organização original');
  END
  $$;
ROLLBACK;

\echo ''
\echo '=== 10. Cotas e medição ==='

DO $$
DECLARE
  v_org_b UUID;
  v_plan UUID;
BEGIN
  SELECT id INTO v_org_b FROM public.organizations WHERE slug = 'empresa-b';

  INSERT INTO public.plans (key, name, limits)
  VALUES ('teste_limitado', 'Teste', '{"analise": 2}'::jsonb)
  RETURNING id INTO v_plan;

  INSERT INTO public.subscriptions (org_id, plan_id, status)
  VALUES (v_org_b, v_plan, 'active')
  ON CONFLICT (org_id) DO UPDATE SET plan_id = EXCLUDED.plan_id;

  PERFORM pg_temp.check(public.check_org_quota(v_org_b, 'analise', 1), 'dentro do limite, a operação passa');

  INSERT INTO public.api_usage_logs (org_id, user_id, operation_type, model_used, quantity, unit)
  VALUES (v_org_b, '55555555-5555-5555-5555-555555555555', 'analise', 'teste', 1, 'analise'),
         (v_org_b, '55555555-5555-5555-5555-555555555555', 'analise', 'teste', 1, 'analise');

  PERFORM pg_temp.check(public.org_usage(v_org_b, 'analise') = 2, 'consumo acumulado pelo gatilho');
  PERFORM pg_temp.check(NOT public.check_org_quota(v_org_b, 'analise', 1), 'estourou o limite, a operação é barrada');

  -- O registro do gerador de argumentos, que antes era rejeitado em silêncio.
  INSERT INTO public.api_usage_logs (org_id, user_id, operation_type, model_used, quantity)
  VALUES (v_org_b, '55555555-5555-5555-5555-555555555555', 'generate_arguments', 'teste', 1);
  PERFORM pg_temp.check(public.org_usage(v_org_b, 'generate_arguments') = 1,
    'consumo do gerador de argumentos agora é aceito');
END
$$;

\echo ''
\echo '=== 11. Convite vincula o usuário à organização ==='

DO $$
DECLARE
  v_org_b UUID;
  v_token UUID;
  v_result UUID;
BEGIN
  SELECT id INTO v_org_b FROM public.organizations WHERE slug = 'empresa-b';

  INSERT INTO public.organization_invites (org_id, email, role)
  VALUES (v_org_b, 'estranho@fora.com', 'vendedor')
  RETURNING token INTO v_token;

  -- E-mail diferente do convite: precisa recusar.
  BEGIN
    PERFORM public.accept_invite(v_token, '99999999-9999-9999-9999-999999999999', 'outro@email.com');
    RAISE EXCEPTION 'FALHOU: convite aceito com e-mail diferente';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
    RAISE NOTICE '  ok  convite recusa e-mail diferente';
  END;

  v_result := public.accept_invite(v_token, '99999999-9999-9999-9999-999999999999', 'estranho@fora.com');
  PERFORM pg_temp.check(v_result = v_org_b, 'convite vincula à organização certa');

  PERFORM pg_temp.check(
    (SELECT org_id FROM public.profiles WHERE user_id = '99999999-9999-9999-9999-999999999999') = v_org_b,
    'perfil passa a pertencer à organização');

  PERFORM pg_temp.check(
    (SELECT role::text FROM public.user_roles WHERE user_id = '99999999-9999-9999-9999-999999999999') = 'vendedor',
    'papel do convite aplicado');

  -- Reuso do mesmo convite precisa falhar.
  BEGIN
    PERFORM public.accept_invite(v_token, '99999999-9999-9999-9999-999999999999', 'estranho@fora.com');
    RAISE EXCEPTION 'FALHOU: convite pôde ser reutilizado';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
    RAISE NOTICE '  ok  convite não pode ser reutilizado';
  END;
END
$$;

\echo ''
\echo '=== 12. Marca resolvida por host, sem listar clientes ==='

DO $$
DECLARE j JSONB;
BEGIN
  j := public.branding_for_host('empresa-b', NULL);
  PERFORM pg_temp.check(j ->> 'product_name' = 'Coach de Vendas', 'marca da empresa B resolvida pelo subdomínio');

  j := public.branding_for_host('nao-existe', NULL);
  PERFORM pg_temp.check(j IS NULL, 'host desconhecido não devolve dado de ninguém');
END
$$;

\echo ''
\echo '============================================================'
\echo ' ENSAIO CONCLUÍDO — todas as verificações passaram'
\echo '============================================================'
