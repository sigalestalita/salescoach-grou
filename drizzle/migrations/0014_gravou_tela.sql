-- Se a gravação da extensão trouxe a tela (vídeo) ou só o áudio.
-- null: não se sabe (reuniões antigas, arquivos enviados à mão).
alter table public.meetings add column if not exists gravou_tela boolean;