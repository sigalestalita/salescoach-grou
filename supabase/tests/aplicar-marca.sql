-- ============================================================================
-- PADRÕES DE IDENTIDADE VISUAL DA PLATAFORMA
--
-- Cole no SQL do backend e execute uma vez. Rodar de novo é inofensivo.
--
-- Organizações novas passam a nascer com a paleta do produto (navy #071A34 e
-- azul #15498D). Quem já escolheu cores próprias não é tocado.
-- ============================================================================

ALTER TABLE public.organization_branding ALTER COLUMN primary_hsl SET DEFAULT '214 74% 32%';
ALTER TABLE public.organization_branding ALTER COLUMN accent_hsl  SET DEFAULT '214 74% 45%';
ALTER TABLE public.organization_branding ALTER COLUMN sidebar_hsl SET DEFAULT '212 76% 12%';

UPDATE public.organization_branding
   SET primary_hsl = '214 74% 32%',
       accent_hsl  = '214 74% 45%',
       sidebar_hsl = '212 76% 12%'
 WHERE primary_hsl = '217 91% 60%'
   AND accent_hsl  = '199 89% 48%'
   AND sidebar_hsl = '222 47% 6%';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations') THEN
    EXECUTE 'INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING'
      USING '20260917090002';
  END IF;
END
$$;

SELECT o.name AS empresa, b.primary_hsl AS cor_principal, b.sidebar_hsl AS fundo_do_menu
FROM public.organization_branding b JOIN public.organizations o ON o.id = b.org_id
ORDER BY o.created_at;
