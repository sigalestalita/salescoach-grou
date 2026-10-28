-- ============================================================================
-- Cópia do vídeo do robô para o Storage, em partes e retomável
-- (supabase/functions/_shared/copiaVideo.ts).
--
-- O webhook copiava o vídeo inteiro de uma vez; numa reunião longa a função
-- acabava antes e a reunião ficava só com o áudio temporário da Recall. Agora
-- cada chamada copia um trecho, anota aqui até onde chegou e passa a vez; o
-- agendador do meeting-bot retoma cópias paradas.
-- ============================================================================

ALTER TABLE public.meeting_bots
  ADD COLUMN IF NOT EXISTS copia_status TEXT
    CHECK (copia_status IN ('pendente', 'copiando', 'concluida', 'erro')),
  ADD COLUMN IF NOT EXISTS copia_offset BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS copia_tamanho BIGINT,
  ADD COLUMN IF NOT EXISTS copia_upload_url TEXT,
  ADD COLUMN IF NOT EXISTS copia_tentativas INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS copia_detalhe TEXT,
  -- Sinal de vida de quem está copiando, e a vez dele (uma cópia por vez).
  ADD COLUMN IF NOT EXISTS copia_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS copia_lease UUID;

CREATE INDEX IF NOT EXISTS meeting_bots_copia_aberta
  ON public.meeting_bots (updated_at) WHERE copia_status IN ('pendente', 'copiando');

-- Reuniões do robô dos últimos 7 dias (o tempo que a Recall guarda a gravação)
-- que ficaram sem o vídeo: o agendador busca o vídeo de novo, em partes.
UPDATE public.meeting_bots b
   SET copia_status = 'pendente'
  FROM public.meetings m
 WHERE m.id = b.meeting_id
   AND b.status = 'concluido'
   AND b.provider_bot_id IS NOT NULL
   AND b.copia_status IS NULL
   AND b.updated_at > now() - interval '7 days'
   AND m.file_url IS NULL;
