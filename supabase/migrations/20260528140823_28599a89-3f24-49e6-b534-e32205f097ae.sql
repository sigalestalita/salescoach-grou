ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS share_token uuid UNIQUE DEFAULT gen_random_uuid();
UPDATE public.meetings SET share_token = gen_random_uuid() WHERE share_token IS NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_share_token ON public.meetings(share_token);