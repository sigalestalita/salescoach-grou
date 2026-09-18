-- ============================================================================
-- AMBIENTE DE DEMONSTRAÇÃO: SALES ROCKET
--
-- Popula a organização "Sales Rocket" com dados fictícios em todas as
-- funcionalidades, para pitch e capturas de tela:
--
--   • empresa, plano piloto, marca e metodologia (BANT) ajustada ao negócio
--   • 2 times e 6 vendedores (perfis virtuais, sem login)
--   • catálogo de dores e tipos de oferta do gerador de argumentos
--   • base de conhecimento: 6 documentos e 8 itens (produtos, serviços, cases)
--   • ~50 reuniões em 6 meses, com análise, transcrição, destaques e dicas
--     ao vivo; algumas em processamento, uma com erro, duas compartilhadas
--   • consumo do plano no mês corrente
--
-- Cole no SQL do backend e execute. Pode rodar de novo: os registros têm ids
-- fixos e são substituídos. Se a organização não existir, ela é criada.
--
-- Sales Rocket (fictícia): plataforma de gestão para distribuidoras — ERP,
-- app de força de vendas e BI. Vende para distribuidoras e atacados.
-- ============================================================================

DO $$
DECLARE
  v_org    UUID;
  v_plan   UUID;
  v_team_in  UUID := 'e0000000-0000-4000-8000-000000000001';
  v_team_out UUID := 'e0000000-0000-4000-8000-000000000002';
  v_tpl    UUID;

  -- Ids fixos (prefixo por tipo + sequência) para o seed ser reexecutável.
  seller  UUID[] := ARRAY[
    'b0000000-0000-4000-8000-000000000001', -- Mariana Barbosa
    'b0000000-0000-4000-8000-000000000002', -- Fabrício Ferreira
    'b0000000-0000-4000-8000-000000000003', -- Taís Oliveira
    'b0000000-0000-4000-8000-000000000004', -- Lisiane Bento
    'b0000000-0000-4000-8000-000000000005', -- Rafael Nunes
    'b0000000-0000-4000-8000-000000000006'  -- Camila Duarte
  ]::UUID[];
  seller_name  TEXT[] := ARRAY['Mariana Barbosa','Fabrício Ferreira','Taís Oliveira','Lisiane Bento','Rafael Nunes','Camila Duarte'];
  seller_first TEXT[] := ARRAY['Mariana','Fabrício','Taís','Lisiane','Rafael','Camila'];
  -- Nível de cada vendedor (média de score) e quanto evolui por mês.
  seller_base  NUMERIC[] := ARRAY[82, 76, 72, 58, 66, 70];
  seller_trend NUMERIC[] := ARRAY[1.2, 1.0, 1.8, 2.6, 1.4, 2.2];

  companies TEXT[] := ARRAY['Distribuidora Aliança','Atacado Norte','Grupo Serrano','Casa do Construtor','Bebidas Premium Sul','Farmadistrib','Cooperativa Vale Verde','Atacadão Horizonte','Distribuidora Santa Clara','Rede Bom Preço','Frigorífico Pampa','Agro Cerrado','Papelaria Central','Elétrica Luz Forte','Pet Center Distribuição','Hortifruti Serra','Tintas Colorart','Auto Peças Ribeiro','Cosméticos Belle','Alimentos Dona Rosa','Distribuidora Litoral','Materiais Pedra Grande','Suprimentos Office Max','Bebidas Cristal','Laticínios Campo Bom','Ferragens Silva','Embalagens Nova Era','Química Industrial Sul','Móveis Planalto','Distribuidora Mineira'];
  leads     TEXT[] := ARRAY['Ricardo Almeida','Patrícia Gomes','João Henrique','Fernanda Castro','Marcos Vinícius','Luciana Prado','André Teixeira','Simone Rocha','Eduardo Lima','Beatriz Moraes','Cláudio Santos','Renata Fonseca','Gustavo Pires','Vanessa Carvalho','Paulo Sérgio','Aline Ribeiro','Rodrigo Martins','Juliana Neves','Sérgio Batista','Carla Mendes','Thiago Lopes','Daniela Souza','Márcio Azevedo','Priscila Cunha','Leandro Farias','Tatiane Melo','Bruno Cardoso','Elaine Barros','Felipe Antunes','Roberta Dias'];
  mtypes    TEXT[] := ARRAY['descoberta','apresentacao','negociacao','follow_up'];
  mtype_lbl TEXT[] := ARRAY['Descoberta','Demo','Negociação','Follow-up'];

  -- Pools de justificativas por critério (atendido / não atendido).
  r_budget_ok  TEXT[] := ARRAY['O lead confirmou verba aprovada para o projeto neste semestre.','Orçamento citado espontaneamente: "temos até 4 mil por mês para isso".','Comparou com o que paga hoje no sistema atual e sinalizou que cabe no mesmo valor.'];
  r_budget_no  TEXT[] := ARRAY['Orçamento não foi abordado em nenhum momento da conversa.','O lead disse que "precisa ver com o financeiro", sem valor ou prazo.','Vendedor não perguntou sobre verba; ficou implícito e sem confirmação.'];
  r_auth_ok    TEXT[] := ARRAY['O diretor comercial participou e se colocou como decisor.','Lead afirmou que aprova sozinho contratos até esse valor.','Sócio-proprietário presente na reunião.'];
  r_auth_no    TEXT[] := ARRAY['Interlocutor é analista; o decisor não foi identificado.','O lead vai "levar para o gerente", sem data para essa conversa.','Não ficou claro quem assina; vendedor não perguntou sobre o processo de decisão.'];
  r_need_ok    TEXT[] := ARRAY['Dor clara: pedidos digitados à mão geram erro de faturamento toda semana.','Lead quantificou a perda: cerca de 6% de ruptura de estoque por mês.','Vendedor externo sem visibilidade do estoque — dor citada três vezes.'];
  r_need_no    TEXT[] := ARRAY['Necessidade genérica ("melhorar a gestão"), sem dor específica.','Lead ainda não reconhece problema; a conversa ficou em curiosidade.','Dor mencionada, mas não explorada nem quantificada pelo vendedor.'];
  r_time_ok    TEXT[] := ARRAY['Quer implantar antes do pico de vendas de dezembro.','Contrato atual vence em 60 dias; decisão até o fim do mês.','Definiu a próxima reunião com o financeiro para a semana que vem.'];
  r_time_no    TEXT[] := ARRAY['Sem prazo definido; "quando der" foi a resposta.','Timeline não foi perguntada.','Lead está em fase de estudo, sem data para decidir.'];

  h_obj  TEXT[] := ARRAY['A gente já testou uma ferramenta assim e o time não usou.','Está caro comparado ao que pagamos hoje.','Nosso ERP atual já faz isso, só não do jeito certo.','Meu vendedor mais velho não vai mexer em aplicativo.','Não temos ninguém de TI para implantar.','Preciso ver com meu sócio antes de qualquer coisa.'];
  h_buy  TEXT[] := ARRAY['Manda a proposta ainda essa semana.','Quanto tempo leva para implantar? Queria antes de dezembro.','Consegue incluir o treinamento do time no valor?','Posso trazer o financeiro na próxima conversa?','Se integrar com o fiscal, para mim está resolvido.','Vamos começar com o time de São Paulo e depois expandir.'];
  h_key  TEXT[] := ARRAY['Lead revelou que perde cerca de 6% de faturamento com ruptura de estoque.','Diretor admitiu que o fechamento contábil leva 12 dias.','Vendedor conectou a dor de comissionamento ao módulo de força de vendas.','Cliente mostrou a planilha que usa hoje para controlar pedidos.','Lead comparou com concorrente e reconheceu que a integração fiscal é diferencial.','Vendedor quantificou o ROI em 4 meses com os números do próprio lead.'];

  pos_pool TEXT[] := ARRAY['Abertura com contexto do setor, sem discurso genérico.','Perguntas abertas sobre operação e ruptura de estoque.','Usou o case da Distribuidora Aliança no momento certo.','Quantificou a dor com os números do próprio lead.','Fechou com próximo passo e data.','Tratou a objeção de preço com ROI, não com desconto.','Apresentou apenas os módulos ligados à dor citada.','Deu espaço para o lead falar (bom talk ratio).'];
  imp_pool TEXT[] := ARRAY['Não perguntou sobre orçamento.','Falou mais que o lead na primeira metade da reunião.','Apresentou o BI antes de entender a operação.','Não identificou quem assina o contrato.','Deixou a objeção "o time não usou" sem resposta.','Não citou o onboarding assistido, que resolvia o medo de adoção.','Sem prazo acordado para o próximo passo.','Não explorou o cross-sell do módulo fiscal.'];
  km_pool  TEXT[] := ARRAY['Lead descreveu a rotina de digitar pedidos à noite.','Momento em que o lead pediu a proposta.','Comparação com o sistema atual.','Discussão sobre o prazo de implantação.','Lead trouxe o gerente financeiro para a chamada.'];
  next_pool TEXT[] := ARRAY['Enviar proposta com onboarding assistido incluído.','Agendar demo do app de força de vendas com dois vendedores do lead.','Confirmar orçamento e decisor na próxima reunião.','Mandar o case da Cooperativa Vale Verde por WhatsApp.','Marcar conversa com o financeiro para a semana que vem.','Enviar planilha de ROI com os números da reunião.'];
  sug_pool  TEXT[] := ARRAY['Perguntar sobre orçamento logo após quantificar a dor.','Trazer o decisor para a segunda reunião.','Usar a integração fiscal como diferencial frente ao concorrente.','Reduzir o tempo de apresentação e aumentar perguntas.','Responder objeção de adoção com o onboarding assistido.'];
  scr_pool  TEXT[] := ARRAY['"Se a ruptura cair de 6% para 2%, quanto isso representa por mês para vocês?"','"Quem mais precisa estar na conversa para a decisão sair?"','"O que fez o time parar de usar a ferramenta anterior: era complexo ou não mostrava resultado?"','"Se implantarmos em outubro, vocês chegam em dezembro com o app rodando. Faz sentido esse prazo?"'];

  -- Fala de transcrição (pools por fase). %L = lead, %C = empresa, %V = vendedor.
  t_open TEXT[] := ARRAY['%V: Oi, %L, tudo bem? Obrigada pelo tempo. Antes de mostrar qualquer coisa, queria entender como funciona a operação da %C hoje.','%V: %L, bom te ver. Vi que a %C atende mais de 400 pontos de venda — como o pedido chega hoje do vendedor externo até o faturamento?','%V: Olá, %L. Para aproveitar bem os 40 minutos: me conta como está a rotina de pedidos e estoque na %C.'];
  t_disc TEXT[] := ARRAY['%L: Hoje o vendedor anota no papel ou manda por WhatsApp e alguém digita no sistema à noite. Dá erro toda semana.','%L: A gente tem uns 6% de ruptura de estoque por mês. O vendedor vende o que não tem e depois a gente cancela.','%L: O fechamento contábil leva 12 dias porque o fiscal não conversa com o comercial.','%L: Meu maior problema é não saber o que o vendedor externo está fazendo. Eu só vejo no fim do mês.','%V: E quanto isso custa para vocês? Se tivesse que colocar um número na ruptura, qual seria?','%L: Fácil uns 80 mil por mês entre cancelamento e devolução.','%V: Quem mais sente essa dor além de você — o financeiro, o gerente de logística?','%L: O financeiro reclama todo mês. A diretoria pediu para eu resolver isso até o fim do ano.'];
  t_pres TEXT[] := ARRAY['%V: Então vou te mostrar só duas coisas: o app de força de vendas, que trava a venda sem estoque, e a integração fiscal, que fecha o mês sozinha.','%V: O caso da Distribuidora Aliança é parecido: eles saíram de 7% de ruptura para 1,8% em quatro meses.','%L: E o vendedor que não gosta de aplicativo? Meu pessoal mais antigo resiste.','%V: Por isso o onboarding assistido: a gente acompanha os primeiros 30 dias com o time em campo.','%L: A gente já testou uma ferramenta assim e o time não usou. Tenho medo de pagar de novo por algo que fica parado.','%V: O que fez o time parar: era complexo ou não mostrava resultado? Pergunto porque isso muda o que eu recomendo.','%L: Era complexo. Precisava de treinamento para tudo.'];
  t_close TEXT[] := ARRAY['%L: Manda a proposta ainda essa semana. Quero apresentar para o diretor na segunda.','%V: Combinado. Envio amanhã com o onboarding incluído e já sugiro a data com o financeiro.','%L: Quanto tempo leva para implantar? Queria antes de dezembro.','%V: Seis semanas. Se assinarmos até o fim do mês, dezembro está garantido.','%L: Preciso ver com meu sócio antes de qualquer coisa.','%V: Perfeito. Posso montar um resumo de uma página para você levar para ele?','%L: Vamos começar com o time de São Paulo e depois expandir.','%V: Então o próximo passo é a demo com dois vendedores seus na quinta. Fechado?'];

  i INT; j INT; n INT; k INT;
  m_id UUID; a_id UUID;
  s_idx INT; c_idx INT; l_idx INT; t_idx INT;
  m_date TIMESTAMPTZ;
  base NUMERIC; months NUMERIC;
  sb INT; sa INT; sn INT; st INT; attended INT; overall INT;
  temp TEXT; temp_reason TEXT;
  talk_seller INT;
  dur INT;
  lead_first TEXT; seller_first_n TEXT;
  txt TEXT; line TEXT;
  bant JSONB; meddic JSONB; spin JSONB; ins JSONB; coach JSONB; rag JSONB; metrics JSONB; raw JSONB;
  hero_scores INT[][] := ARRAY[
    -- budget, authority, need, timeline
    ARRAY[19,23,22,10],  -- 1 Aliança · descoberta · quente 74-78
    ARRAY[24,24,23,20],  -- 2 Atacado Norte · demo · muito quente 91
    ARRAY[9,20,21,8],    -- 3 Serrano · negociação · morno 58-62
    ARRAY[6,8,17,6],     -- 4 Casa do Construtor · descoberta · frio 37-41
    ARRAY[18,21,20,16],  -- 5 Bebidas Premium Sul · follow-up · muito quente 75
    ARRAY[12,22,21,9],   -- 6 Farmadistrib · descoberta · morno 64
    ARRAY[22,23,24,19],  -- 7 Vale Verde · demo · muito quente 88
    ARRAY[24,24,23,22]   -- 8 Aliança 2 · negociação · muito quente 93
  ];
  hero_overall INT[] := ARRAY[78, 91, 61, 41, 75, 66, 88, 93];
  hero_seller  INT[] := ARRAY[1, 2, 3, 4, 5, 6, 1, 1];
  hero_type    INT[] := ARRAY[1, 2, 3, 1, 4, 1, 2, 3];
  hero_company TEXT[] := ARRAY['Distribuidora Aliança','Atacado Norte','Grupo Serrano','Casa do Construtor','Bebidas Premium Sul','Farmadistrib','Cooperativa Vale Verde','Distribuidora Aliança'];
  hero_lead    TEXT[] := ARRAY['Ricardo Almeida','Patrícia Gomes','João Henrique','Fernanda Castro','Marcos Vinícius','Luciana Prado','André Teixeira','Ricardo Almeida'];
  hero_days_ago INT[] := ARRAY[9, 6, 14, 21, 4, 11, 2, 1];
  hero_dur     INT[] := ARRAY[1680, 1980, 1440, 1140, 900, 1560, 2040, 1260];
BEGIN
  PERFORM setseed(0.42);

  -- ── Organização ──────────────────────────────────────────────────────────
  SELECT id INTO v_org FROM public.organizations WHERE slug = 'sales-rocket' OR lower(name) = 'sales rocket' LIMIT 1;
  IF v_org IS NULL THEN
    v_org := public.provision_organization('Sales Rocket', 'sales-rocket', 'piloto', 'Sales Coach');
  END IF;
  UPDATE public.organizations SET status = 'active', name = 'Sales Rocket' WHERE id = v_org;

  SELECT id INTO v_plan FROM public.plans WHERE key = 'piloto';
  IF v_plan IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE org_id = v_org) THEN
    INSERT INTO public.subscriptions (org_id, plan_id, status, trial_ends_at) VALUES (v_org, v_plan, 'trialing', now() + interval '14 days');
  END IF;

  UPDATE public.organization_branding SET
    product_name = 'Sales Coach',
    login_headline = 'Sales Rocket',
    login_subheadline = 'Cada reunião do time, analisada pela nossa metodologia.',
    support_email = 'suporte@salesrocket.com.br'
  WHERE org_id = v_org;

  UPDATE public.org_settings SET
    argument_audiences = '[{"key":"dono","label":"donos e sócios de distribuidoras"},{"key":"comercial","label":"diretores e gerentes comerciais"},{"key":"financeiro","label":"gerentes financeiros e controllers"},{"key":"operacao","label":"gerentes de logística e operação"}]'::jsonb,
    argument_context_fields = '[{"key":"segment","label":"Segmento da distribuidora"},{"key":"companySize","label":"Vendedores externos","suffix":"vendedores"},{"key":"saleType","label":"Sistema atual"},{"key":"estimatedTicket","label":"Faturamento mensal estimado"}]'::jsonb,
    sharing_enabled = true, share_default_ttl_days = 7
  WHERE org_id = v_org;

  -- Tipos de reunião (caso a organização exista sem eles)
  FOR i IN 1..4 LOOP
    IF NOT EXISTS (SELECT 1 FROM public.meeting_types WHERE org_id = v_org AND key = mtypes[i]) THEN
      INSERT INTO public.meeting_types (org_id, key, label, sort_order) VALUES (v_org, mtypes[i], mtype_lbl[i], i);
    END IF;
  END LOOP;
  UPDATE public.meeting_types SET prompt_context = CASE key
    WHEN 'descoberta'   THEN 'Primeira conversa. O objetivo é mapear a operação de pedidos, estoque e faturamento e identificar o decisor. Não é esperado falar de preço.'
    WHEN 'apresentacao' THEN 'Demonstração do Rocket ERP e do app de força de vendas. Avalie se a demo foi guiada pelas dores levantadas e se o vendedor evitou mostrar módulos irrelevantes.'
    WHEN 'negociacao'   THEN 'Discussão de proposta. Avalie tratamento de objeções de preço e adoção, uso do ROI e definição de prazo de implantação.'
    WHEN 'follow_up'    THEN 'Retomada. Avalie se o vendedor recuperou o contexto, tratou pendências e avançou o próximo passo.'
    ELSE prompt_context END
  WHERE org_id = v_org;

  -- Metodologia (BANT) ajustada ao negócio
  SELECT id INTO v_tpl FROM public.analysis_templates WHERE org_id = v_org AND is_default LIMIT 1;
  IF v_tpl IS NULL THEN
    INSERT INTO public.analysis_templates (org_id, name, is_default, persona, methodology_key, methodology_label, qualification_criteria, temperature_levels, frameworks)
    VALUES (v_org, 'Metodologia Sales Rocket', true, 'Você é um especialista em vendas B2B.', 'BANT', 'BANT',
      '[{"key":"budget","label":"Budget","description":"Orçamento disponível e confirmado","max_score":25},{"key":"authority","label":"Authority","description":"Acesso ao decisor econômico","max_score":25},{"key":"need","label":"Need","description":"Dor reconhecida e priorizada","max_score":25},{"key":"timeline","label":"Timeline","description":"Janela de decisão definida","max_score":25}]'::jsonb,
      '[{"key":"congelado","label":"Congelado","criteria":"Nenhum critério atendido. Sem perfil para o negócio."},{"key":"frio","label":"Frio","criteria":"1 critério atendido. Precisa de nutrição."},{"key":"morno","label":"Morno","criteria":"2 critérios atendidos. Necessidade identificada, qualificação incompleta."},{"key":"quente","label":"Quente","criteria":"3 critérios atendidos. Oportunidade real com alguma ressalva."},{"key":"muito_quente","label":"Muito quente","criteria":"Todos os critérios atendidos e próximo passo acordado."}]'::jsonb,
      '{"meddic": true, "spin": true, "talk_ratio": true}'::jsonb)
    RETURNING id INTO v_tpl;
  END IF;
  UPDATE public.analysis_templates SET
    name = 'Metodologia Sales Rocket',
    persona = 'Você é o head comercial da Sales Rocket, plataforma de gestão para distribuidoras (ERP, app de força de vendas e BI). Avalia reuniões de venda B2B com distribuidoras e atacados, com foco em ruptura de estoque, pedidos manuais, integração fiscal e adoção pelo vendedor externo.',
    extra_instructions = 'Considere "orçamento confirmado" apenas quando o lead citar valor ou faixa. Objeção de adoção ("o time não usou") deve ser respondida com o onboarding assistido. Cross-sell prioritário: integração fiscal e Rocket BI.'
  WHERE id = v_tpl;

  -- ── Times e vendedores ───────────────────────────────────────────────────
  INSERT INTO public.teams (id, org_id, name, description) VALUES
    (v_team_in,  v_org, 'Time Inbound',  'Leads que chegam pelo site e por indicação'),
    (v_team_out, v_org, 'Time Outbound', 'Prospecção ativa em distribuidoras de médio porte')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, org_id = EXCLUDED.org_id;

  FOR i IN 1..6 LOOP
    INSERT INTO public.profiles (user_id, org_id, full_name, team_id)
    VALUES (seller[i], v_org, seller_name[i], CASE WHEN i IN (1,3,5) THEN v_team_in ELSE v_team_out END)
    ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, team_id = EXCLUDED.team_id, org_id = EXCLUDED.org_id;
  END LOOP;

  -- ── Catálogo de dores e ofertas (gerador de argumentos) ─────────────────
  DELETE FROM public.pain_items WHERE org_id = v_org;
  DELETE FROM public.pain_categories WHERE org_id = v_org;
  INSERT INTO public.pain_categories (id, org_id, label, icon, sort_order) VALUES
    ('f0000000-0000-4000-8000-000000000001', v_org, 'Operação e estoque', 'package', 1),
    ('f0000000-0000-4000-8000-000000000002', v_org, 'Força de vendas', 'users', 2),
    ('f0000000-0000-4000-8000-000000000003', v_org, 'Financeiro e fiscal', 'calculator', 3),
    ('f0000000-0000-4000-8000-000000000004', v_org, 'Gestão e dados', 'bar-chart', 4);
  INSERT INTO public.pain_items (org_id, category_id, label, sort_order) VALUES
    (v_org, 'f0000000-0000-4000-8000-000000000001', 'Ruptura de estoque: vende o que não tem', 1),
    (v_org, 'f0000000-0000-4000-8000-000000000001', 'Pedidos digitados à mão, com erro', 2),
    (v_org, 'f0000000-0000-4000-8000-000000000001', 'Devoluções e cancelamentos frequentes', 3),
    (v_org, 'f0000000-0000-4000-8000-000000000001', 'Separação e entrega sem roteirização', 4),
    (v_org, 'f0000000-0000-4000-8000-000000000002', 'Vendedor externo sem visibilidade de estoque e preço', 1),
    (v_org, 'f0000000-0000-4000-8000-000000000002', 'Gestor só enxerga o resultado no fim do mês', 2),
    (v_org, 'f0000000-0000-4000-8000-000000000002', 'Comissionamento calculado em planilha', 3),
    (v_org, 'f0000000-0000-4000-8000-000000000002', 'Baixa adoção de ferramentas pelo time', 4),
    (v_org, 'f0000000-0000-4000-8000-000000000003', 'Fechamento contábil demorado', 1),
    (v_org, 'f0000000-0000-4000-8000-000000000003', 'Emissão fiscal separada do comercial', 2),
    (v_org, 'f0000000-0000-4000-8000-000000000003', 'Inadimplência sem controle por cliente', 3),
    (v_org, 'f0000000-0000-4000-8000-000000000004', 'Decisão no achismo, sem indicadores', 1),
    (v_org, 'f0000000-0000-4000-8000-000000000004', 'Relatórios montados à mão toda semana', 2),
    (v_org, 'f0000000-0000-4000-8000-000000000004', 'Sistema legado sem integrações', 3);

  DELETE FROM public.offer_types WHERE org_id = v_org;
  INSERT INTO public.offer_types (org_id, key, label, allows_item_selection, instructions, sort_order) VALUES
    (v_org, 'proposta',  'Proposta comercial', true,  'Estruture em: contexto do cliente, dores levantadas, módulos recomendados, plano de implantação em 6 semanas e investimento. Tom consultivo.', 1),
    (v_org, 'roi',       'Argumento de ROI', true,  'Monte o cálculo com os números citados pelo lead (ruptura, devolução, horas de digitação). Mostre payback em meses.', 2),
    (v_org, 'objecao',   'Resposta a objeção', false, 'Responda a objeção com pergunta de devolução, evidência (case) e próximo passo. Máximo de 5 linhas.', 3),
    (v_org, 'whatsapp',  'Mensagem de WhatsApp', true,  'Até 4 linhas, sem formalidade excessiva, com um único pedido claro ao final.', 4),
    (v_org, 'email',     'E-mail de follow-up', true,  'Assunto + 3 parágrafos curtos: o que foi combinado, o que resolve a dor principal, próximo passo com data.', 5);

  -- ── Base de conhecimento ─────────────────────────────────────────────────
  DELETE FROM public.knowledge_documents WHERE org_id = v_org AND id::text LIKE 'c0000000-%';
  INSERT INTO public.knowledge_documents (id, org_id, title, doc_type, category, extracted_content) VALUES
    ('c0000000-0000-4000-8000-000000000001', v_org, 'Portfólio Sales Rocket 2026', 'pdf', 'Produtos',
     E'ROCKET ERP — gestão completa para distribuidoras: compras, estoque por lote e validade, faturamento, financeiro e fiscal. Implantação em 6 semanas com onboarding assistido.\n\nROCKET FORÇA DE VENDAS — app para o vendedor externo (Android/iOS, funciona offline): catálogo com estoque e preço em tempo real, bloqueio de venda sem estoque, pedido enviado direto para o faturamento, metas e comissão na tela.\n\nROCKET BI — painéis de ruptura, positivação, mix por cliente, inadimplência e desempenho por vendedor. Alertas por WhatsApp.\n\nINTEGRAÇÃO FISCAL — emissão de NF-e/NFC-e integrada ao pedido, SPED e fechamento contábil automatizado.\n\nONBOARDING ASSISTIDO — 30 dias com consultor acompanhando o time em campo. Incluído nos planos Growth e Enterprise.'),
    ('c0000000-0000-4000-8000-000000000002', v_org, 'Tabela de preços e planos', 'doc', 'Comercial',
     E'PLANO START — até 5 vendedores externos: R$ 1.490/mês. ERP + app de força de vendas.\nPLANO GROWTH — até 20 vendedores: R$ 3.900/mês. Inclui Rocket BI, integração fiscal e onboarding assistido.\nPLANO ENTERPRISE — acima de 20 vendedores: sob consulta. SLA, integrações dedicadas, gerente de conta.\n\nImplantação: R$ 4.500 (isenta em contrato anual). Desconto máximo autorizado sem aprovação do diretor: 10%.'),
    ('c0000000-0000-4000-8000-000000000003', v_org, 'Case: Distribuidora Aliança', 'pdf', 'Cases',
     E'Distribuidora de alimentos, 18 vendedores externos, 1.200 pontos de venda. Problema: 7% de ruptura de estoque e pedidos digitados à noite. Após 4 meses com Rocket Força de Vendas + ERP: ruptura em 1,8%, devoluções -62%, fechamento contábil de 12 para 3 dias. Payback em 4 meses. Depoimento do diretor comercial disponível em vídeo.'),
    ('c0000000-0000-4000-8000-000000000004', v_org, 'Case: Cooperativa Vale Verde', 'pdf', 'Cases',
     E'Cooperativa agrícola com 9 vendedores e resistência a tecnologia. Onboarding assistido em campo durante 30 dias; adoção de 100% do time em 6 semanas. Positivação de clientes +23% no primeiro trimestre.'),
    ('c0000000-0000-4000-8000-000000000005', v_org, 'Matriz de objeções', 'text', 'Comercial',
     E'"JÁ TESTAMOS E O TIME NÃO USOU" → perguntar o que fez parar (complexidade ou falta de resultado); apresentar onboarding assistido e o case Vale Verde.\n"ESTÁ CARO" → não dar desconto; calcular ROI com a ruptura e as devoluções citadas pelo lead; comparar com o custo de um digitador.\n"NOSSO ERP JÁ FAZ ISSO" → perguntar se o vendedor externo vê estoque em tempo real; diferencial é o app integrado, não o ERP.\n"NÃO TEMOS TI" → implantação é feita pela Sales Rocket; não exige TI interna.\n"PRECISO VER COM MEU SÓCIO" → oferecer resumo de uma página e propor reunião com o sócio presente.'),
    ('c0000000-0000-4000-8000-000000000006', v_org, 'Comparativo com concorrentes', 'link', 'Comercial',
     E'Frente a ERPs genéricos: único com app de força de vendas nativo, offline e com bloqueio de venda sem estoque. Frente a apps de pedido isolados: integração fiscal e financeira no mesmo sistema. Ponto fraco a evitar: não temos módulo de roteirização de entregas (parceiro homologado).');
  UPDATE public.knowledge_documents SET file_url = 'https://salesrocket.com.br/comparativo' WHERE id = 'c0000000-0000-4000-8000-000000000006';

  DELETE FROM public.knowledge_items WHERE org_id = v_org AND id::text LIKE 'd0000000-%';
  INSERT INTO public.knowledge_items (id, org_id, name, item_type, category, description) VALUES
    ('d0000000-0000-4000-8000-000000000001', v_org, 'Rocket ERP', 'produto', 'Plataforma', 'Gestão completa para distribuidoras: compras, estoque por lote, faturamento, financeiro e fiscal.'),
    ('d0000000-0000-4000-8000-000000000002', v_org, 'Rocket Força de Vendas', 'produto', 'Plataforma', 'App do vendedor externo com estoque e preço em tempo real, funciona offline e bloqueia venda sem estoque.'),
    ('d0000000-0000-4000-8000-000000000003', v_org, 'Rocket BI', 'produto', 'Plataforma', 'Painéis de ruptura, positivação, mix e desempenho por vendedor, com alertas por WhatsApp.'),
    ('d0000000-0000-4000-8000-000000000004', v_org, 'Integração fiscal', 'produto', 'Módulo', 'NF-e integrada ao pedido, SPED e fechamento contábil automatizado.'),
    ('d0000000-0000-4000-8000-000000000005', v_org, 'Onboarding assistido', 'servico', 'Serviços', '30 dias de consultor em campo acompanhando a adoção do time de vendas.'),
    ('d0000000-0000-4000-8000-000000000006', v_org, 'Diagnóstico de operação', 'servico', 'Serviços', 'Levantamento de 2 semanas do fluxo pedido → estoque → faturamento, com plano de implantação.'),
    ('d0000000-0000-4000-8000-000000000007', v_org, 'Distribuidora Aliança', 'case', 'Alimentos', 'Ruptura de 7% para 1,8% em 4 meses; devoluções -62%; fechamento contábil de 12 para 3 dias.'),
    ('d0000000-0000-4000-8000-000000000008', v_org, 'Cooperativa Vale Verde', 'case', 'Agro', 'Time resistente a tecnologia com 100% de adoção em 6 semanas; positivação +23%.');

  -- ── Reuniões ─────────────────────────────────────────────────────────────
  -- Apaga a rodada anterior deste seed (ids com prefixo a0000000).
  DELETE FROM public.api_usage_logs WHERE org_id = v_org;
  DELETE FROM public.usage_counters WHERE org_id = v_org;
  DELETE FROM public.meetings WHERE org_id = v_org AND id::text LIKE 'a0000000-%';

  -- 8 reuniões "de capa", escritas à mão -----------------------------------
  FOR i IN 1..8 LOOP
    m_id := ('a0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    s_idx := hero_seller[i]; t_idx := hero_type[i];
    m_date := date_trunc('day', now()) - (hero_days_ago[i] || ' days')::interval + interval '10 hours' + ((i * 37) % 420 || ' minutes')::interval;
    sb := hero_scores[i][1]; sa := hero_scores[i][2]; sn := hero_scores[i][3]; st := hero_scores[i][4];
    attended := (sb >= 15)::int + (sa >= 15)::int + (sn >= 15)::int + (st >= 15)::int;
    temp := (ARRAY['congelado','frio','morno','quente','muito_quente'])[attended + 1];
    overall := hero_overall[i];
    lead_first := split_part(hero_lead[i], ' ', 1); seller_first_n := seller_first[s_idx];
    dur := hero_dur[i];

    INSERT INTO public.meetings (id, org_id, title, seller_id, team_id, status, meeting_type, meeting_date, lead_name, lead_company, lead_email, duration_seconds, file_type, overall_score, temperature, created_at, updated_at,
                                 share_enabled, share_token, share_expires_at)
    VALUES (m_id, v_org, mtype_lbl[t_idx] || ' · ' || hero_company[i], seller[s_idx], CASE WHEN s_idx IN (1,3,5) THEN v_team_in ELSE v_team_out END, 'completo', mtypes[t_idx], m_date,
            hero_lead[i], hero_company[i], lower(replace(lead_first, 'ç', 'c')) || '@' || lower(regexp_replace(translate(hero_company[i], 'çãáéíóúâêô ', 'caaeiouaeo'), '[^a-z]', '', 'g')) || '.com.br',
            dur, 'mp4', overall, temp, m_date + interval '2 hours', m_date + interval '2 hours',
            i IN (2, 8), CASE WHEN i IN (2, 8) THEN gen_random_uuid() END, CASE WHEN i IN (2, 8) THEN now() + interval '6 days' END);

    temp_reason := attended || ' de 4 critérios BANT atendidos' ||
      CASE attended WHEN 0 THEN '.' ELSE ': ' || array_to_string(ARRAY(SELECT x FROM unnest(ARRAY[CASE WHEN sb>=15 THEN 'Budget' END, CASE WHEN sa>=15 THEN 'Authority' END, CASE WHEN sn>=15 THEN 'Need' END, CASE WHEN st>=15 THEN 'Timeline' END]) x WHERE x IS NOT NULL), ', ') || '.' END;

    bant := jsonb_build_object(
      'budget',    jsonb_build_object('score', sb, 'reason', CASE i WHEN 1 THEN 'Lead comparou com o valor do sistema atual (R$ 3,2 mil/mês) e disse que "cabe no mesmo orçamento".' WHEN 2 THEN 'Verba aprovada pela diretoria para o projeto de digitalização do comercial.' WHEN 3 THEN 'Orçamento não foi abordado; lead desviou para desconto.' WHEN 4 THEN 'Sem qualquer menção a verba.' WHEN 8 THEN 'Investimento do plano Growth aprovado pelo diretor na reunião.' ELSE (CASE WHEN sb>=15 THEN r_budget_ok[1 + (i % 3)] ELSE r_budget_no[1 + (i % 3)] END) END),
      'authority', jsonb_build_object('score', sa, 'reason', CASE i WHEN 1 THEN 'Ricardo é diretor comercial e afirmou que decide com o sócio; sócio ainda não participou.' WHEN 4 THEN 'Fernanda é analista de compras; o decisor não foi identificado.' WHEN 8 THEN 'Sócio-proprietário participou e validou a decisão.' ELSE (CASE WHEN sa>=15 THEN r_auth_ok[1 + (i % 3)] ELSE r_auth_no[1 + (i % 3)] END) END),
      'need',      jsonb_build_object('score', sn, 'reason', CASE i WHEN 1 THEN 'Dor clara e quantificada: 6% de ruptura e pedidos digitados à noite; lead estimou R$ 80 mil/mês de perda.' WHEN 4 THEN 'Lead reconhece erro nos pedidos, mas ainda não prioriza resolver.' ELSE (CASE WHEN sn>=15 THEN r_need_ok[1 + (i % 3)] ELSE r_need_no[1 + (i % 3)] END) END),
      'timeline',  jsonb_build_object('score', st, 'reason', CASE i WHEN 1 THEN 'Quer resolver "até o fim do ano", mas sem data de decisão; vendedora não fechou prazo.' WHEN 2 THEN 'Implantação antes de dezembro; decisão até o fim do mês.' WHEN 8 THEN 'Assinatura marcada para sexta-feira; kickoff em duas semanas.' ELSE (CASE WHEN st>=15 THEN r_time_ok[1 + (i % 3)] ELSE r_time_no[1 + (i % 3)] END) END)
    );
    meddic := jsonb_build_object(
      'metrics', jsonb_build_object('score', LEAST(17, 6 + overall / 7), 'reason', 'Métricas de ruptura e devolução citadas pelo lead.'),
      'economic_buyer', jsonb_build_object('score', LEAST(17, sa * 17 / 25), 'reason', 'Decisor econômico ' || CASE WHEN sa >= 15 THEN 'identificado.' ELSE 'não confirmado.' END),
      'decision_criteria', jsonb_build_object('score', LEAST(17, 5 + overall / 9), 'reason', 'Critérios: integração fiscal, adoção do time e prazo.'),
      'decision_process', jsonb_build_object('score', LEAST(17, st * 17 / 25), 'reason', 'Processo de decisão ' || CASE WHEN st >= 15 THEN 'mapeado com datas.' ELSE 'em aberto.' END),
      'identify_pain', jsonb_build_object('score', LEAST(17, sn * 17 / 25), 'reason', 'Dor principal: ' || CASE t_idx WHEN 1 THEN 'ruptura de estoque.' WHEN 2 THEN 'vendedor externo sem visibilidade.' WHEN 3 THEN 'fechamento contábil lento.' ELSE 'pedidos manuais.' END),
      'champion', jsonb_build_object('score', LEAST(17, 4 + overall / 8), 'reason', CASE WHEN overall >= 75 THEN lead_first || ' se posicionou como defensor interno do projeto.' ELSE 'Nenhum defensor interno claro.' END)
    );
    spin := jsonb_build_object(
      'situacao', jsonb_build_object('score', LEAST(25, 12 + overall / 6), 'reason', 'Perguntas de situação cobriram operação, número de vendedores e sistema atual.'),
      'problema', jsonb_build_object('score', LEAST(25, sn), 'reason', 'Problemas explorados: ruptura, digitação manual e visibilidade.'),
      'implicacao', jsonb_build_object('score', LEAST(25, GREATEST(4, overall / 4 - 3)), 'reason', CASE WHEN overall >= 70 THEN 'Implicação financeira quantificada com o lead.' ELSE 'Implicações pouco exploradas; faltou "quanto isso custa".' END),
      'necessidade', jsonb_build_object('score', LEAST(25, GREATEST(5, overall / 4)), 'reason', CASE WHEN overall >= 70 THEN 'Lead verbalizou o que ganha resolvendo (fechar o mês em 3 dias, parar de cancelar pedido).' ELSE 'Necessidade de solução não foi verbalizada pelo lead.' END)
    );
    talk_seller := CASE i WHEN 4 THEN 78 WHEN 3 THEN 61 ELSE 44 + (i % 3) * 3 END;
    metrics := jsonb_build_object('total_questions', 8 + (overall / 9), 'open_questions', 4 + (overall / 15), 'objections_handled', CASE WHEN i = 4 THEN 0 ELSE 1 + (i % 3) END);
    ins := jsonb_build_object(
      'positives', CASE i WHEN 4 THEN jsonb_build_array('Tom cordial e boa relação com a lead.') ELSE jsonb_build_array(pos_pool[1 + (i % 8)], pos_pool[1 + ((i + 3) % 8)], pos_pool[1 + ((i + 5) % 8)]) END,
      'improvements', CASE i WHEN 4 THEN jsonb_build_array('Falou 78% do tempo: apresentou o produto antes de entender a operação.', 'Não perguntou sobre orçamento nem sobre quem decide.', 'Sem próximo passo definido ao final.') WHEN 8 THEN jsonb_build_array('Poderia ter antecipado o cronograma de kickoff por escrito.') ELSE jsonb_build_array(imp_pool[1 + (i % 8)], imp_pool[1 + ((i + 4) % 8)]) END,
      'key_moments', jsonb_build_array(km_pool[1 + (i % 5)], km_pool[1 + ((i + 2) % 5)])
    );
    coach := jsonb_build_object(
      'next_steps', CASE i WHEN 1 THEN jsonb_build_array('Enviar proposta com onboarding assistido incluído até quarta.', 'Confirmar prazo de decisão com o diretor e agendar conversa com o sócio.') ELSE jsonb_build_array(next_pool[1 + (i % 6)], next_pool[1 + ((i + 2) % 6)]) END,
      'suggestions', jsonb_build_array(sug_pool[1 + (i % 5)], sug_pool[1 + ((i + 1) % 5)]),
      'scripts', jsonb_build_array(scr_pool[1 + (i % 4)], scr_pool[1 + ((i + 2) % 4)])
    );
    rag := jsonb_build_object(
      'knowledge_adherence_score', LEAST(100, 50 + overall / 2),
      'products_mentioned', CASE t_idx WHEN 1 THEN jsonb_build_array('Rocket Força de Vendas') WHEN 2 THEN jsonb_build_array('Rocket Força de Vendas', 'Rocket ERP', 'Integração fiscal') ELSE jsonb_build_array('Rocket ERP', 'Rocket Força de Vendas') END,
      'missed_opportunities', CASE i WHEN 1 THEN jsonb_build_array('Onboarding assistido — o lead citou medo de adoção e o item está no portfólio.') WHEN 8 THEN jsonb_build_array() ELSE jsonb_build_array('Rocket BI não foi citado apesar da dor de relatórios manuais.') END,
      'cross_sell_suggestions', CASE WHEN t_idx >= 2 THEN jsonb_build_array('Integração fiscal (fechamento contábil citado como dor).') ELSE jsonb_build_array('Rocket BI para o gestor que "só vê no fim do mês".') END,
      'discourse_alignment', CASE WHEN overall >= 75 THEN 'Discurso alinhado ao portfólio; preços citados batem com a tabela.' WHEN overall >= 60 THEN 'Alinhado, mas citou prazo de implantação de 4 semanas (tabela: 6 semanas).' ELSE 'Apresentou módulos fora da dor levantada; não usou nenhum case.' END
    );
    raw := jsonb_build_object('overall_score', overall, 'overall_score_reason',
        CASE i WHEN 1 THEN 'Descoberta forte: dor quantificada, decisor presente e sinal de compra. Perdeu pontos por não fechar prazo de decisão.'
               WHEN 2 THEN 'Demo guiada pelas dores, decisor e verba confirmados, próximo passo com data.'
               WHEN 3 THEN 'Negociação travou no desconto; orçamento e prazo seguem abertos.'
               WHEN 4 THEN 'Reunião virou apresentação de produto; nenhuma qualificação feita.'
               WHEN 8 THEN 'Fechamento: todos os critérios atendidos e assinatura agendada.'
               ELSE 'Boa condução, com lacunas em ' || CASE WHEN sb < 15 THEN 'orçamento' ELSE 'prazo' END || '.' END,
      'temperature', temp, 'temperature_reason', temp_reason,
      'bant_score', bant, 'meddic_score', meddic, 'spin_score', spin, 'talk_ratio', jsonb_build_object('seller', talk_seller, 'lead', 100 - talk_seller),
      'conversation_metrics', metrics, 'insights', ins, 'sales_coach', coach, 'rag_results', rag,
      'resumo_executivo', jsonb_build_object('participantes', jsonb_build_array(seller_name[s_idx] || ' (Sales Rocket)', hero_lead[i] || ' (' || hero_company[i] || ')'), 'proposta', CASE WHEN t_idx >= 2 THEN 'Plano Growth — R$ 3.900/mês + onboarding assistido' ELSE 'Ainda não apresentada' END));

    INSERT INTO public.analysis_results (id, org_id, meeting_id, model_used, overall_score, temperature, bant_score, meddic_score, spin_score, talk_ratio, conversation_metrics, insights, sales_coach, rag_results, raw_analysis, created_at)
    VALUES (('a1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, v_org, m_id, 'google/gemini-2.5-pro', overall, temp, bant, meddic, spin,
            jsonb_build_object('seller', talk_seller, 'lead', 100 - talk_seller, 'reason', CASE WHEN talk_seller > 60 THEN 'Vendedor dominou a conversa; lead teve pouco espaço.' ELSE 'Proporção saudável: lead falou mais da metade do tempo.' END),
            metrics, ins, coach, rag, raw, m_date + interval '2 hours');

    -- Transcrição
    txt := replace(replace(replace(t_open[1 + (i % 3)], '%V', seller_first_n), '%L', lead_first), '%C', hero_company[i]);
    FOREACH line IN ARRAY t_disc LOOP txt := txt || E'\n\n' || replace(replace(replace(line, '%V', seller_first_n), '%L', lead_first), '%C', hero_company[i]); END LOOP;
    IF i <> 4 THEN FOREACH line IN ARRAY t_pres LOOP txt := txt || E'\n\n' || replace(replace(replace(line, '%V', seller_first_n), '%L', lead_first), '%C', hero_company[i]); END LOOP;
    ELSE txt := txt || E'\n\n' || seller_first_n || ': Deixa eu te mostrar o sistema inteiro então. Aqui é o módulo de compras, aqui o financeiro, aqui o fiscal, aqui o BI... (12 minutos de apresentação)' || E'\n\n' || lead_first || ': Entendi. Vou ver com o pessoal e te retorno.'; END IF;
    FOR k IN 1..4 LOOP txt := txt || E'\n\n' || replace(replace(replace(t_close[1 + ((i + k) % 8)], '%V', seller_first_n), '%L', lead_first), '%C', hero_company[i]); END LOOP;
    INSERT INTO public.transcriptions (org_id, meeting_id, full_text, language, speakers)
    VALUES (v_org, m_id, txt, 'pt-BR', jsonb_build_array(jsonb_build_object('label', seller_first_n, 'role', 'vendedor'), jsonb_build_object('label', lead_first, 'role', 'lead')));

    -- Destaques
    INSERT INTO public.highlights (org_id, meeting_id, highlight_type, text, speaker) VALUES
      (v_org, m_id, 'sinal_compra', CASE i WHEN 1 THEN 'Manda a proposta ainda essa semana.' WHEN 4 THEN 'Vou ver com o pessoal e te retorno.' ELSE h_buy[1 + (i % 6)] END, 'lead'),
      (v_org, m_id, 'objecao', CASE i WHEN 1 THEN 'A gente já testou uma ferramenta assim e o time não usou.' ELSE h_obj[1 + (i % 6)] END, 'lead'),
      (v_org, m_id, 'momento_chave', CASE i WHEN 1 THEN 'Lead revelou que perde cerca de R$ 80 mil por mês com ruptura e cancelamentos.' ELSE h_key[1 + (i % 6)] END, 'lead');

    -- Dicas ao vivo (coach na reunião) para as reuniões gravadas pela extensão
    IF i IN (1, 2, 5, 7, 8) THEN
      INSERT INTO public.live_tips (org_id, meeting_id, categoria, urgencia, titulo, acao, emitted_at) VALUES
        (v_org, m_id, 'need', 'media', 'Dor citada: pedidos digitados à noite', 'Quantifique: "Quantos pedidos por semana passam por essa digitação e quantos dão erro?"', m_date + interval '6 minutes'),
        (v_org, m_id, 'objecao', 'alta', 'Objeção de adoção — o time não usou a ferramenta anterior', '"O que fez o time parar: era complexo ou não mostrava resultado? Pergunto porque aqui a orientação aparece dentro da própria reunião."', m_date + interval '18 minutes'),
        (v_org, m_id, 'produto', 'media', 'Cite o onboarding assistido', 'Ofereça: "Temos um consultor em campo por 30 dias justamente para o time adotar. Foi assim na Cooperativa Vale Verde."', m_date + interval '19 minutes'),
        (v_org, m_id, 'budget', 'media', 'Critério Budget ainda não coberto', '"Quanto vocês investem hoje entre sistema e o custo de digitar pedido?"', m_date + interval '27 minutes'),
        (v_org, m_id, 'sinal_compra', 'alta', 'Sinal de compra: pediu a proposta', 'Feche o prazo: "Envio até quarta. Conseguimos conversar com o seu sócio na sexta para decidir?"', m_date + interval '39 minutes');
    END IF;

    -- Consumo
    INSERT INTO public.api_usage_logs (org_id, meeting_id, operation_type, model_used, provider, quantity, unit, created_at) VALUES
      (v_org, m_id, 'transcricao', 'assemblyai/best', 'assemblyai', round(dur / 60.0), 'minutos', m_date + interval '1 hour'),
      (v_org, m_id, 'analise', 'google/gemini-2.5-pro', 'lovable', 1, 'analises', m_date + interval '2 hours');
    IF i IN (1, 2, 5, 7, 8) THEN
      INSERT INTO public.api_usage_logs (org_id, meeting_id, operation_type, model_used, provider, quantity, unit, created_at)
      VALUES (v_org, m_id, 'live_coach', 'google/gemini-2.5-flash', 'lovable', 5, 'chamadas', m_date + interval '40 minutes');
    END IF;
  END LOOP;

  -- Reuniões geradas: 42 em 6 meses ----------------------------------------
  FOR n IN 9..50 LOOP
    m_id := ('a0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
    s_idx := 1 + ((n * 7 + 3) % 6);
    c_idx := 1 + ((n * 11) % 30);
    l_idx := 1 + ((n * 13 + 5) % 30);
    t_idx := 1 + ((n * 5 + s_idx) % 4);
    -- data: espalhada entre 170 dias atrás e ontem, em dias úteis
    m_date := date_trunc('day', now()) - ((170 - ((n - 9) * 4) - (n % 3)) || ' days')::interval + interval '9 hours' + ((n * 53) % 480 || ' minutes')::interval;
    IF extract(isodow FROM m_date) > 5 THEN m_date := m_date - interval '2 days'; END IF;
    months := extract(epoch FROM (now() - m_date)) / 2592000.0;   -- meses atrás
    base := seller_base[s_idx] - seller_trend[s_idx] * months;    -- evolução mês a mês
    lead_first := split_part(leads[l_idx], ' ', 1); seller_first_n := seller_first[s_idx];
    dur := 900 + floor(random() * 1500)::int;

    -- Uma reunião em processamento, uma com erro, uma recém-enviada.
    IF n = 50 THEN
      INSERT INTO public.meetings (id, org_id, title, seller_id, status, meeting_type, meeting_date, lead_name, lead_company, duration_seconds, file_type, created_at, updated_at)
      VALUES (m_id, v_org, mtype_lbl[t_idx] || ' · ' || companies[c_idx], seller[s_idx], 'transcrevendo', mtypes[t_idx], now() - interval '25 minutes', leads[l_idx], companies[c_idx], dur, 'mp4', now() - interval '20 minutes', now() - interval '2 minutes');
      CONTINUE;
    ELSIF n = 49 THEN
      INSERT INTO public.meetings (id, org_id, title, seller_id, status, meeting_type, meeting_date, lead_name, lead_company, file_type, error_message, created_at, updated_at)
      VALUES (m_id, v_org, mtype_lbl[t_idx] || ' · ' || companies[c_idx], seller[s_idx], 'erro', mtypes[t_idx], now() - interval '3 days', leads[l_idx], companies[c_idx], 'mp4', 'O arquivo não contém trilha de áudio. Reenvie a gravação com o microfone habilitado.', now() - interval '3 days', now() - interval '3 days');
      CONTINUE;
    ELSIF n = 48 THEN
      INSERT INTO public.meetings (id, org_id, title, seller_id, status, meeting_type, meeting_date, lead_name, lead_company, file_type, created_at, updated_at)
      VALUES (m_id, v_org, mtype_lbl[t_idx] || ' · ' || companies[c_idx], seller[s_idx], 'enviado', mtypes[t_idx], now() - interval '8 minutes', leads[l_idx], companies[c_idx], 'mp3', now() - interval '5 minutes', now() - interval '5 minutes');
      CONTINUE;
    END IF;

    sb := LEAST(25, GREATEST(0, round(base / 4 + (random() * 14 - 7))::int));
    sa := LEAST(25, GREATEST(0, round(base / 4 + (random() * 12 - 5))::int));
    sn := LEAST(25, GREATEST(0, round(base / 4 + (random() * 10 - 3))::int));
    st := LEAST(25, GREATEST(0, round(base / 4 + (random() * 16 - 10))::int));
    attended := (sb >= 15)::int + (sa >= 15)::int + (sn >= 15)::int + (st >= 15)::int;
    temp := (ARRAY['congelado','frio','morno','quente','muito_quente'])[attended + 1];
    overall := LEAST(100, GREATEST(0, sb + sa + sn + st + round(random() * 6 - 3)::int));
    talk_seller := LEAST(85, GREATEST(30, round(75 - overall / 3 + random() * 12)::int));
    temp_reason := attended || ' de 4 critérios BANT atendidos' ||
      CASE attended WHEN 0 THEN '.' ELSE ': ' || array_to_string(ARRAY(SELECT x FROM unnest(ARRAY[CASE WHEN sb>=15 THEN 'Budget' END, CASE WHEN sa>=15 THEN 'Authority' END, CASE WHEN sn>=15 THEN 'Need' END, CASE WHEN st>=15 THEN 'Timeline' END]) x WHERE x IS NOT NULL), ', ') || '.' END;

    INSERT INTO public.meetings (id, org_id, title, seller_id, team_id, status, meeting_type, meeting_date, lead_name, lead_company, lead_email, duration_seconds, file_type, overall_score, temperature, created_at, updated_at)
    VALUES (m_id, v_org, mtype_lbl[t_idx] || ' · ' || companies[c_idx], seller[s_idx], CASE WHEN s_idx IN (1,3,5) THEN v_team_in ELSE v_team_out END, 'completo', mtypes[t_idx], m_date,
            leads[l_idx], companies[c_idx], lower(translate(lead_first, 'çãáéíóúâêô', 'caaeiouaeo')) || '@' || lower(regexp_replace(translate(companies[c_idx], 'çãáéíóúâêô ', 'caaeiouaeo'), '[^a-z]', '', 'g')) || '.com.br',
            dur, CASE WHEN n % 4 = 0 THEN 'mp3' ELSE 'mp4' END, overall, temp, m_date + interval '2 hours', m_date + interval '2 hours');

    bant := jsonb_build_object(
      'budget',    jsonb_build_object('score', sb, 'reason', CASE WHEN sb>=15 THEN r_budget_ok[1 + (n % 3)] ELSE r_budget_no[1 + (n % 3)] END),
      'authority', jsonb_build_object('score', sa, 'reason', CASE WHEN sa>=15 THEN r_auth_ok[1 + (n % 3)] ELSE r_auth_no[1 + (n % 3)] END),
      'need',      jsonb_build_object('score', sn, 'reason', CASE WHEN sn>=15 THEN r_need_ok[1 + (n % 3)] ELSE r_need_no[1 + (n % 3)] END),
      'timeline',  jsonb_build_object('score', st, 'reason', CASE WHEN st>=15 THEN r_time_ok[1 + (n % 3)] ELSE r_time_no[1 + (n % 3)] END));
    meddic := jsonb_build_object(
      'metrics', jsonb_build_object('score', LEAST(17, 5 + overall / 7), 'reason', 'Métricas de operação citadas pelo lead.'),
      'economic_buyer', jsonb_build_object('score', sa * 17 / 25, 'reason', CASE WHEN sa >= 15 THEN 'Decisor identificado.' ELSE 'Decisor não confirmado.' END),
      'decision_criteria', jsonb_build_object('score', LEAST(17, 4 + overall / 9), 'reason', 'Critérios de decisão parcialmente mapeados.'),
      'decision_process', jsonb_build_object('score', st * 17 / 25, 'reason', CASE WHEN st >= 15 THEN 'Processo com datas.' ELSE 'Processo em aberto.' END),
      'identify_pain', jsonb_build_object('score', sn * 17 / 25, 'reason', 'Dor principal identificada.'),
      'champion', jsonb_build_object('score', LEAST(17, 3 + overall / 8), 'reason', CASE WHEN overall >= 75 THEN 'Lead atua como defensor interno.' ELSE 'Sem defensor interno claro.' END));
    spin := jsonb_build_object(
      'situacao', jsonb_build_object('score', LEAST(25, 10 + overall / 6), 'reason', 'Situação da operação levantada.'),
      'problema', jsonb_build_object('score', sn, 'reason', 'Problemas explorados de forma ' || CASE WHEN sn >= 15 THEN 'específica.' ELSE 'genérica.' END),
      'implicacao', jsonb_build_object('score', LEAST(25, GREATEST(3, overall / 4 - 4)), 'reason', CASE WHEN overall >= 70 THEN 'Custo da dor quantificado.' ELSE 'Faltou perguntar quanto a dor custa.' END),
      'necessidade', jsonb_build_object('score', LEAST(25, GREATEST(4, overall / 4)), 'reason', CASE WHEN overall >= 70 THEN 'Lead verbalizou o ganho esperado.' ELSE 'Necessidade de solução não verbalizada.' END));
    metrics := jsonb_build_object('total_questions', 5 + overall / 9, 'open_questions', 2 + overall / 15, 'objections_handled', (n % 3));
    ins := jsonb_build_object('positives', jsonb_build_array(pos_pool[1 + (n % 8)], pos_pool[1 + ((n + 3) % 8)]),
                              'improvements', jsonb_build_array(imp_pool[1 + (n % 8)], imp_pool[1 + ((n + 5) % 8)]),
                              'key_moments', jsonb_build_array(km_pool[1 + (n % 5)]));
    coach := jsonb_build_object('next_steps', jsonb_build_array(next_pool[1 + (n % 6)], next_pool[1 + ((n + 3) % 6)]),
                                'suggestions', jsonb_build_array(sug_pool[1 + (n % 5)]),
                                'scripts', jsonb_build_array(scr_pool[1 + (n % 4)]));
    rag := jsonb_build_object('knowledge_adherence_score', LEAST(100, 45 + overall / 2),
      'products_mentioned', CASE t_idx WHEN 1 THEN jsonb_build_array('Rocket Força de Vendas') WHEN 2 THEN jsonb_build_array('Rocket Força de Vendas', 'Rocket ERP') ELSE jsonb_build_array('Rocket ERP', 'Integração fiscal') END,
      'missed_opportunities', CASE WHEN n % 3 = 0 THEN jsonb_build_array('Onboarding assistido não foi oferecido diante da objeção de adoção.') WHEN n % 3 = 1 THEN jsonb_build_array('Rocket BI não citado apesar da dor de relatórios manuais.') ELSE jsonb_build_array() END,
      'cross_sell_suggestions', jsonb_build_array(CASE WHEN n % 2 = 0 THEN 'Integração fiscal' ELSE 'Rocket BI' END),
      'discourse_alignment', CASE WHEN overall >= 75 THEN 'Alinhado ao portfólio.' WHEN overall >= 55 THEN 'Alinhado, com uma imprecisão de prazo de implantação.' ELSE 'Apresentou módulos fora da dor levantada.' END);
    raw := jsonb_build_object('overall_score', overall,
      'overall_score_reason', CASE WHEN overall >= 80 THEN 'Reunião bem conduzida, com qualificação completa e próximo passo definido.' WHEN overall >= 60 THEN 'Boa condução, com lacunas em ' || CASE WHEN sb < 15 THEN 'orçamento' WHEN st < 15 THEN 'prazo' ELSE 'decisor' END || '.' ELSE 'Pouca qualificação; a conversa ficou em apresentação de produto.' END,
      'temperature', temp, 'temperature_reason', temp_reason, 'bant_score', bant, 'meddic_score', meddic, 'spin_score', spin,
      'talk_ratio', jsonb_build_object('seller', talk_seller, 'lead', 100 - talk_seller), 'conversation_metrics', metrics, 'insights', ins, 'sales_coach', coach, 'rag_results', rag);

    INSERT INTO public.analysis_results (id, org_id, meeting_id, model_used, overall_score, temperature, bant_score, meddic_score, spin_score, talk_ratio, conversation_metrics, insights, sales_coach, rag_results, raw_analysis, created_at)
    VALUES (('a1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, v_org, m_id, 'google/gemini-2.5-pro', overall, temp, bant, meddic, spin,
            jsonb_build_object('seller', talk_seller, 'lead', 100 - talk_seller, 'reason', CASE WHEN talk_seller > 60 THEN 'Vendedor falou a maior parte do tempo.' ELSE 'Proporção saudável de fala.' END),
            metrics, ins, coach, rag, raw, m_date + interval '2 hours');

    txt := replace(replace(replace(t_open[1 + (n % 3)], '%V', seller_first_n), '%L', lead_first), '%C', companies[c_idx]);
    FOR k IN 0..4 LOOP txt := txt || E'\n\n' || replace(replace(replace(t_disc[1 + ((n + k * 3) % 8)], '%V', seller_first_n), '%L', lead_first), '%C', companies[c_idx]); END LOOP;
    FOR k IN 0..3 LOOP txt := txt || E'\n\n' || replace(replace(replace(t_pres[1 + ((n + k * 2) % 7)], '%V', seller_first_n), '%L', lead_first), '%C', companies[c_idx]); END LOOP;
    FOR k IN 0..2 LOOP txt := txt || E'\n\n' || replace(replace(replace(t_close[1 + ((n + k * 3) % 8)], '%V', seller_first_n), '%L', lead_first), '%C', companies[c_idx]); END LOOP;
    INSERT INTO public.transcriptions (org_id, meeting_id, full_text, language, speakers)
    VALUES (v_org, m_id, txt, 'pt-BR', jsonb_build_array(jsonb_build_object('label', seller_first_n, 'role', 'vendedor'), jsonb_build_object('label', lead_first, 'role', 'lead')));

    INSERT INTO public.highlights (org_id, meeting_id, highlight_type, text, speaker) VALUES
      (v_org, m_id, 'objecao', h_obj[1 + (n % 6)], 'lead'),
      (v_org, m_id, 'momento_chave', h_key[1 + (n % 6)], 'lead');
    IF overall >= 60 THEN
      INSERT INTO public.highlights (org_id, meeting_id, highlight_type, text, speaker) VALUES (v_org, m_id, 'sinal_compra', h_buy[1 + (n % 6)], 'lead');
    END IF;

    IF n % 3 = 0 THEN
      INSERT INTO public.live_tips (org_id, meeting_id, categoria, urgencia, titulo, acao, emitted_at) VALUES
        (v_org, m_id, 'objecao', 'alta', 'Objeção: ' || h_obj[1 + (n % 6)], scr_pool[1 + (n % 4)], m_date + interval '14 minutes'),
        (v_org, m_id, CASE WHEN sb < 15 THEN 'budget' ELSE 'timeline' END, 'media', CASE WHEN sb < 15 THEN 'Critério Budget ainda não coberto' ELSE 'Critério Timeline ainda não coberto' END, CASE WHEN sb < 15 THEN '"Quanto vocês investem hoje entre sistema e digitação de pedidos?"' ELSE '"Se começássemos em outubro, faz sentido para o seu calendário?"' END, m_date + interval '26 minutes');
    END IF;

    INSERT INTO public.api_usage_logs (org_id, meeting_id, operation_type, model_used, provider, quantity, unit, created_at) VALUES
      (v_org, m_id, 'transcricao', 'assemblyai/best', 'assemblyai', round(dur / 60.0), 'minutos', m_date + interval '1 hour'),
      (v_org, m_id, 'analise', 'google/gemini-2.5-pro', 'lovable', 1, 'analises', m_date + interval '2 hours');
    IF n % 3 = 0 THEN
      INSERT INTO public.api_usage_logs (org_id, meeting_id, operation_type, model_used, provider, quantity, unit, created_at)
      VALUES (v_org, m_id, 'live_coach', 'google/gemini-2.5-flash', 'lovable', 3 + (n % 4), 'chamadas', m_date + interval '40 minutes');
    END IF;
  END LOOP;

  -- Consumo do mês corrente fora das reuniões: argumentos gerados e documentos extraídos
  FOR k IN 1..22 LOOP
    INSERT INTO public.api_usage_logs (org_id, operation_type, model_used, provider, quantity, unit, input_tokens, output_tokens, created_at)
    VALUES (v_org, 'generate_arguments', 'google/gemini-2.5-pro', 'lovable', 1, 'geracoes', 3200 + k * 40, 900 + k * 12, date_trunc('month', now()) + (k * 17 || ' hours')::interval);
  END LOOP;
  FOR k IN 1..6 LOOP
    INSERT INTO public.api_usage_logs (org_id, operation_type, model_used, provider, quantity, unit, created_at)
    VALUES (v_org, 'extracao_documento', 'google/gemini-2.5-flash', 'lovable', 1, 'documentos', date_trunc('month', now()) + (k * 30 || ' hours')::interval);
  END LOOP;

  INSERT INTO public.audit_log (org_id, action, entity, metadata) VALUES (v_org, 'demo.seed', 'organization', jsonb_build_object('meetings', 50, 'sellers', 6, 'source', 'seed-sales-rocket.sql'));

  RAISE NOTICE 'Sales Rocket populada: org %', v_org;
END
$$;

-- ── Conferência ─────────────────────────────────────────────────────────────
WITH o AS (SELECT id FROM public.organizations WHERE slug = 'sales-rocket')
SELECT 'reuniões'        AS item, count(*)::text AS valor FROM public.meetings WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'análises',       count(*)::text FROM public.analysis_results WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'transcrições',   count(*)::text FROM public.transcriptions WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'destaques',      count(*)::text FROM public.highlights WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'dicas ao vivo',  count(*)::text FROM public.live_tips WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'vendedores',     count(*)::text FROM public.profiles WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'documentos KB',  count(*)::text FROM public.knowledge_documents WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'itens KB',       count(*)::text FROM public.knowledge_items WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'dores',          count(*)::text FROM public.pain_items WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'temperaturas',   string_agg(temperature || '=' || c, ', ' ORDER BY temperature) FROM (SELECT temperature, count(*) c FROM public.meetings WHERE org_id = (SELECT id FROM o) AND temperature IS NOT NULL GROUP BY 1) t
UNION ALL SELECT 'ranking',        string_agg(full_name || ' ' || media, ' · ' ORDER BY media DESC) FROM (SELECT p.full_name, round(avg(m.overall_score)) media FROM public.meetings m JOIN public.profiles p ON p.user_id = m.seller_id WHERE m.org_id = (SELECT id FROM o) AND m.overall_score IS NOT NULL GROUP BY 1) r
UNION ALL SELECT 'uso do mês',     public.org_quota_status((SELECT id FROM o))::text;
