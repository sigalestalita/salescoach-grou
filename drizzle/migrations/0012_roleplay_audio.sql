ALTER TABLE public.roleplay_messages ADD COLUMN IF NOT EXISTS audio_path TEXT;
ALTER TABLE public.roleplay_sessions ADD COLUMN IF NOT EXISTS training_mode TEXT CHECK (training_mode IN ('texto', 'chamada'));
DROP POLICY IF EXISTS "roleplay_audio_insert" ON storage.objects;
CREATE POLICY "roleplay_audio_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'roleplay-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "roleplay_audio_select" ON storage.objects;
CREATE POLICY "roleplay_audio_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'roleplay-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "roleplay_audio_delete" ON storage.objects;
CREATE POLICY "roleplay_audio_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'roleplay-audio' AND (storage.foldername(name))[1] = auth.uid()::text);