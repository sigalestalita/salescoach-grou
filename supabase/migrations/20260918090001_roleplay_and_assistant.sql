-- ============================================================================
-- Modo de treino (roleplay contra um lead simulado) e assistente de vendas
-- (chat em pop-up com acesso às agendas da organização).
--
-- Ambos são escritos exclusivamente pelas edge functions correspondentes
-- (roleplay-chat/roleplay-finish, sales-assistant-chat), com a service role.
-- O frontend só lê, pela RLS abaixo — igual ao padrão já usado em
-- transcription_segments e live_tips (escrita fechada, leitura por
-- pertencimento). Isso evita que qualquer cliente grave uma "reunião de
-- treino" marcada como concluída sem passar pela IA, ou injete mensagens no
-- histórico do assistente de outra pessoa.
-- ============================================================================

-- ── Métricas de consumo novas ────────────────────────────────────────────────

ALTER TABLE public.api_usage_logs DROP CONSTRAINT IF EXISTS api_usage_logs_operation_type_check;
ALTER TABLE public.api_usage_logs ADD CONSTRAINT api_usage_logs_operation_type_check
  CHECK (operation_type IN (
    'transcricao', 'analise', 'embedding', 'rag',
    'generate_arguments', 'live_transcricao', 'live_coach',
    'extracao_documento', 'storage', 'roleplay', 'assistant_chat'
  ));

-- Plano piloto ganha limites para as duas novidades; planos sem a chave
-- continuam ilimitados (comportamento padrão de check_org_quota).
UPDATE public.plans
SET limits = limits || '{"roleplay": 40, "assistant_chat": 200}'::jsonb
WHERE key = 'piloto';

-- ── Modo de treino ───────────────────────────────────────────────────────────

CREATE TABLE public.roleplay_sessions (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meeting_type  TEXT,                                    -- key de meeting_types, opcional
  focus_pain    TEXT,                                     -- label de pain_items escolhido para focar a objeção, opcional
  difficulty    TEXT NOT NULL DEFAULT 'media' CHECK (difficulty IN ('facil', 'media', 'dificil')),
  persona       JSONB NOT NULL,                            -- {name, role, company, temperament, notes}
  status        TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluida', 'abandonada')),
  turn_count    INTEGER NOT NULL DEFAULT 0,
  overall_score INTEGER,
  temperature   TEXT,
  feedback      JSONB,                                     -- mesma forma do raw_analysis de uma reunião real
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at      TIMESTAMP WITH TIME ZONE
);

CREATE TABLE public.roleplay_messages (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('lead', 'seller')),
  content    TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_roleplay_sessions_org_user ON public.roleplay_sessions (org_id, user_id, created_at DESC);
CREATE INDEX idx_roleplay_messages_session ON public.roleplay_messages (session_id, created_at);

CREATE TRIGGER trg_roleplay_sessions_updated_at
  BEFORE UPDATE ON public.roleplay_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.roleplay_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roleplay_messages ENABLE ROW LEVEL SECURITY;

-- Quem pratica vê a própria sessão; gestor e admin acompanham o time (mesmo
-- valor de coaching que já existe para reuniões reais).
CREATE POLICY "roleplay_sessions_select" ON public.roleplay_sessions FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  );

CREATE POLICY "roleplay_messages_select" ON public.roleplay_messages FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.roleplay_sessions s
      WHERE s.id = roleplay_messages.session_id
        AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
    )
  );

-- ── Assistente de vendas (chat em pop-up) ────────────────────────────────────
-- Ferramenta pessoal: só quem perguntou vê a conversa, mesmo sendo admin.

CREATE TABLE public.assistant_conversations (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id     UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.assistant_messages (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL DEFAULT public.current_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  meta            JSONB,                                   -- ferramentas usadas para responder, para transparência
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_assistant_conversations_org_user ON public.assistant_conversations (org_id, user_id, updated_at DESC);
CREATE INDEX idx_assistant_messages_conversation ON public.assistant_messages (conversation_id, created_at);

CREATE TRIGGER trg_assistant_conversations_updated_at
  BEFORE UPDATE ON public.assistant_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assistant_conversations_select" ON public.assistant_conversations FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND user_id = auth.uid());

CREATE POLICY "assistant_messages_select" ON public.assistant_messages FOR SELECT TO authenticated
  USING (
    org_id = public.current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = assistant_messages.conversation_id AND c.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.roleplay_sessions IS 'Sessão de treino: a IA representa um lead simulado a partir da metodologia e da base de conhecimento da organização.';
COMMENT ON TABLE public.assistant_conversations IS 'Conversa do assistente de vendas em pop-up. Uma por usuário em uso corrente; o histórico é pessoal.';
