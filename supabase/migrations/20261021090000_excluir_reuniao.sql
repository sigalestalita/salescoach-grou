-- Apagar uma agenda falhava com
--   update or delete on table "meetings" violates foreign key constraint
--   "api_usage_logs_meeting_id_fkey" on table "api_usage_logs"
-- porque api_usage_logs aponta para a reunião sem regra de exclusão.
--
-- Toda chave estrangeira para meetings sem regra de exclusão ganha uma:
--   * coluna que aceita nulo (registros de consumo e similares): SET NULL.
--     O consumo continua contando para a empresa, só perde o vínculo com a
--     reunião apagada.
--   * coluna obrigatória (dados da própria reunião): CASCADE, apagam junto.
-- Cobre também tabelas criadas fora das migrações deste repositório.

DO $$
DECLARE
  r record;
  nullable boolean;
  def text;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid, c.conkey, pg_get_constraintdef(c.oid) AS condef
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.meetings'::regclass
      AND c.confdeltype IN ('a', 'r')          -- NO ACTION / RESTRICT
  LOOP
    SELECT bool_and(NOT a.attnotnull) INTO nullable
    FROM pg_attribute a
    WHERE a.attrelid = r.conrelid AND a.attnum = ANY (r.conkey);

    def := regexp_replace(r.condef, '\s+ON DELETE\s+(NO ACTION|RESTRICT)', '', 'i')
        || CASE WHEN nullable THEN ' ON DELETE SET NULL' ELSE ' ON DELETE CASCADE' END;

    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.conrelid::regclass, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.conrelid::regclass, r.conname, def);
    RAISE NOTICE '% em %: %', r.conname, r.conrelid::regclass, def;
  END LOOP;
END $$;
