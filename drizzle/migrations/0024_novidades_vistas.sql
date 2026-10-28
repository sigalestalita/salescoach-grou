-- ============================================================================
-- Janela "O que há de novo": cada novidade publicada aparece uma vez para
-- cada pessoa, na primeira vez que ela abre o Sales Coach depois da
-- publicação. Aqui fica quem já viu qual novidade (vale em qualquer
-- computador). A própria pessoa grava e lê só as linhas dela.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.product_update_views (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  update_id  UUID NOT NULL REFERENCES public.product_updates(id) ON DELETE CASCADE,
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, update_id)
);

CREATE INDEX IF NOT EXISTS product_update_views_update ON public.product_update_views (update_id);

ALTER TABLE public.product_update_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_update_views_select" ON public.product_update_views;
CREATE POLICY "product_update_views_select" ON public.product_update_views FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "product_update_views_insert" ON public.product_update_views;
CREATE POLICY "product_update_views_insert" ON public.product_update_views FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT ON public.product_update_views TO authenticated;
GRANT ALL ON public.product_update_views TO service_role;