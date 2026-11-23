-- Roteiro de perguntas por tipo de reunião (ex.: as perguntas de um diagnóstico).
-- A extensão mostra a lista inteira durante a call, marca as que o vendedor já
-- fez e o coach ao vivo sugere a próxima na ordem. Uma pergunta por linha.
ALTER TABLE public.meeting_types ADD COLUMN IF NOT EXISTS roteiro TEXT;
COMMENT ON COLUMN public.meeting_types.roteiro IS 'Perguntas do roteiro deste tipo de reunião, uma por linha, na ordem.';
