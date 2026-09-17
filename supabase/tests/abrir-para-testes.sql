-- ============================================================================
-- ABRIR O PRODUTO PARA TESTES COM OUTRAS EMPRESAS
--
-- Cole no SQL do backend, ajuste o e-mail abaixo e execute uma vez.
--
-- Faz três coisas, todas seguras de repetir:
--   1. cadastra você como operadora da plataforma (libera o painel /plataforma)
--   2. cria o plano "Piloto", com limites de consumo por ciclo
--   3. registra a migração do plano no controle de versões
--
-- Não toca em reunião, usuário ou configuração de nenhuma empresa.
-- ============================================================================

DO $$
DECLARE
  -- ── Ajuste aqui ───────────────────────────────────────────────────────────
  v_email_operador TEXT := 'seu@email.com';   -- e-mail com que você entra no sistema
  -- ──────────────────────────────────────────────────────────────────────────

  v_user_id UUID;
BEGIN
  -- 1. Operadora da plataforma
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email_operador);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário com o e-mail %. Confira o valor de v_email_operador.', v_email_operador;
  END IF;

  INSERT INTO public.platform_admins (user_id, note)
  VALUES (v_user_id, 'operação da plataforma')
  ON CONFLICT (user_id) DO NOTHING;

  -- 2. Plano piloto
  INSERT INTO public.plans (key, name, description, price_cents, limits, features, is_public, sort_order)
  VALUES (
    'piloto',
    'Piloto',
    'Período de teste com limites de consumo. Sem cobrança.',
    0,
    '{"transcricao": 300, "analise": 60, "live_coach": 300, "generate_arguments": 100, "extracao_documento": 30}'::jsonb,
    '{"live_coach": true, "chrome_extension": true, "custom_domain": false, "api_access": false}'::jsonb,
    false,
    1
  )
  ON CONFLICT (key) DO NOTHING;

  -- 3. Controle de versões
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
  ) THEN
    EXECUTE 'INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING'
      USING '20260917090001';
  END IF;
END
$$;

-- Confira o resultado.
SELECT 'operadora'   AS item, u.email                       AS valor FROM public.platform_admins a JOIN auth.users u ON u.id = a.user_id
UNION ALL
SELECT 'plano piloto', name || ' · ' || limits::text          FROM public.plans WHERE key = 'piloto';
