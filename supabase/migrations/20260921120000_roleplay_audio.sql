-- Áudio do treino guardado, para rever a chamada dias depois.
--
-- Até aqui a conversa sobrevivia só como texto: o áudio existia enquanto a
-- aba estava aberta e sumia no reload. Agora cada fala aponta para um arquivo
-- no Storage, e a revisão do treino toca a ligação inteira junto da avaliação.

ALTER TABLE public.roleplay_messages
  ADD COLUMN IF NOT EXISTS audio_path TEXT;

-- Bucket privado: nada de URL pública. A escuta usa link assinado, gerado
-- na hora para quem tem acesso à sessão.
INSERT INTO storage.buckets (id, name, public)
VALUES ('roleplay-audio', 'roleplay-audio', false)
ON CONFLICT (id) DO NOTHING;

-- O caminho começa com o id de quem treinou: <user_id>/<session_id>/<arquivo>.
-- Assim a política é uma comparação simples, sem juntar tabelas no Storage.
DROP POLICY IF EXISTS "roleplay_audio_insert" ON storage.objects;
CREATE POLICY "roleplay_audio_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'roleplay-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "roleplay_audio_select" ON storage.objects;
CREATE POLICY "roleplay_audio_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'roleplay-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Apagar o próprio áudio: usado quando a pessoa refaz um treino.
DROP POLICY IF EXISTS "roleplay_audio_delete" ON storage.objects;
CREATE POLICY "roleplay_audio_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'roleplay-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
