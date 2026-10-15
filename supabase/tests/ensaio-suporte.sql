-- Ensaio do modo suporte (20261016090000_support_access.sql).
-- Rodar num banco de ensaio com as migrações e o seed da Base Viral aplicados
-- (ver ensaio.sh). Cria um operador numa empresa própria, entra na Base Viral,
-- lê, tenta escrever e sai. Cada linha "ok" deve sair verdadeira.
\set ON_ERROR_STOP 1
\pset tuples_only on

INSERT INTO auth.users (id, email) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'operador@ensaio.test') ON CONFLICT DO NOTHING;
INSERT INTO organizations (id, name, slug) VALUES ('aaaaaaaa-0000-0000-0000-0000000000aa', 'Operadora', 'operadora-ensaio') ON CONFLICT DO NOTHING;
INSERT INTO profiles (user_id, org_id, full_name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000aa', 'Operador')
  ON CONFLICT (user_id) DO UPDATE SET org_id = EXCLUDED.org_id;
INSERT INTO platform_admins (user_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
SELECT id AS bv FROM organizations WHERE slug = 'base-viral' \gset

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', false) IS NOT NULL;

SELECT 'ok fora do suporte não vê a Base Viral', (SELECT count(*) FROM meetings WHERE org_id = :'bv') = 0;
SELECT platform_support_enter(:'bv') IS NOT NULL;
SELECT 'ok vê as reuniões', (SELECT count(*) FROM meetings) > 0 AND (SELECT bool_and(org_id = :'bv') FROM meetings);
SELECT 'ok vê as análises', (SELECT count(*) FROM analysis_results) > 0;
SELECT 'ok é admin só da visitada', has_role(auth.uid(), 'admin') AND NOT has_role(auth.uid(), 'vendedor');

\set ON_ERROR_STOP 0
UPDATE meetings SET title = 'ensaio-suporte';
DELETE FROM meetings;
INSERT INTO meetings (org_id, seller_id, title) VALUES (:'bv', auth.uid(), 'ensaio-suporte');
UPDATE organizations SET name = 'ensaio-suporte';
UPDATE organization_branding SET product_name = 'ensaio-suporte';
\set ON_ERROR_STOP 1

SELECT platform_support_exit();
SELECT 'ok saiu', (SELECT count(*) FROM meetings WHERE org_id = :'bv') = 0;
RESET ROLE;

SELECT 'ok nenhuma escrita passou',
  NOT EXISTS (SELECT 1 FROM meetings WHERE title = 'ensaio-suporte')
  AND (SELECT count(*) FROM meetings WHERE org_id = :'bv') > 0
  AND NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'ensaio-suporte')
  AND NOT EXISTS (SELECT 1 FROM organization_branding WHERE product_name = 'ensaio-suporte');
SELECT 'ok auditoria', (SELECT count(*) FROM audit_log WHERE org_id = :'bv' AND action IN ('support.enter', 'support.exit')) >= 2;
