-- Prévia da base de conhecimento para os prompts de IA.
--
-- fetchKnowledgeContext baixava o texto inteiro de todos os documentos para usar
-- só os 2.000 primeiros caracteres de cada um. Com documentos grandes isso
-- estourava memória/CPU da edge function (o treino não conseguia ser avaliado).
-- Aqui o corte acontece no banco. Só a service role chama.
CREATE OR REPLACE FUNCTION public.knowledge_docs_preview(_org_id UUID, _chars INTEGER DEFAULT 2000)
RETURNS TABLE (title TEXT, category TEXT, preview TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.title, d.category, left(d.extracted_content, greatest(0, least(_chars, 20000)))
  FROM public.knowledge_documents d
  WHERE d.org_id = _org_id AND d.extracted_content IS NOT NULL
  ORDER BY d.created_at
$$;
REVOKE EXECUTE ON FUNCTION public.knowledge_docs_preview(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_docs_preview(UUID, INTEGER) TO service_role;
