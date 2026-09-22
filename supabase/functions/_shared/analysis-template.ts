// Montagem do prompt de análise a partir do template da organização.
//
// O backend não conhece nenhuma metodologia de vendas: ele lê os critérios, as
// faixas de temperatura e as regras do template do cliente e monta o prompt.
// Uma organização sem template configurado usa o padrão neutro abaixo (BANT).

import { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

export interface QualificationCriterion {
  key: string;
  label: string;
  description?: string;
  max_score?: number;
}

export interface TemperatureLevel {
  key: string;
  label: string;
  criteria: string;
}

export interface AnalysisTemplate {
  id: string | null;
  name: string;
  persona: string;
  methodology_key: string;
  methodology_label: string;
  qualification_criteria: QualificationCriterion[];
  temperature_levels: TemperatureLevel[];
  frameworks: { meddic?: boolean; spin?: boolean; talk_ratio?: boolean };
  extra_instructions: string | null;
  output_language: string;
}

/** Padrão de plataforma, usado quando a organização não configurou nada. */
export const DEFAULT_TEMPLATE: AnalysisTemplate = {
  id: null,
  name: "Metodologia padrão",
  persona: "Você é um especialista em vendas B2B.",
  methodology_key: "BANT",
  methodology_label: "BANT",
  qualification_criteria: [
    { key: "budget", label: "Budget", description: "Orçamento disponível e confirmado", max_score: 25 },
    { key: "authority", label: "Authority", description: "Acesso ao decisor econômico", max_score: 25 },
    { key: "need", label: "Need", description: "Dor reconhecida e priorizada", max_score: 25 },
    { key: "timeline", label: "Timeline", description: "Janela de decisão definida", max_score: 25 },
  ],
  temperature_levels: [
    { key: "congelado", label: "Congelado", criteria: "Nenhum critério atendido. Sem perfil para o negócio." },
    { key: "frio", label: "Frio", criteria: "1 critério atendido. Precisa de nutrição." },
    { key: "morno", label: "Morno", criteria: "2 critérios atendidos. Necessidade identificada, qualificação incompleta." },
    { key: "quente", label: "Quente", criteria: "3 critérios atendidos. Oportunidade real com alguma ressalva." },
    { key: "muito_quente", label: "Muito quente", criteria: "Todos os critérios atendidos e próximo passo acordado." },
  ],
  frameworks: { meddic: true, spin: true, talk_ratio: true },
  extra_instructions: null,
  output_language: "pt-BR",
};

export async function loadTemplate(
  admin: SupabaseClient,
  orgId: string,
): Promise<AnalysisTemplate> {
  const { data } = await admin
    .from("analysis_templates")
    .select("*")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .maybeSingle();

  if (!data) return DEFAULT_TEMPLATE;

  const criteria = Array.isArray(data.qualification_criteria) ? data.qualification_criteria : [];
  const levels = Array.isArray(data.temperature_levels) ? data.temperature_levels : [];

  return {
    id: data.id,
    name: data.name,
    persona: data.persona || DEFAULT_TEMPLATE.persona,
    methodology_key: data.methodology_key || DEFAULT_TEMPLATE.methodology_key,
    methodology_label: data.methodology_label || data.methodology_key || DEFAULT_TEMPLATE.methodology_label,
    qualification_criteria: criteria.length ? criteria : DEFAULT_TEMPLATE.qualification_criteria,
    temperature_levels: levels.length ? levels : DEFAULT_TEMPLATE.temperature_levels,
    frameworks: data.frameworks ?? DEFAULT_TEMPLATE.frameworks,
    extra_instructions: data.extra_instructions ?? null,
    output_language: data.output_language || "pt-BR",
  };
}

/** Contexto extra do tipo de reunião, configurado por organização. */
export async function loadMeetingTypeContext(
  admin: SupabaseClient,
  orgId: string,
  meetingTypeKey: string | null,
): Promise<string> {
  if (!meetingTypeKey) return "";
  const { data } = await admin
    .from("meeting_types")
    .select("prompt_context")
    .eq("org_id", orgId)
    .eq("key", meetingTypeKey)
    .maybeSingle();
  return data?.prompt_context ? `\n${data.prompt_context}\n` : "";
}

function criteriaSchema(criteria: QualificationCriterion[]): string {
  return criteria
    .map((c) => `"${c.key}": { "score": <0-${c.max_score ?? 25}>, "reason": "<justificativa>" }`)
    .join(", ");
}

function criteriaList(criteria: QualificationCriterion[]): string {
  return criteria
    .map((c) => `- ${c.label}${c.description ? `: ${c.description}` : ""}`)
    .join("\n");
}

function temperatureList(levels: TemperatureLevel[]): string {
  return levels.map((l) => `- "${l.key}": ${l.criteria}`).join("\n");
}

export interface PromptInput {
  template: AnalysisTemplate;
  transcript: string;
  meetingTitle: string;
  meetingTypeLabel: string | null;
  meetingTypeContext: string;
  leadName: string | null;
  leadCompany: string | null;
  knowledgeContext: string;
  /**
   * Só no modo de treino: em que fase da relação a conversa aconteceu e o
   * que conta como boa condução ali. Sem isso, uma conversa de pós-venda é
   * avaliada com a régua de prospecção e perde ponto por não ter perguntado
   * orçamento a quem já é cliente.
   */
  scenarioContext?: string | null;
}

export function buildAnalysisPrompt(input: PromptInput): string {
  const t = input.template;
  const hasKnowledge = input.knowledgeContext.trim().length > 0;
  const criteriaCount = t.qualification_criteria.length;
  const levelKeys = t.temperature_levels.map((l) => l.key).join("|");

  const knowledgeSection = hasKnowledge
    ? `\nBASE DE CONHECIMENTO DA EMPRESA:
${input.knowledgeContext}

INSTRUÇÕES ADICIONAIS SOBRE A BASE DE CONHECIMENTO:
- Use a base de conhecimento acima para validar se o vendedor mencionou corretamente os produtos, serviços e diferenciais da empresa.
- Identifique oportunidades de cross-sell e upsell com base nos produtos/serviços disponíveis na base.
- Avalie a aderência do discurso comercial aos materiais e argumentos da base de conhecimento.
- No campo "rag_results" do JSON, inclua sua análise sobre o uso da base de conhecimento.\n`
    : "";

  const meddicBlock = t.frameworks.meddic !== false
    ? `\n  "meddic_score": { "metrics": { "score": <0-17>, "reason": "<justificativa>" }, "economic_buyer": { "score": <0-17>, "reason": "<justificativa>" }, "decision_criteria": { "score": <0-17>, "reason": "<justificativa>" }, "decision_process": { "score": <0-17>, "reason": "<justificativa>" }, "identify_pain": { "score": <0-17>, "reason": "<justificativa>" }, "champion": { "score": <0-17>, "reason": "<justificativa>" } },`
    : "";

  const spinBlock = t.frameworks.spin !== false
    ? `\n  "spin_score": { "situacao": { "score": <0-25>, "reason": "<justificativa>" }, "problema": { "score": <0-25>, "reason": "<justificativa>" }, "implicacao": { "score": <0-25>, "reason": "<justificativa>" }, "necessidade": { "score": <0-25>, "reason": "<justificativa>" } },`
    : "";

  const talkRatioBlock = t.frameworks.talk_ratio !== false
    ? `\n  "talk_ratio": { "seller": <0-100>, "lead": <0-100>, "reason": "<justificativa sobre a proporção de fala>" },`
    : "";

  const extra = t.extra_instructions?.trim()
    ? `\n\nREGRAS ESPECÍFICAS DESTA OPERAÇÃO:\n${t.extra_instructions.trim()}`
    : "";

  return `${t.persona} Analise a transcrição abaixo de uma reunião comercial e retorne uma análise estruturada.

TRANSCRIÇÃO:
${input.transcript}

CONTEXTO:
- Vendedor está conversando com o lead: ${input.leadName || "desconhecido"} da empresa ${input.leadCompany || "desconhecida"}
- Título da reunião: ${input.meetingTitle}
- Tipo de reunião: ${input.meetingTypeLabel || "não especificado"}
${input.meetingTypeContext}${input.scenarioContext ? `
${input.scenarioContext}
` : ""}${knowledgeSection}

CRITÉRIOS OBRIGATÓRIOS PARA CLASSIFICAÇÃO DE TEMPERATURA (metodologia ${t.methodology_label}):

A metodologia ${t.methodology_label} tem ${criteriaCount} critério(s):
${criteriaList(t.qualification_criteria)}

A temperatura DEVE ser classificada em uma das categorias abaixo, usando EXATAMENTE estes valores:
${temperatureList(t.temperature_levels)}

RETORNE um JSON com EXATAMENTE esta estrutura (sem markdown, apenas JSON puro):
{
  "overall_score": <número de 0 a 100>,
  "overall_score_reason": "<explicação breve de 1-2 frases justificando o score geral>",
  "temperature": "<${levelKeys}>",
  "temperature_reason": "<explicação breve de 1-2 frases justificando a temperatura com base nos critérios ${t.methodology_label} acima>",
  "bant_score": { ${criteriaSchema(t.qualification_criteria)} },${meddicBlock}${spinBlock}${talkRatioBlock}
  "conversation_metrics": { "total_questions": <número>, "open_questions": <número>, "objections_handled": <número> },
  "insights": { "positives": ["..."], "improvements": ["..."], "key_moments": ["..."] },
  "sales_coach": { "next_steps": ["..."], "suggestions": ["..."], "scripts": ["..."] },
  "highlights": [{ "type": "<objecao|sinal_compra|momento_chave|dor|necessidade>", "text": "...", "speaker": "<vendedor|lead>" }],
  "meeting_summary": {
    "company_name": "<nome da empresa do lead, se mencionado>",
    "participants": [{ "name": "<nome>", "role": "<cargo/função>" }],
    "company_size": "<número de colaboradores ou porte da empresa, se mencionado>",
    "identified_pains": ["<dor 1>", "<dor 2>", "..."],
    "products_presented": ["<produto/serviço apresentado 1>", "..."],
    "proposal_value": "<valor da proposta ou descrição da proposta comercial, se mencionado>",
    "solution_pain_match": [{ "pain": "<dor identificada>", "solution": "<solução do portfólio que endereça essa dor>" }]
  },
  "rag_results": { "knowledge_adherence_score": <0-100>, "products_mentioned": ["..."], "missed_opportunities": ["..."], "cross_sell_suggestions": ["..."], "discourse_alignment": "..." }
}

IMPORTANTE:
- Para cada sub-métrica de ${t.methodology_label}${t.frameworks.meddic !== false ? ", MEDDIC" : ""}${t.frameworks.spin !== false ? " e SPIN" : ""}, inclua um objeto com "score" e "reason". A "reason" deve ser uma frase curta e específica baseada no que aconteceu (ou não) na reunião.
- A temperatura DEVE seguir rigorosamente os critérios ${t.methodology_label} listados acima (${criteriaCount} critério(s), nunca mais).
- Na justificativa da temperatura ("temperature_reason"), escreva SEMPRE no formato "X de ${criteriaCount} critérios ${t.methodology_label} atendidos" e cite quais foram atendidos.
- Responda no idioma ${t.output_language}.${extra}

Analise com profundidade. Seja específico nas sugestões.${
    hasKnowledge
      ? " Use a base de conhecimento para enriquecer sua análise e preencher o campo rag_results com detalhes."
      : " Se não houver base de conhecimento disponível, preencha rag_results como null."
  }`;
}

/** Contexto da base de conhecimento, sempre restrito à organização. */
export async function fetchKnowledgeContext(
  admin: SupabaseClient,
  orgId: string,
): Promise<string> {
  const [docsRes, itemsRes] = await Promise.all([
    admin
      .from("knowledge_documents")
      .select("title, category, extracted_content")
      .eq("org_id", orgId)
      .not("extracted_content", "is", null),
    admin
      .from("knowledge_items")
      .select("name, item_type, category, description, metadata")
      .eq("org_id", orgId),
  ]);

  const parts: string[] = [];

  if (docsRes.data && docsRes.data.length > 0) {
    parts.push("=== DOCUMENTOS DA BASE DE CONHECIMENTO ===");
    for (const doc of docsRes.data) {
      parts.push(`\n--- ${doc.title} (${doc.category || "sem categoria"}) ---`);
      parts.push(doc.extracted_content?.substring(0, 2000) || "");
    }
  }

  if (itemsRes.data && itemsRes.data.length > 0) {
    parts.push("\n=== ITENS DA BASE DE CONHECIMENTO ===");
    for (const item of itemsRes.data) {
      parts.push(`\n- ${item.name} (${item.item_type}/${item.category || "geral"}): ${item.description || ""}`);
      if (item.metadata) {
        parts.push(`  Metadata: ${JSON.stringify(item.metadata).substring(0, 500)}`);
      }
    }
  }

  return parts.join("\n");
}
