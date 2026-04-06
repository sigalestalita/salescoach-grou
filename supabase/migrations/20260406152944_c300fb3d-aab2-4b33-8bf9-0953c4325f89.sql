INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-files', 'knowledge-files', false);

CREATE POLICY "knowledge_files_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'knowledge-files');

CREATE POLICY "knowledge_files_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'knowledge-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "knowledge_files_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'knowledge-files' AND public.has_role(auth.uid(), 'admin'));