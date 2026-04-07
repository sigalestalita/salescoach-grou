
-- Update meetings SELECT policy: gestors see ALL meetings
DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
CREATE POLICY "meetings_select" ON public.meetings
  FOR SELECT TO authenticated
  USING (
    seller_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
  );

-- Update analysis_results SELECT policy
DROP POLICY IF EXISTS "analysis_select" ON public.analysis_results;
CREATE POLICY "analysis_select" ON public.analysis_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = analysis_results.meeting_id
        AND (m.seller_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );

-- Update highlights SELECT policy
DROP POLICY IF EXISTS "highlights_select" ON public.highlights;
CREATE POLICY "highlights_select" ON public.highlights
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = highlights.meeting_id
        AND (m.seller_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );

-- Update transcriptions SELECT policy
DROP POLICY IF EXISTS "transcriptions_select" ON public.transcriptions;
CREATE POLICY "transcriptions_select" ON public.transcriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = transcriptions.meeting_id
        AND (m.seller_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'gestor'::app_role))
    )
  );
