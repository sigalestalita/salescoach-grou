-- ============================================================================
-- MARCAR AS MIGRAÇÕES COMO JÁ APLICADAS
--
-- As migrações foram aplicadas pelo SQL editor, então o controle de versões do
-- Supabase não registrou nada. Sem isso, o deploy do código pode tentar
-- reaplicá-las e falhar (as tabelas já existem).
--
-- Este script só registra que elas já rodaram. Não altera schema nem dado, e
-- não faz nada se o controle de versões não existir nesta instalação.
-- Rodar duas vezes é inofensivo.
-- ============================================================================

DO $$
DECLARE
  v_versao TEXT;
  v_versoes TEXT[] := ARRAY[
    '20260914090001',
    '20260914090002',
    '20260914090003',
    '20260914090004',
    '20260914090005',
    '20260914090006',
    '20260914090007'
  ];
  v_registradas INT := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
  ) THEN
    RAISE NOTICE 'Controle de versões não encontrado; nada a marcar.';
    RETURN;
  END IF;

  FOREACH v_versao IN ARRAY v_versoes LOOP
    -- Insere apenas a coluna "version", que existe em todas as variantes da
    -- tabela. O ON CONFLICT sem alvo cobre qualquer restrição única.
    EXECUTE 'INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING'
      USING v_versao;
    v_registradas := v_registradas + 1;
  END LOOP;

  -- Relê para confirmar o que ficou registrado.
  EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version LIKE $1'
    INTO v_registradas USING '20260914%';

  RAISE NOTICE 'Migrações multi-tenant registradas como aplicadas: % de 7', v_registradas;
END
$$;
