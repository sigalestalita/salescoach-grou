-- ============================================================================
-- Novidades da plataforma e o e-mail semanal com elas.
--
-- product_updates: cada novidade. A IA rascunha (a partir das mudanças da
-- semana) e a administração da plataforma revisa e publica na tela
-- Plataforma. Publicada, aparece no Início e entra no próximo e-mail.
-- email_preferences: quem desligou o e-mail de novidades (link no rodapé).
-- email_sends: registro de cada envio, para nunca mandar em dobro.
-- Quem escreve é a função product-updates (service role).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.product_updates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  cta_label     TEXT,
  cta_path      TEXT,
  audience      TEXT[] NOT NULL DEFAULT ARRAY['admin', 'gestor', 'vendedor'],
  status        TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicado', 'arquivado')),
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ia')),
  published_at  TIMESTAMPTZ,
  emailed_at    TIMESTAMPTZ,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_updates_publicadas ON public.product_updates (published_at DESC) WHERE status = 'publicado';

ALTER TABLE public.product_updates ENABLE ROW LEVEL SECURITY;
-- Qualquer pessoa logada lê as publicadas (quadro Novidades do Início).
DROP POLICY IF EXISTS "product_updates_select" ON public.product_updates;
CREATE POLICY "product_updates_select" ON public.product_updates FOR SELECT TO authenticated
  USING (status = 'publicado');

CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  novidades   BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_preferences_select" ON public.email_preferences;
CREATE POLICY "email_preferences_select" ON public.email_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.email_sends (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  ref          TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'enviando' CHECK (status IN ('enviando', 'enviado', 'erro')),
  provider_id  TEXT,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, ref)
);
ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_sends FROM anon, authenticated;

-- Rascunhos das novidades destas semanas, para revisar e publicar.
INSERT INTO public.product_updates (title, body, cta_label, cta_path, audience, source)
SELECT * FROM (VALUES
  ('Início: o seu dia em uma tela',
   'Ao entrar, você vê as reuniões de hoje com o botão para entrar e gravar, o que está pendente (análise com erro, reunião com cliente que passou sem gravação) e o seu ritmo da semana. Todo dia tem uma dica escrita pela IA a partir das suas reuniões e dos materiais da sua empresa. Gestores também veem o time: quem está caindo no score, quem não grava e a melhor reunião da semana.',
   'Abrir o Início', '/', ARRAY['admin', 'gestor', 'vendedor'], 'ia'),
  ('Minha agenda dentro da plataforma',
   'Com a agenda do Google ou do Outlook conectada, a aba Minha agenda, em Agendas, mostra a sua semana: reuniões com cliente, as que foram gravadas (com o score) e as que passaram sem gravação. Clique numa reunião para entrar na chamada ou abrir a análise. Só você vê a sua agenda.',
   'Abrir Minha agenda', '/agendas?visao=agenda', ARRAY['admin', 'gestor', 'vendedor'], 'ia'),
  ('Gravação leve: apresente slides sem travar',
   'A extensão do Chrome agora grava só o áudio por padrão: a sua voz e a do cliente, que vem direto da chamada, mesmo com fone. Não pede para compartilhar a tela e quase não pesa no computador. Precisa do vídeo? Marque "Gravar também a tela" no cartão.',
   'Ver as dicas da extensão', '/extensao', ARRAY['admin', 'gestor', 'vendedor'], 'ia'),
  ('Links de gravação mais fáceis',
   'Em Nova Agenda, o link do Google Drive funciona em qualquer formato, e Dropbox e OneDrive também. Se o link não servir (YouTube, pasta, página), você vê na hora o que fazer.',
   'Abrir Agendas', '/agendas', ARRAY['admin', 'gestor'], 'ia')
) AS v(title, body, cta_label, cta_path, audience, source)
WHERE NOT EXISTS (SELECT 1 FROM public.product_updates);
