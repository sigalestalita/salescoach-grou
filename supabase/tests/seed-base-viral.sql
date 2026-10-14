-- ============================================================================
-- AMBIENTE DE DEMONSTRAÇÃO: BASE VIRAL
--
-- Cria (se não existir) e popula a organização "Base Viral" para a
-- apresentação do Sales Coach, com dados fictícios em todas as
-- funcionalidades:
--
--   • empresa, plano piloto, cores da marca e metodologia ajustada ao negócio
--   • 2 times e 6 consultores comerciais (perfis virtuais, sem login)
--   • catálogo de dores e tipos de oferta do gerador de argumentos
--   • base de conhecimento com o que a Base Viral publica no site
--     (Método VPI, soluções, entregáveis, cases e números públicos)
--   • ~50 reuniões em 6 meses, com análise, transcrição, destaques e dicas
--     ao vivo; algumas em processamento, uma com erro, duas compartilhadas
--   • consumo do plano no mês corrente
--   • convite de administrador para o e-mail definido em v_email_admin
--
-- Cole no SQL do backend e execute. Pode rodar de novo: os registros têm ids
-- fixos (prefixo bf) e são substituídos. Não toca em nenhuma outra
-- organização.
--
-- O que é real e o que é fictício:
--   • Real (do site baseviral.com.br): soluções, Método VPI, entregáveis,
--     cases publicados e números institucionais.
--   • Fictício: consultores, empresas atendidas nas reuniões, leads e falas.
--     Nenhum preço da Base Viral foi inventado: as propostas aparecem como
--     "sob proposta".
--   • As reuniões não têm gravação de vídeo (os vídeos de demonstração são
--     da Sales Rocket).
-- ============================================================================

DO $$
DECLARE
  -- ── Ajuste aqui ───────────────────────────────────────────────────────────
  -- E-mail que recebe o convite de administrador da Base Viral. Use um e-mail
  -- que ainda não tenha conta no Sales Coach: aceitar o convite leva a conta
  -- para esta organização. Deixe NULL para não gerar convite.
  v_email_admin TEXT := NULL;
  -- ──────────────────────────────────────────────────────────────────────────

  v_org    UUID;
  v_plan   UUID;
  v_team_smb UUID := 'bf300000-0000-4000-8000-000000000001';
  v_team_ent UUID := 'bf300000-0000-4000-8000-000000000002';
  v_tpl    UUID;

  seller  UUID[] := ARRAY[
    'bf200000-0000-4000-8000-000000000001', -- Gabriela Fontes
    'bf200000-0000-4000-8000-000000000002', -- Lucas Mendonça
    'bf200000-0000-4000-8000-000000000003', -- Bruna Kessler
    'bf200000-0000-4000-8000-000000000004', -- Diego Amaral
    'bf200000-0000-4000-8000-000000000005', -- Natália Rocha
    'bf200000-0000-4000-8000-000000000006'  -- Henrique Vieira
  ]::UUID[];
  seller_name  TEXT[] := ARRAY['Gabriela Fontes','Lucas Mendonça','Bruna Kessler','Diego Amaral','Natália Rocha','Henrique Vieira'];
  seller_first TEXT[] := ARRAY['Gabriela','Lucas','Bruna','Diego','Natália','Henrique'];
  seller_base  NUMERIC[] := ARRAY[84, 74, 70, 57, 67, 72];
  seller_trend NUMERIC[] := ARRAY[1.1, 1.3, 1.9, 2.7, 1.5, 2.0];

  companies TEXT[] := ARRAY['Clínica Sorriso Pleno','Rede OdontoMais','Instituto Vértice de Ensino','Colégio Horizonte','Estética Bella Forma','Assessoria Prisma Investimentos','Imobiliária Casa Nova','Viagens Rota Sul','Academia Movimento','Escola de Idiomas Fluent','Clínica Vida Plena','Contabilidade Exata','Corretora Amparo Seguros','Studio Hair Prime','Clínica Dermavita','Franquia Lava Já','Curso Aprova Mais','Planos Saúde Família','Clínica Visão Clara','Energia Solar Sol Forte','Software Gestor Pro','Agência Pulso Digital','Construtora Alicerce','Mentoria Escala','Pet Clínica Amigo Fiel','Laboratório Diagnóstico Sul','Ótica Foco','Consórcio Conquista','Clínica Fisio Ativa','Colégio Novo Saber'];
  leads     TEXT[] := ARRAY['Ricardo Almeida','Patrícia Gomes','João Henrique','Fernanda Castro','Marcos Vinícius','Luciana Prado','André Teixeira','Simone Rocha','Eduardo Lima','Beatriz Moraes','Cláudio Santos','Renata Fonseca','Gustavo Pires','Vanessa Carvalho','Paulo Sérgio','Aline Ribeiro','Rodrigo Martins','Juliana Neves','Sérgio Batista','Carla Mendes','Thiago Lopes','Daniela Souza','Márcio Azevedo','Priscila Cunha','Leandro Farias','Tatiane Melo','Bruno Cardoso','Elaine Barros','Felipe Antunes','Roberta Dias'];
  mtypes    TEXT[] := ARRAY['descoberta','apresentacao','negociacao','follow_up'];
  mtype_lbl TEXT[] := ARRAY['Diagnóstico','Sessão estratégica','Proposta','Follow-up'];

  -- Justificativas por critério (atendido / não atendido).
  r_budget_ok  TEXT[] := ARRAY['Faturamento acima de R$ 5 milhões por ano e verba de marketing definida para o semestre.','Lead disse que investe R$ 30 mil por mês em mídia paga e quer realocar parte para indicação.','Sócio afirmou que o investimento na consultoria cabe no orçamento de aquisição deste ano.'];
  r_budget_no  TEXT[] := ARRAY['Investimento não foi abordado em nenhum momento da conversa.','Lead disse que "precisa ver o caixa", sem faixa de valor nem prazo.','Faturamento informado no formulário, mas o consultor não confirmou capacidade de investimento.'];
  r_auth_ok    TEXT[] := ARRAY['Sócio-fundador participou e se colocou como quem decide.','CEO presente e afirmou que aprova sozinho projetos de marketing.','Diretora de marketing confirmou que leva a decisão com o sócio na mesma semana.'];
  r_auth_no    TEXT[] := ARRAY['Interlocutor é analista de marketing; o decisor não foi identificado.','Lead vai "apresentar para o sócio", sem data para essa conversa.','Não ficou claro quem assina; o consultor não perguntou sobre o processo de decisão.'];
  r_need_ok    TEXT[] := ARRAY['Dor clara: 80% dos novos clientes vêm de mídia paga e o CAC subiu 40% no ano.','Lead estima que 30% das vendas já vêm de indicação, mas sem nenhum estímulo ou medição.','Já teve programa de indicação com desconto que não engajou; quer refazer do jeito certo.'];
  r_need_no    TEXT[] := ARRAY['Necessidade genérica ("queremos crescer"), sem dor de aquisição específica.','Lead ainda não vê indicação como canal; a conversa ficou em curiosidade.','Dor de CAC mencionada, mas não explorada nem quantificada pelo consultor.'];
  r_time_ok    TEXT[] := ARRAY['Quer o programa lançado antes da alta temporada de março.','Contrato com a agência de mídia vence em 60 dias; decisão até o fim do mês.','Definiu a próxima reunião com o sócio para a semana que vem.'];
  r_time_no    TEXT[] := ARRAY['Sem prazo definido; "quando der" foi a resposta.','Momento de lançamento não foi perguntado.','Lead está estudando o tema, sem data para decidir.'];

  h_obj  TEXT[] := ARRAY['A gente já recebe indicação naturalmente, não sei se precisa de um programa.','Já tentamos um programa de indicação com desconto e ninguém usou.','Meus clientes não gostam de indicar, é um público mais reservado.','Não quero dar dinheiro ou desconto para cliente indicar.','Agora o foco é mídia paga, indicação fica para depois.','Preciso ver com meu sócio antes de qualquer coisa.'];
  h_buy  TEXT[] := ARRAY['Manda a proposta ainda essa semana.','Quanto tempo até o programa estar no ar? Queria antes de março.','Vocês ajudam a escolher a ferramenta de gestão do programa?','Posso trazer meu sócio na próxima conversa?','Se a recompensa couber no nosso CAC, para mim faz sentido.','Vamos começar por uma unidade e depois levar para a rede.'];
  h_key  TEXT[] := ARRAY['Lead revelou que 30% das vendas já vêm de indicação, sem nenhum estímulo.','Sócio admitiu que o CAC em mídia paga subiu 40% em um ano.','Consultor conectou a dor de leads desqualificados à indicação ("cliente bom indica cliente bom").','Lead contou que o programa antigo dava desconto e quase ninguém sabia que ele existia.','Lead comparou o custo de um cliente indicado com o de mídia paga.','Consultor calculou com o lead o teto de recompensa dentro do CAC atual.'];

  pos_pool TEXT[] := ARRAY['Abertura com o contexto do segmento do lead, sem discurso genérico.','Perguntas abertas sobre de onde vêm os clientes hoje.','Usou um case do mesmo segmento no momento certo.','Quantificou a dor com o CAC e o ticket do próprio lead.','Fechou com próximo passo e data.','Tratou a objeção do desconto explicando a recompensa certa do Método VPI.','Apresentou só a solução ligada à dor citada.','Deu espaço para o lead falar (boa proporção de fala).'];
  imp_pool TEXT[] := ARRAY['Não perguntou sobre capacidade de investimento.','Falou mais que o lead na primeira metade da reunião.','Explicou o Método VPI inteiro antes de entender a aquisição atual.','Não identificou quem assina o contrato.','Deixou a objeção "já tentamos e não funcionou" sem resposta.','Não citou que 90% dos programas falham por falta de ativação, argumento-chave do método.','Sem prazo acordado para o próximo passo.','Não explorou o programa de parceiros, que fazia sentido para a rede do lead.'];
  km_pool  TEXT[] := ARRAY['Lead descreveu quanto investe por mês em mídia paga.','Momento em que o lead pediu a proposta.','Lead estimou o percentual de vendas que já vem de indicação.','Discussão sobre o prazo de lançamento do programa.','Lead trouxe o sócio para a chamada.'];
  next_pool TEXT[] := ARRAY['Enviar proposta da consultoria com o cronograma do Método VPI.','Agendar sessão estratégica com o sócio presente.','Confirmar investimento e decisor na próxima reunião.','Mandar o case do mesmo segmento por WhatsApp.','Enviar a planilha de CAC para o lead preencher antes da proposta.','Combinar a pesquisa com 10 clientes da base para validar a recompensa.'];
  sug_pool  TEXT[] := ARRAY['Perguntar sobre investimento logo depois de quantificar o CAC.','Trazer o decisor para a sessão estratégica.','Usar "não inventamos a recompensa, perguntamos ao seu cliente" contra a objeção do desconto.','Reduzir o tempo de apresentação e aumentar as perguntas.','Responder "já tentamos e não funcionou" com a gestão e ativação do programa.'];
  scr_pool  TEXT[] := ARRAY['"Se 30% das vendas já vêm de indicação sem estímulo nenhum, quanto seria com um programa ativo?"','"Quem mais precisa estar na conversa para a decisão sair?"','"O programa anterior não funcionou por causa da recompensa ou porque os clientes nem sabiam que ele existia?"','"Se lançarmos em fevereiro, o programa já está rodando na alta temporada. Faz sentido esse prazo?"'];

  -- Falas da transcrição. %L = lead, %C = empresa, %V = consultor.
  t_open TEXT[] := ARRAY['%V: Oi, %L, tudo bem? Obrigada pelo tempo. Antes de falar de programa de indicação, queria entender como a %C conquista clientes hoje.','%V: %L, bom te ver. Vi no formulário que a %C fatura entre 5 e 10 milhões por ano. De onde vêm os clientes novos hoje?','%V: Olá, %L. Para aproveitar bem o diagnóstico: me conta quais são os canais de aquisição da %C e quanto cada um pesa.'];
  t_disc TEXT[] := ARRAY['%L: Hoje é quase tudo mídia paga. Instagram e Google. E cada mês fica mais caro.','%L: Muita gente chega por indicação, mas a gente nunca estimulou. Acontece sozinho.','%L: O CAC subiu uns 40% no último ano. O lead de anúncio vem cada vez mais frio.','%L: A gente até teve um programa de indicação, com desconto. Quase ninguém usou.','%V: E quanto custa trazer um cliente novo hoje, somando mídia e time?','%L: Fácil uns 900 reais por cliente. E o ticket médio é de uns 6 mil.','%V: E dos clientes que chegam por indicação, como é a conversão comparada aos de anúncio?','%L: Muito maior. O indicado já chega sabendo quem a gente é.'];
  t_pres TEXT[] := ARRAY['%V: Então vou te mostrar como funciona o Método VPI: recompensa certa, mecânica clara e gestão do programa depois do lançamento.','%V: A recompensa a gente não inventa: pergunta para os seus clientes o que eles querem ganhar e encaixa no seu CAC. Por isso não depende de desconto.','%L: Mas meu cliente vai indicar só por causa de um brinde?','%V: Ele já indica. O que falta é lembrar e facilitar. 90% dos programas não funcionam porque o cliente nem sabe que eles existem.','%L: A gente já tentou um programa e ninguém usou. Tenho medo de investir de novo em algo que fica parado.','%V: O que fez o programa anterior parar: a recompensa não atraía ou ninguém sabia dele? Pergunto porque isso muda o desenho.','%L: Acho que ninguém sabia. A gente lançou e esqueceu.'];
  t_close TEXT[] := ARRAY['%L: Manda a proposta ainda essa semana. Quero apresentar para o meu sócio na segunda.','%V: Combinado. Envio amanhã com o cronograma e já sugiro a data com o seu sócio.','%L: Quanto tempo até o programa estar no ar?','%V: Depende da pesquisa com os seus clientes, mas o desenho e o lançamento cabem no primeiro trimestre.','%L: Preciso ver com meu sócio antes de qualquer coisa.','%V: Perfeito. Posso montar um resumo de uma página para você levar para ele?','%L: Vamos começar por uma unidade e depois levar para a rede.','%V: Então o próximo passo é a sessão estratégica com o seu sócio na quinta. Fechado?'];

  i INT; n INT; k INT;
  m_id UUID;
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
    -- investimento, decisor, dor, momento
    ARRAY[19,23,22,10],  -- 1 Sorriso Pleno · diagnóstico · quente
    ARRAY[24,24,23,20],  -- 2 Rede OdontoMais · sessão estratégica · muito quente
    ARRAY[9,20,21,8],    -- 3 Instituto Vértice · proposta · morno
    ARRAY[6,8,17,6],     -- 4 Estética Bella Forma · diagnóstico · frio
    ARRAY[18,21,20,16],  -- 5 Assessoria Prisma · follow-up · muito quente
    ARRAY[12,22,21,9],   -- 6 Viagens Rota Sul · diagnóstico · morno
    ARRAY[22,23,24,19],  -- 7 Colégio Horizonte · sessão estratégica · muito quente
    ARRAY[24,24,23,22]   -- 8 Rede OdontoMais 2 · proposta · muito quente
  ];
  hero_overall INT[] := ARRAY[78, 91, 61, 41, 75, 66, 88, 93];
  hero_seller  INT[] := ARRAY[1, 2, 3, 4, 5, 6, 1, 2];
  hero_type    INT[] := ARRAY[1, 2, 3, 1, 4, 1, 2, 3];
  hero_company TEXT[] := ARRAY['Clínica Sorriso Pleno','Rede OdontoMais','Instituto Vértice de Ensino','Estética Bella Forma','Assessoria Prisma Investimentos','Viagens Rota Sul','Colégio Horizonte','Rede OdontoMais'];
  hero_lead    TEXT[] := ARRAY['Ricardo Almeida','Patrícia Gomes','João Henrique','Fernanda Castro','Marcos Vinícius','Luciana Prado','André Teixeira','Patrícia Gomes'];
  hero_days_ago INT[] := ARRAY[9, 6, 14, 21, 4, 11, 2, 1];
  hero_dur     INT[] := ARRAY[1680, 1980, 1440, 1140, 900, 1560, 2040, 1260];
BEGIN
  PERFORM setseed(0.27);

  -- ── Organização ──────────────────────────────────────────────────────────
  SELECT id INTO v_org FROM public.organizations WHERE slug = 'base-viral' OR lower(name) = 'base viral' LIMIT 1;
  IF v_org IS NULL THEN
    v_org := public.provision_organization('Base Viral', 'base-viral', 'piloto', 'Sales Coach');
  END IF;
  UPDATE public.organizations SET status = 'active', name = 'Base Viral' WHERE id = v_org;

  SELECT id INTO v_plan FROM public.plans WHERE key = 'piloto';
  IF v_plan IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE org_id = v_org) THEN
    INSERT INTO public.subscriptions (org_id, plan_id, status, trial_ends_at) VALUES (v_org, v_plan, 'trialing', now() + interval '14 days');
  END IF;

  -- Cores do site da Base Viral: azul #2872BD, laranja #F96431, navy #07273B.
  UPDATE public.organization_branding SET
    product_name = 'Sales Coach',
    primary_hsl = '210 65% 45%',
    accent_hsl = '15 94% 58%',
    sidebar_hsl = '203 79% 13%',
    login_headline = 'Base Viral',
    login_subheadline = 'Cada diagnóstico do time, analisado pelo Método VPI.',
    support_email = NULL
  WHERE org_id = v_org;

  UPDATE public.org_settings SET
    argument_audiences = '[{"key":"socio","label":"sócios e fundadores"},{"key":"marketing","label":"diretores e gerentes de marketing"},{"key":"comercial","label":"diretores e gerentes comerciais"},{"key":"rede","label":"gestores de redes e franquias"}]'::jsonb,
    argument_context_fields = '[{"key":"segment","label":"Segmento"},{"key":"companySize","label":"Clientes ativos na base","suffix":"clientes"},{"key":"saleType","label":"Principal canal de aquisição hoje"},{"key":"estimatedTicket","label":"Faturamento anual (faixa)"}]'::jsonb,
    sharing_enabled = true, share_default_ttl_days = 7
  WHERE org_id = v_org;

  -- Tipos de reunião
  FOR i IN 1..4 LOOP
    IF NOT EXISTS (SELECT 1 FROM public.meeting_types WHERE org_id = v_org AND key = mtypes[i]) THEN
      INSERT INTO public.meeting_types (org_id, key, label, sort_order) VALUES (v_org, mtypes[i], mtype_lbl[i], i);
    END IF;
  END LOOP;
  UPDATE public.meeting_types SET
    label = CASE key WHEN 'descoberta' THEN 'Diagnóstico' WHEN 'apresentacao' THEN 'Sessão estratégica' WHEN 'negociacao' THEN 'Proposta' WHEN 'follow_up' THEN 'Follow-up' ELSE label END,
    prompt_context = CASE key
      WHEN 'descoberta'   THEN 'Diagnóstico gratuito. O objetivo é mapear os canais de aquisição, o peso da mídia paga, o CAC, o ticket médio e quanto já vem de indicação, e identificar o decisor. Não é esperado falar de investimento da consultoria.'
      WHEN 'apresentacao' THEN 'Sessão estratégica: apresentação do Método VPI (recompensa certa, mecânica clara, gestão e performance) aplicado ao negócio do lead. Avalie se a apresentação partiu das dores levantadas no diagnóstico.'
      WHEN 'negociacao'   THEN 'Apresentação da proposta. Avalie o tratamento de objeções (desconto, "já tentamos", "agora o foco é mídia paga"), o uso de cases do mesmo segmento e a definição de prazo de lançamento.'
      WHEN 'follow_up'    THEN 'Retomada. Avalie se o consultor recuperou o contexto, tratou pendências e avançou o próximo passo.'
      ELSE prompt_context END
  WHERE org_id = v_org;

  -- Metodologia: BANT adaptado à venda de consultoria de indicação
  SELECT id INTO v_tpl FROM public.analysis_templates WHERE org_id = v_org AND is_default LIMIT 1;
  IF v_tpl IS NULL THEN
    INSERT INTO public.analysis_templates (org_id, name, is_default, persona, methodology_key, methodology_label, qualification_criteria, temperature_levels, frameworks)
    VALUES (v_org, 'Metodologia Base Viral', true, 'Você é um especialista em vendas consultivas B2B.', 'BANT', 'BANT', '[]'::jsonb, '[]'::jsonb,
      '{"meddic": true, "spin": true, "talk_ratio": true}'::jsonb)
    RETURNING id INTO v_tpl;
  END IF;
  UPDATE public.analysis_templates SET
    name = 'Metodologia Base Viral',
    methodology_key = 'BANT', methodology_label = 'BANT (Base Viral)',
    qualification_criteria = '[{"key":"budget","label":"Investimento","description":"Faturamento e verba compatíveis com a consultoria, confirmados pelo lead","max_score":25},{"key":"authority","label":"Decisor","description":"Sócio, fundador ou CEO na conversa, ou processo de decisão mapeado","max_score":25},{"key":"need","label":"Dor de aquisição","description":"Dependência de mídia paga, CAC alto ou indicação acontecendo sem método, reconhecida e quantificada","max_score":25},{"key":"timeline","label":"Momento","description":"Data de lançamento do programa ou de decisão definida","max_score":25}]'::jsonb,
    temperature_levels = '[{"key":"congelado","label":"Congelado","criteria":"Nenhum critério atendido. Sem perfil para a consultoria."},{"key":"frio","label":"Frio","criteria":"1 critério atendido. Precisa de nutrição com conteúdo."},{"key":"morno","label":"Morno","criteria":"2 critérios atendidos. Dor identificada, qualificação incompleta."},{"key":"quente","label":"Quente","criteria":"3 critérios atendidos. Oportunidade real com alguma ressalva."},{"key":"muito_quente","label":"Muito quente","criteria":"Todos os critérios atendidos e próximo passo acordado."}]'::jsonb,
    persona = 'Você é o head comercial da Base Viral, a primeira consultoria do Brasil especializada em marketing e vendas por indicação, criadora do Método VPI (Vendas Por Indicação). Avalia reuniões de venda consultiva com empresas de diversos segmentos (clínicas, educação, serviços, varejo, tecnologia), com foco em dependência de mídia paga, CAC, indicação sem método e recompensa dentro do CAC.',
    extra_instructions = 'Considere "investimento confirmado" apenas quando o lead citar faixa de faturamento ou verba. A objeção do desconto deve ser respondida com a recompensa certa ("não inventamos a recompensa, perguntamos ao seu cliente e encaixamos no CAC"). A objeção "já tentamos e não funcionou" deve ser respondida com gestão e ativação do programa. Cross-sell: programa de parceiros e afiliados para redes e empresas com canal de revenda; Sales Led Growth quando o lead não tem processo comercial estruturado.'
  WHERE id = v_tpl;

  -- ── Times e consultores ──────────────────────────────────────────────────
  INSERT INTO public.teams (id, org_id, name, description) VALUES
    (v_team_smb, v_org, 'Time Consultores', 'Diagnósticos de quem chega pelo site, conteúdo e palestras'),
    (v_team_ent, v_org, 'Time Enterprise', 'Redes, franquias e projetos Enterprise Full Service')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, org_id = EXCLUDED.org_id;

  FOR i IN 1..6 LOOP
    INSERT INTO public.profiles (user_id, org_id, full_name, team_id)
    VALUES (seller[i], v_org, seller_name[i], CASE WHEN i IN (1,3,5) THEN v_team_smb ELSE v_team_ent END)
    ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, team_id = EXCLUDED.team_id, org_id = EXCLUDED.org_id;
  END LOOP;

  -- ── Catálogo de dores e ofertas (gerador de argumentos) ─────────────────
  DELETE FROM public.pain_items WHERE org_id = v_org;
  DELETE FROM public.pain_categories WHERE org_id = v_org;
  INSERT INTO public.pain_categories (id, org_id, label, icon, sort_order) VALUES
    ('bf400000-0000-4000-8000-000000000001', v_org, 'Aquisição e CAC', 'trending-up', 1),
    ('bf400000-0000-4000-8000-000000000002', v_org, 'Indicação sem método', 'users', 2),
    ('bf400000-0000-4000-8000-000000000003', v_org, 'Pós-venda e base de clientes', 'heart', 3),
    ('bf400000-0000-4000-8000-000000000004', v_org, 'Gestão do canal', 'bar-chart', 4);
  INSERT INTO public.pain_items (org_id, category_id, label, sort_order) VALUES
    (v_org, 'bf400000-0000-4000-8000-000000000001', 'Dependência de mídia paga para trazer clientes', 1),
    (v_org, 'bf400000-0000-4000-8000-000000000001', 'CAC subindo mês a mês', 2),
    (v_org, 'bf400000-0000-4000-8000-000000000001', 'Leads de anúncio cada vez mais frios', 3),
    (v_org, 'bf400000-0000-4000-8000-000000000001', 'Agenda comercial vazia fora das campanhas', 4),
    (v_org, 'bf400000-0000-4000-8000-000000000002', 'Clientes indicam, mas sem estímulo nem registro', 1),
    (v_org, 'bf400000-0000-4000-8000-000000000002', 'Programa de indicação que ninguém conhece', 2),
    (v_org, 'bf400000-0000-4000-8000-000000000002', 'Recompensa baseada em desconto que não engaja', 3),
    (v_org, 'bf400000-0000-4000-8000-000000000002', 'Medo de parecer insistente ao pedir indicação', 4),
    (v_org, 'bf400000-0000-4000-8000-000000000003', 'Base de clientes parada, sem relacionamento', 1),
    (v_org, 'bf400000-0000-4000-8000-000000000003', 'NPS medido e nunca usado', 2),
    (v_org, 'bf400000-0000-4000-8000-000000000003', 'Crescimento dependente do nome do fundador', 3),
    (v_org, 'bf400000-0000-4000-8000-000000000004', 'Não sabe quanto fatura com indicação', 1),
    (v_org, 'bf400000-0000-4000-8000-000000000004', 'Sem ferramenta para gerir indicadores e recompensas', 2),
    (v_org, 'bf400000-0000-4000-8000-000000000004', 'Time sem rotina de ativação do programa', 3);

  DELETE FROM public.offer_types WHERE org_id = v_org;
  INSERT INTO public.offer_types (org_id, key, label, allows_item_selection, instructions, sort_order) VALUES
    (v_org, 'proposta', 'Proposta de consultoria', true,  'Estruture em: contexto do cliente, canais de aquisição e CAC atuais, dores levantadas, como o Método VPI resolve (recompensa certa, mecânica clara, gestão), entregáveis, cronograma e investimento sob proposta. Tom consultivo.', 1),
    (v_org, 'cac',      'Argumento de CAC', true,  'Compare o custo de um cliente de mídia paga com o de um cliente indicado, usando os números citados pelo lead (investimento em mídia, CAC, ticket). Mostre quanto da recompensa cabe no CAC.', 2),
    (v_org, 'objecao',  'Resposta a objeção', false, 'Responda com pergunta de devolução, evidência (case do mesmo segmento) e próximo passo. Máximo de 5 linhas.', 3),
    (v_org, 'whatsapp', 'Mensagem de WhatsApp', true,  'Até 4 linhas, sem formalidade excessiva, com um único pedido claro ao final.', 4),
    (v_org, 'email',    'E-mail de follow-up', true,  'Assunto + 3 parágrafos curtos: o que foi combinado, o que resolve a dor principal, próximo passo com data.', 5);

  -- ── Base de conhecimento (conteúdo público do site da Base Viral) ───────
  DELETE FROM public.knowledge_documents WHERE org_id = v_org AND id::text LIKE 'bf500000-%';
  INSERT INTO public.knowledge_documents (id, org_id, title, doc_type, category, extracted_content) VALUES
    ('bf500000-0000-4000-8000-000000000001', v_org, 'Soluções Base Viral', 'link', 'Soluções',
     E'A Base Viral é a primeira consultoria do Brasil especializada em marketing e vendas por indicação, fundada em 2017 por Rodrigo Noll.\n\nCONSULTORIA EM PROGRAMA DE INDICAÇÃO DE CLIENTES — para empresas que querem transformar clientes em um canal de vendas ativo. Estrutura um programa lucrativo, previsível e escalável, sem depender de descontos ou mídia paga.\n\nCONSULTORIA EM PROGRAMA DE PARCEIROS E AFILIADOS — parceiros e afiliados são "revendedores" da marca, remunerados por comissão. Indicado para quem busca volume de vendas.\n\nCONSULTORIA EM PROGRAMA DE EMBAIXADORES — embaixadores são representantes da marca que aumentam autoridade e notoriedade em audiências que a empresa não alcançaria sozinha.\n\nENTERPRISE FULL SERVICE — a Base Viral faz tudo: discovery completo, validação de ideias e escolha da recompensa, com gestão contínua do canal.\n\nSALES LED GROWTH (com a Sales Leaders Group) — estruturação comercial ponta a ponta pela Metodologia EVI: diagnóstico, processos, tecnologia e equipes. Mais de 100 operações montadas e R$ 120 milhões em receita auditada.\n\nEDUCAÇÃO — palestras e workshops com Rodrigo Noll, Imersão VPI, Curso e Livro Criando Clientes Vendedores (CCV).'),
    ('bf500000-0000-4000-8000-000000000002', v_org, 'Método VPI e entregáveis da consultoria', 'pdf', 'Método',
     E'MÉTODO VPI (VENDAS POR INDICAÇÃO) — o passo a passo usado em 100% dos cases da Base Viral.\n1. Recompensa certa: não inventamos a recompensa; perguntamos ao cliente e encaixamos no CAC.\n2. Mecânica clara: a recompensa sai pelo lead indicado ou pela venda? Uma recompensa ou mais conforme o cliente indica?\n3. Gestão e performance: frequência e jeito certo de ativar sem ser chato. 90% dos programas não funcionam porque o cliente nem sabe que eles existem.\n\nENTREGÁVEIS: programa de indicação funcionando; Canvas Marketing Por Indicação; Método VPI detalhado; modelos de pesquisa qualitativa (script) e quantitativa (formulário); definição do CAC e tabela de cálculo; modelos de páginas do programa e vídeos de sucesso; fluxos de comunicação; checklist de lançamento; gravações e atas das reuniões; Dashboard Base Viral de Otimização; suporte técnico durante toda a consultoria; definição da solução tecnológica de gestão; pasta compartilhada com todos os entregáveis.\n\nPRAZOS: o foco é a otimização contínua; o programa pode ser ajustado no caminho; os resultados são incrementais, como em qualquer canal.'),
    ('bf500000-0000-4000-8000-000000000003', v_org, 'Cases de saúde e estética', 'pdf', 'Cases',
     E'ORAL SIN (maior rede de clínicas de implantes dentários): mais de R$ 22.500.000 faturados com o Método VPI.\n\nCAPI HAIR PLUS: programa lançado em 04/09/2023; R$ 2.831.641 faturados até julho de 2024 só ativando a base de clientes atuais. Antes: 95% de dependência de mídia paga, R$ 9 mil por semana em anúncios e CAC de R$ 913,99.\n\nESPAÇO VOLPI: programa lançado em 12/06/2023; R$ 1.419.481,88 faturados (atualizado em 19/08/2024). Antes: CAC de R$ 1.348 e ticket médio entre R$ 3.500 e R$ 6.500.\n\nIEM ODONTOLOGIA: R$ 972 mil com o Método VPI. CLÍNICA HŌRAIOS: mais de R$ 1 milhão só com indicações.'),
    ('bf500000-0000-4000-8000-000000000004', v_org, 'Cases de educação, serviços e B2B', 'pdf', 'Cases',
     E'APOLLO (escritório de investimentos): mais de R$ 45 milhões e 200 novos assessores com indicações.\n\nPLAYKIDS: programa de indicação rendeu R$ 1.090.000 e reduziu o CAC em 22%.\n\nCOLÉGIO FORÇA MÁXIMA: R$ 3 milhões com o Método VPI.\n\nCLARIM: R$ 1.985.000 sistematizando as indicações de clientes atuais; indicações por mês de 5 para 11 e +90,77% no faturamento mensal por indicação.\n\nVALUE PROJETOS (B2B): R$ 575.973,15 e aumento do ticket médio. TRAVEL MATE: R$ 2.500.000. LOW COST: R$ 6.700.000.'),
    ('bf500000-0000-4000-8000-000000000005', v_org, 'Matriz de objeções', 'text', 'Comercial',
     E'"JÁ RECEBEMOS INDICAÇÃO NATURALMENTE" → perguntar quanto do faturamento vem de indicação; se acontece sem estímulo, com método é canal previsível.\n"JÁ TENTAMOS E NINGUÉM USOU" → perguntar se o problema foi a recompensa ou a ativação; 90% dos programas falham porque o cliente nem sabe que existem. A gestão contínua resolve.\n"NÃO QUERO DAR DESCONTO OU DINHEIRO" → o Método VPI não depende de desconto: a recompensa vem de pesquisa com os próprios clientes e cabe no CAC.\n"MEUS CLIENTES NÃO INDICAM" → clientes vivem em tribos com interesses em comum; indicar é natural, falta facilitar. Citar case do mesmo segmento.\n"AGORA O FOCO É MÍDIA PAGA" → comparar o CAC de mídia com o de indicação; indicação reduz a dependência sem tirar a mídia.\n"PRECISO VER COM MEU SÓCIO" → oferecer resumo de uma página e propor a sessão estratégica com o sócio presente.'),
    ('bf500000-0000-4000-8000-000000000006', v_org, 'Números e prova social', 'text', 'Institucional',
     E'Mais de 850 empresas em 60 segmentos aplicaram o Método VPI. Mais de R$ 400 milhões gerados para clientes. Satisfação dos clientes: 4,85 de 5. BHAG: R$ 1 bilhão de faturamento novo para clientes até 2028. Selo Great Place To Work. Associada ao Instituto Capitalismo Consciente Brasil. Rodrigo Noll: TED Talk, livro best-seller Criando Clientes Vendedores, mais de 55 mil pessoas impactadas em palestras.');
  UPDATE public.knowledge_documents SET file_url = 'https://baseviral.com.br/' WHERE id = 'bf500000-0000-4000-8000-000000000001';

  DELETE FROM public.knowledge_items WHERE org_id = v_org AND id::text LIKE 'bf600000-%';
  INSERT INTO public.knowledge_items (id, org_id, name, item_type, category, description) VALUES
    ('bf600000-0000-4000-8000-000000000001', v_org, 'Consultoria em Programa de Indicação', 'servico', 'Consultoria', 'Transforma clientes em canal de vendas ativo pelo Método VPI, sem descontos nem mídia paga.'),
    ('bf600000-0000-4000-8000-000000000002', v_org, 'Programa de Parceiros e Afiliados', 'servico', 'Consultoria', 'Parceiros e afiliados como revendedores comissionados, para ganhar volume de vendas.'),
    ('bf600000-0000-4000-8000-000000000003', v_org, 'Programa de Embaixadores', 'servico', 'Consultoria', 'Representantes da marca que levam autoridade e notoriedade a novas audiências.'),
    ('bf600000-0000-4000-8000-000000000004', v_org, 'Enterprise Full Service', 'servico', 'Consultoria', 'Discovery completo, escolha da recompensa e gestão contínua do canal feitos pela Base Viral.'),
    ('bf600000-0000-4000-8000-000000000005', v_org, 'Sales Led Growth (SLG)', 'servico', 'Consultoria', 'Estruturação comercial ponta a ponta com a Sales Leaders Group, pela Metodologia EVI.'),
    ('bf600000-0000-4000-8000-000000000006', v_org, 'Palestras, workshops e Imersão VPI', 'produto', 'Educação', 'Rodrigo Noll e o Método VPI em palestras, workshops in company e imersão.'),
    ('bf600000-0000-4000-8000-000000000007', v_org, 'Oral Sin', 'case', 'Saúde', 'Maior rede de clínicas de implantes do país: mais de R$ 22,5 milhões com o Método VPI.'),
    ('bf600000-0000-4000-8000-000000000008', v_org, 'Capi Hair Plus', 'case', 'Estética', 'R$ 2,8 milhões ativando a base, saindo de 95% de dependência de mídia paga.');

  -- ── Reuniões ─────────────────────────────────────────────────────────────
  DELETE FROM public.api_usage_logs WHERE org_id = v_org;
  DELETE FROM public.usage_counters WHERE org_id = v_org;
  DELETE FROM public.meetings WHERE org_id = v_org AND id::text LIKE 'bf000000-%';

  -- 8 reuniões "de capa", escritas à mão ------------------------------------
  FOR i IN 1..8 LOOP
    m_id := ('bf000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    s_idx := hero_seller[i]; t_idx := hero_type[i];
    m_date := date_trunc('day', now()) - (hero_days_ago[i] || ' days')::interval + interval '10 hours' + ((i * 37) % 420 || ' minutes')::interval;
    sb := hero_scores[i][1]; sa := hero_scores[i][2]; sn := hero_scores[i][3]; st := hero_scores[i][4];
    attended := (sb >= 15)::int + (sa >= 15)::int + (sn >= 15)::int + (st >= 15)::int;
    temp := (ARRAY['congelado','frio','morno','quente','muito_quente'])[attended + 1];
    overall := hero_overall[i];
    lead_first := split_part(hero_lead[i], ' ', 1); seller_first_n := seller_first[s_idx];
    dur := hero_dur[i];

    INSERT INTO public.meetings (id, org_id, title, seller_id, team_id, status, meeting_type, meeting_date, lead_name, lead_company, lead_email, duration_seconds, overall_score, temperature, created_at, updated_at,
                                 share_enabled, share_token, share_expires_at)
    VALUES (m_id, v_org, mtype_lbl[t_idx] || ' · ' || hero_company[i], seller[s_idx], CASE WHEN s_idx IN (1,3,5) THEN v_team_smb ELSE v_team_ent END, 'completo', mtypes[t_idx], m_date,
            hero_lead[i], hero_company[i], lower(translate(lead_first, 'çãáéíóúâêô', 'caaeiouaeo')) || '@' || lower(regexp_replace(translate(hero_company[i], 'çãáéíóúâêôÇÃÁÉÍÓÚÂÊÔ ', 'caaeiouaeoCAAEIOUAEO'), '[^A-Za-z]', '', 'g')) || '.com.br',
            dur, overall, temp, m_date + interval '2 hours', m_date + interval '2 hours',
            i IN (2, 8), CASE WHEN i IN (2, 8) THEN gen_random_uuid() END, CASE WHEN i IN (2, 8) THEN now() + interval '6 days' END);

    temp_reason := attended || ' de 4 critérios atendidos' ||
      CASE attended WHEN 0 THEN '.' ELSE ': ' || array_to_string(ARRAY(SELECT x FROM unnest(ARRAY[CASE WHEN sb>=15 THEN 'Investimento' END, CASE WHEN sa>=15 THEN 'Decisor' END, CASE WHEN sn>=15 THEN 'Dor de aquisição' END, CASE WHEN st>=15 THEN 'Momento' END]) x WHERE x IS NOT NULL), ', ') || '.' END;

    bant := jsonb_build_object(
      'budget',    jsonb_build_object('score', sb, 'reason', CASE i WHEN 1 THEN 'Lead contou que investe R$ 25 mil por mês em anúncios e quer realocar parte para indicação.' WHEN 2 THEN 'Faturamento da rede acima de R$ 20 milhões por ano e verba de aquisição aprovada para o projeto.' WHEN 3 THEN 'Investimento não foi abordado; lead pediu desconto antes de ver a proposta.' WHEN 4 THEN 'Sem qualquer menção a investimento ou faturamento.' WHEN 8 THEN 'Investimento da consultoria aprovado pela sócia na reunião.' ELSE (CASE WHEN sb>=15 THEN r_budget_ok[1 + (i % 3)] ELSE r_budget_no[1 + (i % 3)] END) END),
      'authority', jsonb_build_object('score', sa, 'reason', CASE i WHEN 1 THEN 'Ricardo é sócio-fundador e decide com a sócia, que ainda não participou.' WHEN 4 THEN 'Fernanda é analista de marketing; a dona da clínica não foi envolvida.' WHEN 8 THEN 'Sócia-diretora da rede participou e validou a decisão.' ELSE (CASE WHEN sa>=15 THEN r_auth_ok[1 + (i % 3)] ELSE r_auth_no[1 + (i % 3)] END) END),
      'need',      jsonb_build_object('score', sn, 'reason', CASE i WHEN 1 THEN 'Dor clara e quantificada: 85% dos pacientes novos vêm de anúncio, com CAC de R$ 900; lead estima que 25% já chegam por indicação sem estímulo.' WHEN 4 THEN 'Lead reconhece que depende de anúncio, mas ainda não prioriza mudar.' ELSE (CASE WHEN sn>=15 THEN r_need_ok[1 + (i % 3)] ELSE r_need_no[1 + (i % 3)] END) END),
      'timeline',  jsonb_build_object('score', st, 'reason', CASE i WHEN 1 THEN 'Quer resolver "até o meio do ano", mas sem data de decisão; a consultora não fechou prazo.' WHEN 2 THEN 'Quer o programa no ar antes da campanha de março; decisão até o fim do mês.' WHEN 8 THEN 'Assinatura marcada para sexta-feira; kickoff da pesquisa com clientes em duas semanas.' ELSE (CASE WHEN st>=15 THEN r_time_ok[1 + (i % 3)] ELSE r_time_no[1 + (i % 3)] END) END)
    );
    meddic := jsonb_build_object(
      'metrics', jsonb_build_object('score', LEAST(17, 6 + overall / 7), 'reason', 'CAC, ticket médio e investimento em mídia citados pelo lead.'),
      'economic_buyer', jsonb_build_object('score', LEAST(17, sa * 17 / 25), 'reason', 'Decisor econômico ' || CASE WHEN sa >= 15 THEN 'identificado.' ELSE 'não confirmado.' END),
      'decision_criteria', jsonb_build_object('score', LEAST(17, 5 + overall / 9), 'reason', 'Critérios: retorno sobre o CAC, cases do segmento e prazo de lançamento.'),
      'decision_process', jsonb_build_object('score', LEAST(17, st * 17 / 25), 'reason', 'Processo de decisão ' || CASE WHEN st >= 15 THEN 'mapeado com datas.' ELSE 'em aberto.' END),
      'identify_pain', jsonb_build_object('score', LEAST(17, sn * 17 / 25), 'reason', 'Dor principal: ' || CASE t_idx WHEN 1 THEN 'dependência de mídia paga.' WHEN 2 THEN 'CAC subindo.' WHEN 3 THEN 'programa de indicação que não engajou.' ELSE 'indicação sem método.' END),
      'champion', jsonb_build_object('score', LEAST(17, 4 + overall / 8), 'reason', CASE WHEN overall >= 75 THEN lead_first || ' se posicionou como defensor interno do projeto.' ELSE 'Nenhum defensor interno claro.' END)
    );
    spin := jsonb_build_object(
      'situacao', jsonb_build_object('score', LEAST(25, 12 + overall / 6), 'reason', 'Perguntas de situação cobriram canais de aquisição, base de clientes e ticket.'),
      'problema', jsonb_build_object('score', LEAST(25, sn), 'reason', 'Problemas explorados: mídia paga cara, leads frios e indicação sem estímulo.'),
      'implicacao', jsonb_build_object('score', LEAST(25, GREATEST(4, overall / 4 - 3)), 'reason', CASE WHEN overall >= 70 THEN 'Implicação financeira quantificada com o CAC do lead.' ELSE 'Implicações pouco exploradas; faltou "quanto custa um cliente hoje".' END),
      'necessidade', jsonb_build_object('score', LEAST(25, GREATEST(5, overall / 4)), 'reason', CASE WHEN overall >= 70 THEN 'Lead verbalizou o que ganha (menos dependência de anúncio, cliente que já chega preparado).' ELSE 'Necessidade de solução não foi verbalizada pelo lead.' END)
    );
    talk_seller := CASE i WHEN 4 THEN 78 WHEN 3 THEN 61 ELSE 44 + (i % 3) * 3 END;
    metrics := jsonb_build_object('total_questions', 8 + (overall / 9), 'open_questions', 4 + (overall / 15), 'objections_handled', CASE WHEN i = 4 THEN 0 ELSE 1 + (i % 3) END);
    ins := jsonb_build_object(
      'positives', CASE i WHEN 4 THEN jsonb_build_array('Tom cordial e boa relação com a lead.') ELSE jsonb_build_array(pos_pool[1 + (i % 8)], pos_pool[1 + ((i + 3) % 8)], pos_pool[1 + ((i + 5) % 8)]) END,
      'improvements', CASE i WHEN 4 THEN jsonb_build_array('Falou 78% do tempo: explicou o Método VPI antes de entender a aquisição da clínica.', 'Não perguntou sobre investimento nem sobre quem decide.', 'Sem próximo passo definido ao final.') WHEN 8 THEN jsonb_build_array('Poderia ter enviado o cronograma da pesquisa com clientes por escrito na hora.') ELSE jsonb_build_array(imp_pool[1 + (i % 8)], imp_pool[1 + ((i + 4) % 8)]) END,
      'key_moments', jsonb_build_array(km_pool[1 + (i % 5)], km_pool[1 + ((i + 2) % 5)])
    );
    coach := jsonb_build_object(
      'next_steps', CASE i WHEN 1 THEN jsonb_build_array('Enviar a proposta da consultoria com o case Capi Hair Plus até quarta.', 'Confirmar data de decisão e agendar a sessão estratégica com a sócia.') ELSE jsonb_build_array(next_pool[1 + (i % 6)], next_pool[1 + ((i + 2) % 6)]) END,
      'suggestions', jsonb_build_array(sug_pool[1 + (i % 5)], sug_pool[1 + ((i + 1) % 5)]),
      'scripts', jsonb_build_array(scr_pool[1 + (i % 4)], scr_pool[1 + ((i + 2) % 4)])
    );
    rag := jsonb_build_object(
      'knowledge_adherence_score', LEAST(100, 50 + overall / 2),
      'products_mentioned', CASE t_idx WHEN 1 THEN jsonb_build_array('Consultoria em Programa de Indicação') WHEN 2 THEN jsonb_build_array('Consultoria em Programa de Indicação', 'Método VPI', 'Enterprise Full Service') ELSE jsonb_build_array('Consultoria em Programa de Indicação', 'Método VPI') END,
      'missed_opportunities', CASE i WHEN 1 THEN jsonb_build_array('Case Capi Hair Plus (saiu de 95% de mídia paga) não foi citado, e o lead tem a mesma dor.') WHEN 8 THEN jsonb_build_array() ELSE jsonb_build_array('Argumento "90% dos programas falham por falta de ativação" não usado diante do "já tentamos".') END,
      'cross_sell_suggestions', CASE WHEN i IN (2, 8) THEN jsonb_build_array('Programa de Parceiros e Afiliados para levar o programa às unidades da rede.') WHEN t_idx >= 2 THEN jsonb_build_array('Enterprise Full Service, já que o lead não tem time para gerir o programa.') ELSE jsonb_build_array('Sales Led Growth: o lead não tem processo comercial para converter os indicados.') END,
      'discourse_alignment', CASE WHEN overall >= 75 THEN 'Discurso alinhado ao Método VPI; cases e números citados batem com a base.' WHEN overall >= 60 THEN 'Alinhado, mas prometeu programa no ar em 2 semanas, sem considerar a pesquisa com clientes.' ELSE 'Explicou o método sem conectar à dor; não usou nenhum case.' END
    );
    raw := jsonb_build_object('overall_score', overall, 'overall_score_reason',
        CASE i WHEN 1 THEN 'Diagnóstico forte: dor quantificada, decisor presente e sinal de compra. Perdeu pontos por não fechar data de decisão.'
               WHEN 2 THEN 'Sessão guiada pelas dores do diagnóstico, decisora e verba confirmadas, próximo passo com data.'
               WHEN 3 THEN 'Proposta travou no pedido de desconto; investimento e prazo seguem abertos.'
               WHEN 4 THEN 'Reunião virou apresentação do método; nenhuma qualificação feita.'
               WHEN 8 THEN 'Fechamento: todos os critérios atendidos e assinatura agendada.'
               ELSE 'Boa condução, com lacunas em ' || CASE WHEN sb < 15 THEN 'investimento' ELSE 'momento' END || '.' END,
      'temperature', temp, 'temperature_reason', temp_reason,
      'bant_score', bant, 'meddic_score', meddic, 'spin_score', spin, 'talk_ratio', jsonb_build_object('seller', talk_seller, 'lead', 100 - talk_seller),
      'conversation_metrics', metrics, 'insights', ins, 'sales_coach', coach, 'rag_results', rag,
      'resumo_executivo', jsonb_build_object('participantes', jsonb_build_array(seller_name[s_idx] || ' (Base Viral)', hero_lead[i] || ' (' || hero_company[i] || ')'), 'proposta', CASE WHEN t_idx >= 2 THEN 'Consultoria em Programa de Indicação (Método VPI) — investimento sob proposta' ELSE 'Ainda não apresentada' END));

    INSERT INTO public.analysis_results (id, org_id, meeting_id, model_used, overall_score, temperature, bant_score, meddic_score, spin_score, talk_ratio, conversation_metrics, insights, sales_coach, rag_results, raw_analysis, created_at)
    VALUES (('bf100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, v_org, m_id, 'google/gemini-2.5-pro', overall, temp, bant, meddic, spin,
            jsonb_build_object('seller', talk_seller, 'lead', 100 - talk_seller, 'reason', CASE WHEN talk_seller > 60 THEN 'Consultor dominou a conversa; lead teve pouco espaço.' ELSE 'Proporção saudável: lead falou mais da metade do tempo.' END),
            metrics, ins, coach, rag, raw, m_date + interval '2 hours');

    -- Transcrição
    txt := replace(replace(replace(t_open[1 + (i % 3)], '%V', seller_first_n), '%L', lead_first), '%C', hero_company[i]);
    FOREACH line IN ARRAY t_disc LOOP txt := txt || E'\n\n' || replace(replace(replace(line, '%V', seller_first_n), '%L', lead_first), '%C', hero_company[i]); END LOOP;
    IF i <> 4 THEN FOREACH line IN ARRAY t_pres LOOP txt := txt || E'\n\n' || replace(replace(replace(line, '%V', seller_first_n), '%L', lead_first), '%C', hero_company[i]); END LOOP;
    ELSE txt := txt || E'\n\n' || seller_first_n || ': Deixa eu te mostrar o método inteiro então. Primeiro a pesquisa, depois a recompensa, a mecânica, a página do programa, os fluxos de comunicação... (12 minutos de apresentação)' || E'\n\n' || lead_first || ': Entendi. Vou ver com a doutora e te retorno.'; END IF;
    FOR k IN 1..4 LOOP txt := txt || E'\n\n' || replace(replace(replace(t_close[1 + ((i + k) % 8)], '%V', seller_first_n), '%L', lead_first), '%C', hero_company[i]); END LOOP;
    INSERT INTO public.transcriptions (org_id, meeting_id, full_text, language, speakers)
    VALUES (v_org, m_id, txt, 'pt-BR', jsonb_build_array(jsonb_build_object('label', seller_first_n, 'role', 'vendedor'), jsonb_build_object('label', lead_first, 'role', 'lead')));

    -- Destaques
    INSERT INTO public.highlights (org_id, meeting_id, highlight_type, text, speaker) VALUES
      (v_org, m_id, 'sinal_compra', CASE i WHEN 1 THEN 'Manda a proposta ainda essa semana.' WHEN 4 THEN 'Vou ver com a doutora e te retorno.' ELSE h_buy[1 + (i % 6)] END, 'lead'),
      (v_org, m_id, 'objecao', CASE i WHEN 1 THEN 'A gente já tentou um programa de indicação com desconto e ninguém usou.' ELSE h_obj[1 + (i % 6)] END, 'lead'),
      (v_org, m_id, 'momento_chave', CASE i WHEN 1 THEN 'Lead revelou que 25% dos pacientes já chegam por indicação, sem nenhum estímulo.' ELSE h_key[1 + (i % 6)] END, 'lead');

    -- Dicas ao vivo (coach na reunião)
    IF i IN (1, 2, 5, 7, 8) THEN
      INSERT INTO public.live_tips (org_id, meeting_id, categoria, urgencia, titulo, acao, emitted_at) VALUES
        (v_org, m_id, 'need', 'media', 'Dor citada: dependência de anúncio', 'Quantifique: "Quanto custa trazer um cliente novo hoje, somando mídia e time?"', m_date + interval '6 minutes'),
        (v_org, m_id, 'objecao', 'alta', 'Objeção: "já tentamos e ninguém usou"', '"O programa parou por causa da recompensa ou porque os clientes nem sabiam dele? 90% dos programas falham por falta de ativação."', m_date + interval '18 minutes'),
        (v_org, m_id, 'produto', 'media', 'Cite um case do mesmo segmento', 'Ofereça: "A Capi Hair Plus dependia 95% de mídia paga e faturou R$ 2,8 milhões ativando a própria base."', m_date + interval '19 minutes'),
        (v_org, m_id, 'budget', 'media', 'Critério Investimento ainda não coberto', '"Quanto vocês investem por mês hoje em mídia paga?"', m_date + interval '27 minutes'),
        (v_org, m_id, 'sinal_compra', 'alta', 'Sinal de compra: pediu a proposta', 'Feche o prazo: "Envio até quarta. Conseguimos fazer a sessão com o seu sócio na sexta?"', m_date + interval '39 minutes');
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

  -- Reuniões geradas: 42 em 6 meses -----------------------------------------
  FOR n IN 9..50 LOOP
    m_id := ('bf000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
    s_idx := 1 + ((n * 7 + 3) % 6);
    c_idx := 1 + ((n * 11) % 30);
    l_idx := 1 + ((n * 13 + 5) % 30);
    t_idx := 1 + ((n * 5 + s_idx) % 4);
    m_date := date_trunc('day', now()) - ((170 - ((n - 9) * 4) - (n % 3)) || ' days')::interval + interval '9 hours' + ((n * 53) % 480 || ' minutes')::interval;
    IF extract(isodow FROM m_date) > 5 THEN m_date := m_date - interval '2 days'; END IF;
    months := extract(epoch FROM (now() - m_date)) / 2592000.0;
    base := seller_base[s_idx] - seller_trend[s_idx] * months;
    lead_first := split_part(leads[l_idx], ' ', 1); seller_first_n := seller_first[s_idx];
    dur := 900 + floor(random() * 1500)::int;

    -- Uma reunião em processamento, uma com erro, uma recém-enviada.
    IF n = 50 THEN
      INSERT INTO public.meetings (id, org_id, title, seller_id, status, meeting_type, meeting_date, lead_name, lead_company, duration_seconds, file_type, created_at, updated_at)
      VALUES (m_id, v_org, mtype_lbl[t_idx] || ' · ' || companies[c_idx], seller[s_idx], 'transcrevendo', mtypes[t_idx], now() - interval '25 minutes', leads[l_idx], companies[c_idx], dur, 'webm', now() - interval '20 minutes', now() - interval '2 minutes');
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
    temp_reason := attended || ' de 4 critérios atendidos' ||
      CASE attended WHEN 0 THEN '.' ELSE ': ' || array_to_string(ARRAY(SELECT x FROM unnest(ARRAY[CASE WHEN sb>=15 THEN 'Investimento' END, CASE WHEN sa>=15 THEN 'Decisor' END, CASE WHEN sn>=15 THEN 'Dor de aquisição' END, CASE WHEN st>=15 THEN 'Momento' END]) x WHERE x IS NOT NULL), ', ') || '.' END;

    INSERT INTO public.meetings (id, org_id, title, seller_id, team_id, status, meeting_type, meeting_date, lead_name, lead_company, lead_email, duration_seconds, overall_score, temperature, created_at, updated_at)
    VALUES (m_id, v_org, mtype_lbl[t_idx] || ' · ' || companies[c_idx], seller[s_idx], CASE WHEN s_idx IN (1,3,5) THEN v_team_smb ELSE v_team_ent END, 'completo', mtypes[t_idx], m_date,
            leads[l_idx], companies[c_idx], lower(translate(lead_first, 'çãáéíóúâêô', 'caaeiouaeo')) || '@' || lower(regexp_replace(translate(companies[c_idx], 'çãáéíóúâêôÇÃÁÉÍÓÚÂÊÔ ', 'caaeiouaeoCAAEIOUAEO'), '[^A-Za-z]', '', 'g')) || '.com.br',
            dur, overall, temp, m_date + interval '2 hours', m_date + interval '2 hours');

    bant := jsonb_build_object(
      'budget',    jsonb_build_object('score', sb, 'reason', CASE WHEN sb>=15 THEN r_budget_ok[1 + (n % 3)] ELSE r_budget_no[1 + (n % 3)] END),
      'authority', jsonb_build_object('score', sa, 'reason', CASE WHEN sa>=15 THEN r_auth_ok[1 + (n % 3)] ELSE r_auth_no[1 + (n % 3)] END),
      'need',      jsonb_build_object('score', sn, 'reason', CASE WHEN sn>=15 THEN r_need_ok[1 + (n % 3)] ELSE r_need_no[1 + (n % 3)] END),
      'timeline',  jsonb_build_object('score', st, 'reason', CASE WHEN st>=15 THEN r_time_ok[1 + (n % 3)] ELSE r_time_no[1 + (n % 3)] END));
    meddic := jsonb_build_object(
      'metrics', jsonb_build_object('score', LEAST(17, 5 + overall / 7), 'reason', 'CAC e investimento em mídia citados pelo lead.'),
      'economic_buyer', jsonb_build_object('score', sa * 17 / 25, 'reason', CASE WHEN sa >= 15 THEN 'Decisor identificado.' ELSE 'Decisor não confirmado.' END),
      'decision_criteria', jsonb_build_object('score', LEAST(17, 4 + overall / 9), 'reason', 'Critérios de decisão parcialmente mapeados.'),
      'decision_process', jsonb_build_object('score', st * 17 / 25, 'reason', CASE WHEN st >= 15 THEN 'Processo com datas.' ELSE 'Processo em aberto.' END),
      'identify_pain', jsonb_build_object('score', sn * 17 / 25, 'reason', 'Dor de aquisição identificada.'),
      'champion', jsonb_build_object('score', LEAST(17, 3 + overall / 8), 'reason', CASE WHEN overall >= 75 THEN 'Lead atua como defensor interno.' ELSE 'Sem defensor interno claro.' END));
    spin := jsonb_build_object(
      'situacao', jsonb_build_object('score', LEAST(25, 10 + overall / 6), 'reason', 'Canais de aquisição levantados.'),
      'problema', jsonb_build_object('score', sn, 'reason', 'Problemas explorados de forma ' || CASE WHEN sn >= 15 THEN 'específica.' ELSE 'genérica.' END),
      'implicacao', jsonb_build_object('score', LEAST(25, GREATEST(3, overall / 4 - 4)), 'reason', CASE WHEN overall >= 70 THEN 'Custo da dor quantificado com o CAC.' ELSE 'Faltou perguntar quanto custa um cliente hoje.' END),
      'necessidade', jsonb_build_object('score', LEAST(25, GREATEST(4, overall / 4)), 'reason', CASE WHEN overall >= 70 THEN 'Lead verbalizou o ganho esperado.' ELSE 'Necessidade de solução não verbalizada.' END));
    metrics := jsonb_build_object('total_questions', 5 + overall / 9, 'open_questions', 2 + overall / 15, 'objections_handled', (n % 3));
    ins := jsonb_build_object('positives', jsonb_build_array(pos_pool[1 + (n % 8)], pos_pool[1 + ((n + 3) % 8)]),
                              'improvements', jsonb_build_array(imp_pool[1 + (n % 8)], imp_pool[1 + ((n + 5) % 8)]),
                              'key_moments', jsonb_build_array(km_pool[1 + (n % 5)]));
    coach := jsonb_build_object('next_steps', jsonb_build_array(next_pool[1 + (n % 6)], next_pool[1 + ((n + 3) % 6)]),
                                'suggestions', jsonb_build_array(sug_pool[1 + (n % 5)]),
                                'scripts', jsonb_build_array(scr_pool[1 + (n % 4)]));
    rag := jsonb_build_object('knowledge_adherence_score', LEAST(100, 45 + overall / 2),
      'products_mentioned', CASE t_idx WHEN 1 THEN jsonb_build_array('Consultoria em Programa de Indicação') WHEN 2 THEN jsonb_build_array('Consultoria em Programa de Indicação', 'Método VPI') ELSE jsonb_build_array('Método VPI', 'Programa de Parceiros e Afiliados') END,
      'missed_opportunities', CASE WHEN n % 3 = 0 THEN jsonb_build_array('Argumento da ativação (90% dos programas falham) não usado diante do "já tentamos".') WHEN n % 3 = 1 THEN jsonb_build_array('Nenhum case do mesmo segmento foi citado.') ELSE jsonb_build_array() END,
      'cross_sell_suggestions', jsonb_build_array(CASE WHEN n % 2 = 0 THEN 'Programa de Parceiros e Afiliados' ELSE 'Enterprise Full Service' END),
      'discourse_alignment', CASE WHEN overall >= 75 THEN 'Alinhado ao Método VPI.' WHEN overall >= 55 THEN 'Alinhado, com uma promessa de prazo de lançamento sem considerar a pesquisa com clientes.' ELSE 'Explicou o método sem conectar à dor do lead.' END);
    raw := jsonb_build_object('overall_score', overall,
      'overall_score_reason', CASE WHEN overall >= 80 THEN 'Reunião bem conduzida, com qualificação completa e próximo passo definido.' WHEN overall >= 60 THEN 'Boa condução, com lacunas em ' || CASE WHEN sb < 15 THEN 'investimento' WHEN st < 15 THEN 'momento' ELSE 'decisor' END || '.' ELSE 'Pouca qualificação; a conversa ficou em explicação do método.' END,
      'temperature', temp, 'temperature_reason', temp_reason, 'bant_score', bant, 'meddic_score', meddic, 'spin_score', spin,
      'talk_ratio', jsonb_build_object('seller', talk_seller, 'lead', 100 - talk_seller), 'conversation_metrics', metrics, 'insights', ins, 'sales_coach', coach, 'rag_results', rag);

    INSERT INTO public.analysis_results (id, org_id, meeting_id, model_used, overall_score, temperature, bant_score, meddic_score, spin_score, talk_ratio, conversation_metrics, insights, sales_coach, rag_results, raw_analysis, created_at)
    VALUES (('bf100000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, v_org, m_id, 'google/gemini-2.5-pro', overall, temp, bant, meddic, spin,
            jsonb_build_object('seller', talk_seller, 'lead', 100 - talk_seller, 'reason', CASE WHEN talk_seller > 60 THEN 'Consultor falou a maior parte do tempo.' ELSE 'Proporção saudável de fala.' END),
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
        (v_org, m_id, CASE WHEN sb < 15 THEN 'budget' ELSE 'timeline' END, 'media', CASE WHEN sb < 15 THEN 'Critério Investimento ainda não coberto' ELSE 'Critério Momento ainda não coberto' END, CASE WHEN sb < 15 THEN '"Quanto vocês investem por mês hoje em mídia paga?"' ELSE '"Se lançarmos o programa em fevereiro, faz sentido para o seu calendário?"' END, m_date + interval '26 minutes');
    END IF;

    INSERT INTO public.api_usage_logs (org_id, meeting_id, operation_type, model_used, provider, quantity, unit, created_at) VALUES
      (v_org, m_id, 'transcricao', 'assemblyai/best', 'assemblyai', round(dur / 60.0), 'minutos', m_date + interval '1 hour'),
      (v_org, m_id, 'analise', 'google/gemini-2.5-pro', 'lovable', 1, 'analises', m_date + interval '2 hours');
    IF n % 3 = 0 THEN
      INSERT INTO public.api_usage_logs (org_id, meeting_id, operation_type, model_used, provider, quantity, unit, created_at)
      VALUES (v_org, m_id, 'live_coach', 'google/gemini-2.5-flash', 'lovable', 3 + (n % 4), 'chamadas', m_date + interval '40 minutes');
    END IF;
  END LOOP;

  -- Consumo do mês corrente fora das reuniões
  FOR k IN 1..22 LOOP
    INSERT INTO public.api_usage_logs (org_id, operation_type, model_used, provider, quantity, unit, input_tokens, output_tokens, created_at)
    VALUES (v_org, 'generate_arguments', 'google/gemini-2.5-pro', 'lovable', 1, 'geracoes', 3200 + k * 40, 900 + k * 12, date_trunc('month', now()) + (k * 17 || ' hours')::interval);
  END LOOP;
  FOR k IN 1..6 LOOP
    INSERT INTO public.api_usage_logs (org_id, operation_type, model_used, provider, quantity, unit, created_at)
    VALUES (v_org, 'extracao_documento', 'google/gemini-2.5-flash', 'lovable', 1, 'documentos', date_trunc('month', now()) + (k * 30 || ' hours')::interval);
  END LOOP;

  -- ── Convite do administrador ─────────────────────────────────────────────
  IF v_email_admin IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_invites
    WHERE org_id = v_org AND email = lower(v_email_admin) AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
  ) THEN
    INSERT INTO public.organization_invites (org_id, email, role) VALUES (v_org, lower(v_email_admin), 'admin');
  END IF;

  INSERT INTO public.audit_log (org_id, action, entity, metadata) VALUES (v_org, 'demo.seed', 'organization', jsonb_build_object('meetings', 50, 'sellers', 6, 'source', 'seed-base-viral.sql'));

  RAISE NOTICE 'Base Viral populada: org %', v_org;
END
$$;

-- ── Conferência e link do convite ───────────────────────────────────────────
WITH o AS (SELECT id FROM public.organizations WHERE slug = 'base-viral')
SELECT 'reuniões'        AS item, count(*)::text AS valor FROM public.meetings WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'análises',       count(*)::text FROM public.analysis_results WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'transcrições',   count(*)::text FROM public.transcriptions WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'destaques',      count(*)::text FROM public.highlights WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'dicas ao vivo',  count(*)::text FROM public.live_tips WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'consultores',    count(*)::text FROM public.profiles WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'documentos KB',  count(*)::text FROM public.knowledge_documents WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'itens KB',       count(*)::text FROM public.knowledge_items WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'dores',          count(*)::text FROM public.pain_items WHERE org_id = (SELECT id FROM o)
UNION ALL SELECT 'temperaturas',   string_agg(temperature || '=' || c, ', ' ORDER BY temperature) FROM (SELECT temperature, count(*) c FROM public.meetings WHERE org_id = (SELECT id FROM o) AND temperature IS NOT NULL GROUP BY 1) t
UNION ALL SELECT 'ranking',        string_agg(full_name || ' ' || media, ' · ' ORDER BY media DESC) FROM (SELECT p.full_name, round(avg(m.overall_score)) media FROM public.meetings m JOIN public.profiles p ON p.user_id = m.seller_id WHERE m.org_id = (SELECT id FROM o) AND m.overall_score IS NOT NULL GROUP BY 1) r
UNION ALL SELECT 'convite',        string_agg(i.email || ' → https://salescoach.grougp.com.br/convite/' || i.token, ' | ') FROM public.organization_invites i WHERE i.org_id = (SELECT id FROM o) AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now();
