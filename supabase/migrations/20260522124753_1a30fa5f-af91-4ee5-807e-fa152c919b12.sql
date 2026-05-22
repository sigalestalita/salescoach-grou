-- Live transcription segments
CREATE TABLE public.transcription_segments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id uuid NOT NULL,
  start_ms integer,
  end_ms integer,
  speaker text,
  text text NOT NULL,
  is_final boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transcription_segments_meeting ON public.transcription_segments(meeting_id, created_at);

ALTER TABLE public.transcription_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "segments_select" ON public.transcription_segments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = transcription_segments.meeting_id
  AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))));

CREATE POLICY "segments_insert" ON public.transcription_segments FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = transcription_segments.meeting_id
  AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE POLICY "segments_delete" ON public.transcription_segments FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = transcription_segments.meeting_id
  AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- Live coaching tips
CREATE TABLE public.live_tips (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id uuid NOT NULL,
  categoria text NOT NULL,
  urgencia text NOT NULL DEFAULT 'media',
  titulo text NOT NULL,
  acao text,
  fonte_kb_id uuid,
  emitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_live_tips_meeting ON public.live_tips(meeting_id, emitted_at DESC);

ALTER TABLE public.live_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tips_select" ON public.live_tips FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = live_tips.meeting_id
  AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))));

CREATE POLICY "tips_insert" ON public.live_tips FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = live_tips.meeting_id
  AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE POLICY "tips_delete" ON public.live_tips FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = live_tips.meeting_id
  AND (m.seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.transcription_segments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_tips;
ALTER TABLE public.transcription_segments REPLICA IDENTITY FULL;
ALTER TABLE public.live_tips REPLICA IDENTITY FULL;