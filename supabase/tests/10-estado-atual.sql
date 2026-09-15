-- ============================================================================
-- Simula o banco como ele está hoje em produção, ANTES das migrações novas.
--
-- Três usuários (admin, gestor, vendedor), um time, reuniões de tipos
-- diferentes com análise e transcrição, base de conhecimento, segmentos ao
-- vivo, arquivos no storage e links de compartilhamento já emitidos.
--
-- É contra este estado que o backfill precisa rodar sem perder nada.
-- ============================================================================

-- Os inserts em auth.users disparam o gatilho de cadastro, que hoje cria
-- perfil e papel de vendedor automaticamente.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@interno.com',    '{"full_name":"Ana Admin"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'gestor@interno.com',   '{"full_name":"Gabi Gestora"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'vendedor@interno.com', '{"full_name":"Vitor Vendedor"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'vendedor2@interno.com','{"full_name":"Val Vendedora"}'::jsonb);

UPDATE public.user_roles SET role = 'admin'  WHERE user_id = '11111111-1111-1111-1111-111111111111';
UPDATE public.user_roles SET role = 'gestor' WHERE user_id = '22222222-2222-2222-2222-222222222222';

-- Executivo virtual: perfil criado pelo admin para atribuir reuniões a quem não
-- tem login. As chaves estrangeiras para auth.users foram removidas em abril
-- justamente para permitir isso, então não existe usuário correspondente.
INSERT INTO public.profiles (user_id, full_name)
VALUES ('77777777-7777-7777-7777-777777777777', 'Executivo Virtual');

INSERT INTO public.teams (id, name, description)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Comercial', 'Time comercial');

UPDATE public.profiles SET team_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ── Reuniões ────────────────────────────────────────────────────────────────

INSERT INTO public.meetings
  (id, title, seller_id, lead_name, lead_company, team_id, status, meeting_type,
   file_url, overall_score, temperature, meeting_date)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Reunião com Cliente A',
   '33333333-3333-3333-3333-333333333333', 'Carlos', 'Cliente A',
   'aaaaaaaa-0000-0000-0000-000000000001', 'completo', 'empresa',
   '33333333-3333-3333-3333-333333333333/1700000000-reuniao-a.webm', 78, 'quente', now() - interval '10 days'),

  ('bbbbbbbb-0000-0000-0000-000000000002', 'Consultoria Cliente B',
   '44444444-4444-4444-4444-444444444444', 'Bruna', 'Cliente B',
   'aaaaaaaa-0000-0000-0000-000000000001', 'completo', 'consultoria',
   '44444444-4444-4444-4444-444444444444/1700000001-reuniao-b.webm', 55, 'morno', now() - interval '5 days'),

  ('bbbbbbbb-0000-0000-0000-000000000003', 'Follow-up Cliente A',
   '33333333-3333-3333-3333-333333333333', 'Carlos', 'Cliente A',
   'aaaaaaaa-0000-0000-0000-000000000001', 'enviado', 'empresa',
   NULL, NULL, NULL, now() - interval '1 day');

INSERT INTO public.transcriptions (meeting_id, full_text, language)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'Transcrição completa da reunião A.', 'pt-BR'),
       ('bbbbbbbb-0000-0000-0000-000000000002', 'Transcrição completa da reunião B.', 'pt-BR');

INSERT INTO public.analysis_results
  (meeting_id, overall_score, temperature, bant_score, meddic_score, spin_score, model_used)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 78, 'quente',
   '{"budget":{"score":25,"reason":"orçamento citado"},"authority":{"score":30,"reason":"decisor presente"},"need":{"score":23,"reason":"dor clara"}}'::jsonb,
   '{"metrics":{"score":12},"champion":{"score":14}}'::jsonb,
   '{"situacao":{"score":20},"problema":{"score":18}}'::jsonb,
   'google/gemini-2.5-flash'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 55, 'morno',
   '{"budget":{"score":10},"authority":{"score":20},"need":{"score":25}}'::jsonb,
   '{"metrics":{"score":8}}'::jsonb,
   '{"situacao":{"score":15}}'::jsonb,
   'google/gemini-2.5-flash');

INSERT INTO public.highlights (meeting_id, highlight_type, text, speaker)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'sinal_compra', 'Quero uma proposta.', 'lead'),
       ('bbbbbbbb-0000-0000-0000-000000000001', 'objecao', 'Está caro.', 'lead');

-- ── Base de conhecimento ────────────────────────────────────────────────────

INSERT INTO public.knowledge_documents (id, title, doc_type, category, extracted_content, uploaded_by, file_url)
VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'Portfólio de serviços', 'pdf', 'portfolio',
   'Conteúdo extraído do portfólio.', '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111/1700000002-portfolio.pdf'),
  ('cccccccc-0000-0000-0000-000000000002', 'Tabela de preços', 'texto', 'precos',
   'Conteúdo da tabela de preços.', '11111111-1111-1111-1111-111111111111', NULL);

INSERT INTO public.knowledge_items (name, item_type, description, category)
VALUES ('Licença anual', 'produto', 'Assinatura anual da ferramenta', 'produtos'),
       ('Treinamento de time', 'servico', 'Workshop presencial', 'servicos');

-- ── Ao vivo ─────────────────────────────────────────────────────────────────

INSERT INTO public.transcription_segments (meeting_id, text, is_final, speaker)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'Trecho ao vivo.', true, 'unknown');

INSERT INTO public.live_tips (meeting_id, categoria, urgencia, titulo, acao)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'SPIN', 'media', 'Pergunte sobre impacto', 'Explore a implicação da dor.');

-- ── Consumo já registrado ───────────────────────────────────────────────────

INSERT INTO public.api_usage_logs (user_id, meeting_id, model_used, operation_type, input_tokens, output_tokens, estimated_cost)
VALUES ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-0000-0000-0000-000000000001',
        'google/gemini-2.5-flash', 'analise', 12000, 3000, 0.012);

-- ── Arquivos no storage ─────────────────────────────────────────────────────

INSERT INTO storage.objects (bucket_id, name, owner)
VALUES
  ('meeting-files',   '33333333-3333-3333-3333-333333333333/1700000000-reuniao-a.webm', '33333333-3333-3333-3333-333333333333'),
  ('meeting-files',   '44444444-4444-4444-4444-444444444444/1700000001-reuniao-b.webm', '44444444-4444-4444-4444-444444444444'),
  ('knowledge-files', '11111111-1111-1111-1111-111111111111/1700000002-portfolio.pdf',  '11111111-1111-1111-1111-111111111111');
