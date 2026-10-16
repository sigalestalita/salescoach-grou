ALTER TABLE public.roleplay_sessions ADD COLUMN IF NOT EXISTS scenario TEXT;
UPDATE public.roleplay_sessions SET scenario = 'primeira_agenda' WHERE scenario IS NULL;
ALTER TABLE public.roleplay_sessions ALTER COLUMN scenario SET DEFAULT 'primeira_agenda';