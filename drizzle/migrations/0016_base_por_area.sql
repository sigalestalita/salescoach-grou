-- Base de conhecimento por área.
--
-- Com o coach de atendimento, a mesma base passou a servir vendas e CS: um
-- manual de suporte entrava na análise de uma reunião de venda, e o pitch
-- comercial na de um onboarding. Cada documento agora diz de qual área é.
-- 'ambos' (o padrão, e o que os documentos que já existem ficam) vale para
-- as duas.

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT 'ambos';

ALTER TABLE public.knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_area_check;
ALTER TABLE public.knowledge_documents ADD CONSTRAINT knowledge_documents_area_check
  CHECK (area IN ('ambos', 'vendas', 'atendimento'));

-- Prévia usada pelas funções de IA: com _area, só os documentos daquela área
-- e os marcados como 'ambos'; sem _area, todos (como antes).
DROP FUNCTION IF EXISTS public.knowledge_docs_preview(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.knowledge_docs_preview(_org_id UUID, _chars INTEGER DEFAULT 2000, _area TEXT DEFAULT NULL)
RETURNS TABLE (title TEXT, category TEXT, preview TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.title, d.category, left(d.extracted_content, greatest(0, least(_chars, 20000)))
  FROM public.knowledge_documents d
  WHERE d.org_id = _org_id AND d.extracted_content IS NOT NULL
    AND (_area IS NULL OR d.area IN (_area, 'ambos'))
  ORDER BY d.created_at
$$;

REVOKE EXECUTE ON FUNCTION public.knowledge_docs_preview(UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_docs_preview(UUID, INTEGER, TEXT) TO service_role;
