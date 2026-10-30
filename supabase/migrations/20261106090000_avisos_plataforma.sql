-- Avisos automáticos aos operadores da plataforma (ex.: AssemblyAI sem crédito).
-- Uma linha por tipo de aviso guarda quando ele saiu por último, para o mesmo
-- aviso não chegar a cada reunião que falha. Só as funções (service role) usam.
CREATE TABLE IF NOT EXISTS public.avisos_plataforma (
  chave      TEXT PRIMARY KEY,
  enviado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  detalhe    TEXT
);
ALTER TABLE public.avisos_plataforma ENABLE ROW LEVEL SECURITY;
