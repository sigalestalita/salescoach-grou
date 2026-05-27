GRANT SELECT, INSERT, DELETE ON public.transcription_segments TO authenticated;
GRANT ALL ON public.transcription_segments TO service_role;

GRANT SELECT, INSERT, DELETE ON public.live_tips TO authenticated;
GRANT ALL ON public.live_tips TO service_role;