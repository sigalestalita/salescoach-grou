-- Allow meeting owners and admins to delete analysis data for re-analysis
CREATE POLICY "analysis_delete" ON public.analysis_results
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = analysis_results.meeting_id
    AND (m.seller_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "transcriptions_delete" ON public.transcriptions
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = transcriptions.meeting_id
    AND (m.seller_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "highlights_delete" ON public.highlights
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.id = highlights.meeting_id
    AND (m.seller_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));