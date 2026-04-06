
DROP POLICY "api_logs_insert" ON public.api_usage_logs;
CREATE POLICY "api_logs_insert" ON public.api_usage_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
