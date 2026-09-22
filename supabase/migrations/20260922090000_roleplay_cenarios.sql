-- O treino deixa de ser só prospecção.
--
-- A operação atende em várias fases — primeira agenda, follow-up de proposta,
-- acompanhamento de cliente, expansão de carteira, reativação — e o treino
-- simulava sempre um lead novo. Pior: a avaliação cobrava o roteiro de
-- descoberta mesmo numa conversa com cliente antigo, onde perguntar orçamento
-- e decisor do zero é justamente o erro.
--
-- A fase escolhida fica na sessão: é ela que muda a persona, a conduta do
-- simulado e a régua da avaliação.

ALTER TABLE public.roleplay_sessions
  ADD COLUMN IF NOT EXISTS scenario TEXT;

-- Os treinos que já existem foram todos de primeira agenda.
UPDATE public.roleplay_sessions
   SET scenario = 'primeira_agenda'
 WHERE scenario IS NULL;

ALTER TABLE public.roleplay_sessions
  ALTER COLUMN scenario SET DEFAULT 'primeira_agenda';
