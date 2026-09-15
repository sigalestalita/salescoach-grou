-- ============================================================================
-- Backfill da instalação existente.
--
-- Move os dados que já estão no banco para dentro de uma organização e grava,
-- COMO DADO DESSA ORGANIZAÇÃO, a configuração que hoje está escrita no código:
-- metodologia de qualificação, faixas de temperatura, tipos de reunião,
-- catálogo de dores, tipos de oferta e identidade visual.
--
-- Efeito para quem já usa o sistema: nada muda. Mesmas cores, mesmo logo,
-- mesmos tipos de reunião, mesma metodologia de análise, mesmos limites
-- (nenhum). A diferença é que essa configuração deixa de ser o padrão do
-- produto e passa a ser a preferência de um cliente entre outros.
--
-- Em uma instalação sem dados anteriores esta migração não faz nada.
-- ============================================================================

DO $$
DECLARE
  -- Identificação da organização já existente nesta instalação.
  v_org_name  TEXT := 'Grou';
  v_org_slug  TEXT := 'grou';

  v_org_id    UUID;
  v_plan_id   UUID;
  v_cat_id    UUID;
  v_has_data  BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.profiles) INTO v_has_data;

  IF NOT v_has_data THEN
    RAISE NOTICE 'Nenhum dado anterior encontrado; backfill ignorado.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE org_id IS NOT NULL) THEN
    RAISE NOTICE 'Backfill já aplicado; nada a fazer.';
    RETURN;
  END IF;

  INSERT INTO public.organizations (name, slug, status)
  VALUES (v_org_name, v_org_slug, 'active')
  RETURNING id INTO v_org_id;

  -- ── Dados existentes passam a pertencer a essa organização ────────────────

  UPDATE public.teams                  SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.profiles               SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.user_roles             SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.meetings               SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.transcriptions         SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.analysis_results       SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.highlights             SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.knowledge_documents    SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.knowledge_items        SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.transcription_segments SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.live_tips              SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.api_usage_logs         SET org_id = v_org_id WHERE org_id IS NULL;

  -- Links de compartilhamento que já estão em circulação continuam válidos.
  -- Reuniões criadas a partir de agora exigem ativação explícita.
  UPDATE public.meetings
     SET share_enabled = true
   WHERE share_token IS NOT NULL AND share_enabled = false;

  -- ── Identidade visual atual ───────────────────────────────────────────────

  INSERT INTO public.organization_branding (
    org_id, product_name, primary_hsl, primary_fg_hsl, accent_hsl, sidebar_hsl,
    login_headline, login_subheadline
  ) VALUES (
    v_org_id,
    'Sales Coach',
    '24 95% 53%',
    '0 0% 100%',
    '24 100% 55%',
    '222 47% 6%',
    'Sales Coach',
    'Análise inteligente de reuniões comerciais com IA avançada'
  );

  -- ── Preferências operacionais ─────────────────────────────────────────────

  INSERT INTO public.org_settings (org_id, argument_audiences, argument_context_fields)
  VALUES (
    v_org_id,
    '[{"key":"rh","label":"profissionais de RH"},
      {"key":"c-level","label":"decisores C-Level"},
      {"key":"gestores","label":"gestores operacionais"}]'::jsonb,
    '[{"key":"segment","label":"Segmento"},
      {"key":"companySize","label":"Tamanho da empresa","suffix":"colaboradores"},
      {"key":"hrMaturity","label":"Maturidade de RH"},
      {"key":"saleType","label":"Tipo de venda"},
      {"key":"estimatedTicket","label":"Ticket estimado"}]'::jsonb
  );

  -- ── Plano interno: sem cobrança e sem limites ─────────────────────────────

  SELECT id INTO v_plan_id FROM public.plans WHERE key = 'internal_unlimited';

  INSERT INTO public.subscriptions (org_id, plan_id, status)
  VALUES (v_org_id, v_plan_id, 'active');

  -- ── Tipos de reunião ──────────────────────────────────────────────────────

  INSERT INTO public.meeting_types (org_id, key, label, prompt_context, sort_order) VALUES
    (v_org_id, 'empresa', 'Empresa', NULL, 1),
    (v_org_id, 'consultoria', 'Consultoria',
     'CONTEXTO DE PREÇOS PARA CONSULTORIA:
- Esta é uma reunião de CONSULTORIA. Use as tabelas "Créditos PDA - Consultoria" (para clientes existentes/recargas) e "Programa de Partners" (para novos clientes) ao avaliar propostas de valor e oportunidades.
- NÃO use a tabela de Licenças PDA para empresas neste contexto.
- Créditos PDA - Consultoria = recargas para consultores já clientes.
- Programa de Partners = entrada de novos consultores com pacotes de licenças (Bronze a Safira).
- Avalie se o vendedor apresentou a faixa correta do programa com base no perfil do prospect.',
     2);

  -- ── Template de análise em uso hoje ───────────────────────────────────────

  INSERT INTO public.analysis_templates (
    org_id, name, is_default, persona,
    methodology_key, methodology_label,
    qualification_criteria, temperature_levels, frameworks, extra_instructions
  ) VALUES (
    v_org_id,
    'Metodologia padrão',
    true,
    'Você é um especialista em vendas B2B.',
    'BAN',
    'BAN',
    '[{"key":"budget","label":"Budget","description":"Orçamento disponível e confirmado","max_score":33},
      {"key":"authority","label":"Authority","description":"Acesso ao decisor econômico","max_score":33},
      {"key":"need","label":"Need","description":"Dor reconhecida, quantificada e priorizada","max_score":33}]'::jsonb,
    '[{"key":"congelado","label":"Congelado","criteria":"0-1 critério BAN. Sem perfil para o negócio (descartar)."},
      {"key":"frio","label":"Frio","criteria":"1 critério BAN atendido. Dor genérica, sem orçamento definido, sem acesso ao decisor; precisa de nutrição."},
      {"key":"morno","label":"Morno","criteria":"2 critérios BAN atendidos. Necessidade identificada, mas budget incerto OU sem acesso direto ao decisor; dor reconhecida sem priorização."},
      {"key":"quente","label":"Quente","criteria":"3 critérios BAN atendidos com alguma ressalva. Budget provável, acesso ao decisor, necessidade validada com dor reconhecida."},
      {"key":"muito_quente","label":"Muito quente","criteria":"Os 3 critérios BAN plenamente atendidos. Budget confirmado, decisor presente, dor urgente e quantificada, próximo passo de proposta acordado."}]'::jsonb,
    '{"meddic": true, "spin": true, "talk_ratio": true}'::jsonb,
    'O ciclo de venda é consultivo e complexo. NÃO use prazo/timeline/urgência temporal ("quando vai fechar", "em X dias/meses") como critério de qualificação. Avalie APENAS profundidade da dor, clareza da necessidade, orçamento e acesso ao decisor.
- A temperatura DEVE seguir rigorosamente os critérios BAN (apenas 3 critérios: Budget, Authority, Need). NUNCA considere Timeline/prazo — a metodologia é BAN, NÃO BANT. O total máximo é SEMPRE 3 critérios, nunca 4.
- Na justificativa da temperatura ("temperature_reason"), escreva SEMPRE no formato "X de 3 critérios BAN atendidos" (jamais "de 4", jamais "BANT") e cite quais foram atendidos entre Budget, Authority e Need. É PROIBIDO mencionar a letra T, a palavra "Timeline", a sigla "BANT" ou qualquer janela de tempo (dias, meses, prazos, urgência temporal).
- Em "decision_process" do MEDDIC, foque apenas no fluxo de aprovação e steps, SEM estimar prazos.'
  );

  -- ── Tipos de oferta do gerador de argumentos ──────────────────────────────

  INSERT INTO public.offer_types (org_id, key, label, instructions, allows_item_selection, sort_order) VALUES
    (v_org_id, 'pda', 'Licença PDA',
     'FOCO EXCLUSIVO: Licença PDA (Personal Development Analysis).
Todos os argumentos devem girar em torno do produto PDA: assessment comportamental, licença PDA, ROI de mapeamento de perfis, assertividade em contratação e desenvolvimento.
NÃO mencione serviços de consultoria ou treinamento — foque apenas no produto/licença.',
     false, 1),
    (v_org_id, 'servicos', 'Serviços e Treinamentos',
     'FOCO EXCLUSIVO: Serviços e Treinamentos.
Todos os argumentos devem girar em torno dos serviços oferecidos (consultorias, treinamentos, diagnósticos comportamentais, workshops).
NÃO foque no produto PDA como licença — foque nos serviços que geram valor com a metodologia.',
     true, 2),
    (v_org_id, 'ambos', 'Licença PDA + Serviços',
     'FOCO: Licença PDA + Serviços combinados.
Gere argumentos que cubram tanto o produto PDA (assessment, licença PDA) quanto os serviços complementares (consultorias, treinamentos, diagnósticos).',
     true, 3);

  -- ── Catálogo de dores do gerador de argumentos ────────────────────────────

  INSERT INTO public.pain_categories (org_id, label, icon, sort_order)
  VALUES (v_org_id, 'Pessoas & Turnover', 'Users', 1) RETURNING id INTO v_cat_id;
  INSERT INTO public.pain_items (org_id, category_id, label, sort_order) VALUES
    (v_org_id, v_cat_id, 'Alto turnover', 1),
    (v_org_id, v_cat_id, 'Baixa retenção de talentos', 2),
    (v_org_id, v_cat_id, 'Contratações erradas (fit comportamental inadequado)', 3),
    (v_org_id, v_cat_id, 'Falta de plano de desenvolvimento individual (PDI)', 4),
    (v_org_id, v_cat_id, 'Baixo engajamento do time', 5);

  INSERT INTO public.pain_categories (org_id, label, icon, sort_order)
  VALUES (v_org_id, 'Recrutamento & Seleção', 'Clock', 2) RETURNING id INTO v_cat_id;
  INSERT INTO public.pain_items (org_id, category_id, label, sort_order) VALUES
    (v_org_id, v_cat_id, 'Tempo elevado de contratação (time-to-hire alto)', 1),
    (v_org_id, v_cat_id, 'Alto custo por contratação', 2),
    (v_org_id, v_cat_id, 'Baixa assertividade nos processos seletivos', 3),
    (v_org_id, v_cat_id, 'Excesso de retrabalho em seleção', 4),
    (v_org_id, v_cat_id, 'Falta de critérios objetivos para contratação', 5);

  INSERT INTO public.pain_categories (org_id, label, icon, sort_order)
  VALUES (v_org_id, 'Performance & Produtividade', 'BarChart3', 3) RETURNING id INTO v_cat_id;
  INSERT INTO public.pain_items (org_id, category_id, label, sort_order) VALUES
    (v_org_id, v_cat_id, 'Baixa produtividade dos times', 1),
    (v_org_id, v_cat_id, 'Falta de clareza de perfil ideal por função', 2),
    (v_org_id, v_cat_id, 'Equipes desalinhadas com as demandas do negócio', 3),
    (v_org_id, v_cat_id, 'Dificuldade em montar times de alta performance', 4),
    (v_org_id, v_cat_id, 'Baixa previsibilidade de performance', 5);

  INSERT INTO public.pain_categories (org_id, label, icon, sort_order)
  VALUES (v_org_id, 'Custos & Eficiência Operacional', 'DollarSign', 4) RETURNING id INTO v_cat_id;
  INSERT INTO public.pain_items (org_id, category_id, label, sort_order) VALUES
    (v_org_id, v_cat_id, 'Alto custo operacional em RH', 1),
    (v_org_id, v_cat_id, 'Processos manuais e pouco escaláveis', 2),
    (v_org_id, v_cat_id, 'Falta de dados para tomada de decisão', 3),
    (v_org_id, v_cat_id, 'Baixa eficiência em gestão de pessoas', 4),
    (v_org_id, v_cat_id, 'Desperdício de investimento em contratações erradas', 5);

  INSERT INTO public.pain_categories (org_id, label, icon, sort_order)
  VALUES (v_org_id, 'Liderança & Gestão', 'Brain', 5) RETURNING id INTO v_cat_id;
  INSERT INTO public.pain_items (org_id, category_id, label, sort_order) VALUES
    (v_org_id, v_cat_id, 'Líderes despreparados para gerir pessoas', 1),
    (v_org_id, v_cat_id, 'Falta de inteligência comportamental na gestão', 2),
    (v_org_id, v_cat_id, 'Dificuldade em dar feedbacks eficazes', 3),
    (v_org_id, v_cat_id, 'Conflitos internos recorrentes', 4),
    (v_org_id, v_cat_id, 'Falta de visão estratégica sobre o time', 5);

  INSERT INTO public.pain_categories (org_id, label, icon, sort_order)
  VALUES (v_org_id, 'Crescimento & Escala', 'TrendingUp', 6) RETURNING id INTO v_cat_id;
  INSERT INTO public.pain_items (org_id, category_id, label, sort_order) VALUES
    (v_org_id, v_cat_id, 'Crescimento desorganizado do time', 1),
    (v_org_id, v_cat_id, 'Dificuldade em escalar cultura', 2),
    (v_org_id, v_cat_id, 'Falta de padronização nos processos de pessoas', 3),
    (v_org_id, v_cat_id, 'Risco ao crescer sem estrutura de RH madura', 4);

  RAISE NOTICE 'Backfill concluído para a organização % (%).', v_org_name, v_org_id;
END
$$;
