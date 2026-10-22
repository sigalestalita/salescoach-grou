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
  /** Só no playbook: etapa que não pode faltar. */
  required?: boolean;
}

/** Sinal que o playbook manda detectar na conversa. */
export interface PlaybookSignal {
  key: string;
  label: string;
  description?: string;
  tipo: "risco" | "oportunidade" | "atencao";
}

/**
 * Playbook de atendimento (analysis_templates.playbook). As etapas ficam em
 * qualification_criteria e as faixas de saúde em temperature_levels.
 */
export interface Playbook {
  objetivo?: string;
  boas_praticas?: string[];
  evitar?: string[];
  sinais?: PlaybookSignal[];
  campos?: { key: string; label: string; description?: string }[];
  /** O time também vende nesta conversa (upsell, cross-sell, renovação com proposta). */
  expansao_comercial?: boolean;
}

export type TemplateMode = "vendas" | "playbook";

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
  mode: TemplateMode;
  playbook: Playbook | null;
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
  mode: "vendas",
  playbook: null,
};

/**
 * Metodologia da organização. Com `meetingTypeKey`, usa a metodologia ligada
 * àquele tipo de reunião (meeting_types.analysis_template_id); sem ligação,
 * ou sem tipo, a padrão da organização; sem nada configurado, o BANT neutro.
 */
export async function loadTemplate(
  admin: SupabaseClient,
  orgId: string,
  meetingTypeKey: string | null = null,
): Promise<AnalysisTemplate> {
  let data = null;
  if (meetingTypeKey) {
    const { data: type } = await admin
      .from("meeting_types")
      .select("analysis_template_id")
      .eq("org_id", orgId)
      .eq("key", meetingTypeKey)
      .maybeSingle();
    if (type?.analysis_template_id) {
      ({ data } = await admin
        .from("analysis_templates")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", type.analysis_template_id)
        .maybeSingle());
    }
  }
  if (!data) {
    ({ data } = await admin
      .from("analysis_templates")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_default", true)
      .maybeSingle());
  }

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
    mode: data.mode === "playbook" ? "playbook" : "vendas",
    playbook: data.mode === "playbook" ? normalizePlaybook(data.playbook) : null,
  };
}

const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown, max = 20) =>
  (Array.isArray(v) ? v : []).map((x) => str(x, 300)).filter(Boolean).slice(0, max);

/** Lê o JSON do playbook guardado no banco, descartando o que vier torto. */
export function normalizePlaybook(raw: unknown): Playbook {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sinais = (Array.isArray(p.sinais) ? p.sinais : [])
    .map((x: Record<string, unknown>) => ({
      key: str(x?.key, 40), label: str(x?.label, 80), description: str(x?.description, 300),
      tipo: (["risco", "oportunidade", "atencao"].includes(x?.tipo as string) ? x.tipo : "atencao") as PlaybookSignal["tipo"],
    }))
    .filter((x) => x.key && x.label)
    .slice(0, 20);
  const campos = (Array.isArray(p.campos) ? p.campos : [])
    .map((x: Record<string, unknown>) => ({ key: str(x?.key, 40), label: str(x?.label, 80), description: str(x?.description, 300) }))
    .filter((x) => x.key && x.label)
    .slice(0, 20);
  return {
    objetivo: str(p.objetivo, 1200),
    boas_praticas: strList(p.boas_praticas),
    evitar: strList(p.evitar),
    sinais,
    campos,
    expansao_comercial: p.expansao_comercial === true,
  };
}

/**
 * Resumo da metodologia guardado em analysis_results.methodology: as telas
 * mostram os critérios com que a reunião foi avaliada, mesmo que a empresa
 * mude de metodologia depois.
 */
export function methodologySnapshot(t: AnalysisTemplate) {
  const playbook = t.mode === "playbook";
  return {
    id: t.id,
    key: t.methodology_key,
    label: t.methodology_label,
    mode: t.mode,
    criteria: t.qualification_criteria.map((c) => ({
      key: c.key, label: c.label, max_score: c.max_score ?? 25, ...(playbook && c.required ? { required: true } : {}),
    })),
    // As faixas (de temperatura ou de saúde) também ficam guardadas: a tela
    // mostra o rótulo certo mesmo quando a reunião não usa a metodologia padrão.
    levels: t.temperature_levels.map((l) => ({ key: l.key, label: l.label })),
    frameworks: {
      meddic: !playbook && t.frameworks.meddic !== false,
      spin: !playbook && t.frameworks.spin !== false,
      talk_ratio: t.frameworks.talk_ratio !== false,
    },
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
  /** Data da reunião (AAAA-MM-DD), para a IA converter "sexta que vem" em data. */
  meetingDate?: string | null;
  /**
   * Só no modo de treino: em que fase da relação a conversa aconteceu e o
   * que conta como boa condução ali. Sem isso, uma conversa de pós-venda é
   * avaliada com a régua de prospecção e perde ponto por não ter perguntado
   * orçamento a quem já é cliente.
   */
  scenarioContext?: string | null;
}

export function buildAnalysisPrompt(input: PromptInput): string {
  if (input.template.mode === "playbook") return buildPlaybookPrompt(input);
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
- Data da reunião: ${input.meetingDate || "não informada"}
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
  "sales_coach": { "next_steps": ["..."], "next_step_date": "<AAAA-MM-DD do próximo passo combinado com o lead, calculada a partir da data da reunião; null se nenhuma data foi combinada>", "suggestions": ["..."], "scripts": ["..."] },
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

/** Persona de sistema da chamada de análise, conforme o modo do template. */
export function analysisSystemMessage(t: AnalysisTemplate): string {
  return t.mode === "playbook"
    ? "Você é um especialista em atendimento e sucesso do cliente. Responda APENAS com JSON válido, sem markdown."
    : "Você é um analista de vendas B2B experiente. Responda APENAS com JSON válido, sem markdown.";
}

/**
 * Prompt da análise por playbook: em vez de qualificar uma venda, mede o
 * quanto a pessoa do atendimento seguiu o playbook da empresa, a saúde do
 * cliente e os sinais que o playbook manda detectar.
 */
export function buildPlaybookPrompt(input: PromptInput): string {
  const t = input.template;
  const p = t.playbook ?? {};
  const etapas = t.qualification_criteria;
  const total = etapas.reduce((s, e) => s + (e.max_score ?? 0), 0) || 100;
  const levelKeys = t.temperature_levels.map((l) => l.key).join("|");
  const hasKnowledge = input.knowledgeContext.trim().length > 0;

  const etapasStr = etapas
    .map((e) => `- ${e.key} (peso ${e.max_score ?? 0}${e.required ? ", obrigatória" : ""}): ${e.label}${e.description ? ` — ${e.description}` : ""}`)
    .join("\n");
  const sinaisStr = (p.sinais ?? [])
    .map((s) => `- ${s.key} [${s.tipo}]: ${s.label}${s.description ? ` — ${s.description}` : ""}`)
    .join("\n");
  const camposStr = (p.campos ?? [])
    .map((c) => `- ${c.key}: ${c.label}${c.description ? ` — ${c.description}` : ""}`)
    .join("\n");
  const lista = (xs: string[] | undefined) => (xs ?? []).map((x) => `- ${x}`).join("\n");
  const extra = t.extra_instructions?.trim() ? `\n\nREGRAS ESPECÍFICAS DESTA OPERAÇÃO:\n${t.extra_instructions.trim()}` : "";
  const talkRatio = t.frameworks.talk_ratio !== false
    ? `\n  "talk_ratio": { "seller": <0-100, fala de quem atende>, "lead": <0-100, fala do cliente>, "reason": "<justificativa>" },`
    : "";

  return `${t.persona} Analise a transcrição abaixo de uma conversa de atendimento com um cliente, seguindo o playbook "${t.methodology_label}" da empresa, e retorne uma análise estruturada. ${p.expansao_comercial
    ? "O time de atendimento também é responsável por expansão nesta carteira (upsell e cross-sell): avalie a condução pelo playbook e, se houve oferta, se ela veio no momento certo, ligada a uma necessidade dita pelo cliente, e se produtos, preços e condições citados batem com a base de conhecimento. Não avalie como qualificação de lead novo."
    : "Não é uma reunião de venda: não avalie qualificação comercial, avalie a condução do atendimento pelo playbook."}

TRANSCRIÇÃO:
${input.transcript}

CONTEXTO:
- Cliente atendido: ${input.leadName || "desconhecido"} da empresa ${input.leadCompany || "desconhecida"}
- Título da reunião: ${input.meetingTitle}
- Tipo de reunião: ${input.meetingTypeLabel || "não especificado"}
- Data da reunião: ${input.meetingDate || "não informada"}
${input.meetingTypeContext}${input.scenarioContext ? `
${input.scenarioContext}
` : ""}${hasKnowledge ? `
BASE DE CONHECIMENTO DA EMPRESA (produtos, processos e políticas; use para checar se as respostas dadas ao cliente estão corretas):
${input.knowledgeContext}
` : ""}
PLAYBOOK "${t.methodology_label}"
${p.objetivo ? `Objetivo da conversa: ${p.objetivo}\n` : ""}
ETAPAS DO PLAYBOOK (a soma dos pesos é ${total}):
${etapasStr || "(nenhuma)"}
${p.boas_praticas?.length ? `\nBOAS PRÁTICAS ESPERADAS:\n${lista(p.boas_praticas)}\n` : ""}${p.evitar?.length ? `\nO QUE NÃO PODE ACONTECER:\n${lista(p.evitar)}\n` : ""}${sinaisStr ? `\nSINAIS A DETECTAR NA FALA DO CLIENTE:\n${sinaisStr}\n` : ""}${camposStr ? `\nINFORMAÇÕES A REGISTRAR (se aparecerem na conversa):\n${camposStr}\n` : ""}
A saúde do cliente DEVE ser classificada em uma das faixas abaixo, usando EXATAMENTE estes valores:
${temperatureList(t.temperature_levels)}

RETORNE um JSON com EXATAMENTE esta estrutura (sem markdown, apenas JSON puro):
{
  "overall_score": <0 a 100: aderência ao playbook, a soma dos pontos das etapas convertida para 100>,
  "overall_score_reason": "<1-2 frases: o que puxou a aderência para cima e para baixo>",
  "temperature": "<${levelKeys}>",
  "temperature_reason": "<1-2 frases justificando a saúde do cliente pelo que ele disse>",
  "bant_score": { ${etapas.map((e) => `"${e.key}": { "score": <0-${e.max_score ?? 0}>, "reason": "<o que foi feito ou faltou nesta etapa>" }`).join(", ")} },${talkRatio}
  "conversation_metrics": { "total_questions": <número>, "open_questions": <número>, "objections_handled": <número de reclamações ou objeções tratadas> },
  "insights": { "positives": ["..."], "improvements": ["..."], "key_moments": ["..."] },
  "sales_coach": { "next_steps": ["..."], "next_step_date": "<AAAA-MM-DD do próximo passo combinado com o cliente, calculada a partir da data da reunião; null se nenhuma data foi combinada>", "suggestions": ["<como conduzir melhor da próxima vez, ligado ao playbook>"], "scripts": ["<frases prontas para a próxima conversa>"] },
  "highlights": [{ "type": "<risco|oportunidade|reclamacao|elogio|pedido|compromisso|momento_chave>", "text": "...", "speaker": "<atendente|cliente>" }],
  "playbook": {
    "etapas": [{ "key": "<key da etapa>", "status": "<cumprida|parcial|nao_cumprida|nao_se_aplica>", "evidencia": "<trecho ou fato da conversa que mostra isso>" }],
    "boas_praticas": [{ "label": "<boa prática>", "ok": <true|false>, "evidencia": "<...>" }],
    "evitar": [{ "label": "<item a evitar>", "ocorreu": <true|false>, "evidencia": "<...>" }],
    "sinais": [{ "key": "<key do sinal>", "label": "<rótulo do sinal, como no playbook>", "tipo": "<risco|oportunidade|atencao>", "detectado": <true|false>, "evidencia": "<o que o cliente disse>" }],
    "campos": { ${(p.campos ?? []).map((c) => `"${c.key}": "<valor dito na conversa ou null>"`).join(", ")} },
    "sentimento_cliente": "<como o cliente saiu da conversa, em 1 frase>",
    "pendencias": ["<o que ficou em aberto para o cliente>"],
    "compromissos": [{ "quem": "<cliente|time>", "o_que": "<...>", "prazo": "<AAAA-MM-DD ou null>" }]
  },
  "meeting_summary": {
    "company_name": "<empresa do cliente, se mencionada>",
    "participants": [{ "name": "<nome>", "role": "<cargo/função>" }],
    "identified_pains": ["<problemas, dúvidas ou reclamações do cliente>"],
    "products_presented": ["<produtos, módulos ou funcionalidades discutidos>"]
  },
  "rag_results": ${hasKnowledge ? `{ "knowledge_adherence_score": <0-100: o quanto as respostas dadas batem com a base>, "products_mentioned": ["..."], "missed_opportunities": ["<informação da base que teria resolvido algo e não foi usada>"], "cross_sell_suggestions": ["<oportunidade de expansão, só se o cliente deu abertura>"], "discourse_alignment": "..." }` : "null"}
}

IMPORTANTE:
- Avalie cada etapa pelo que a pessoa do time fez (ou não) na conversa. Etapa que não fazia sentido nesta conversa: "nao_se_aplica" e pontuação cheia.
- Etapa obrigatória "nao_cumprida" puxa a aderência para baixo e deve aparecer em "improvements".
- Liste em "playbook.sinais" TODOS os sinais do playbook, detectados ou não; "detectado": true só com evidência na fala do cliente.
- Se a transcrição só tiver um dos lados da conversa, diga isso em "overall_score_reason" e não invente o que o outro lado disse.
- Responda no idioma ${t.output_language}.${extra}

Seja específico e use a conversa como evidência.`;
}

export type KnowledgeArea = "vendas" | "atendimento";

/**
 * De qual área da base de conhecimento a conversa usa os documentos (além dos
 * marcados como "ambos"). Playbook com expansão comercial usa tudo: o CS que
 * faz upsell e cross-sell precisa dos materiais de venda (preço, portfólio).
 */
export function knowledgeAreaFor(t: Pick<AnalysisTemplate, "mode" | "playbook"> | null | undefined): KnowledgeArea | null {
  if (t?.mode !== "playbook") return "vendas";
  return t.playbook?.expansao_comercial ? null : "atendimento";
}

/** Se um documento entra para a área pedida (null = todas). */
export function docMatchesArea(docArea: string | null | undefined, area: KnowledgeArea | null): boolean {
  return area === null || !docArea || docArea === "ambos" || docArea === area;
}

/**
 * Contexto da base de conhecimento, sempre restrito à organização. Com
 * `area`, só os documentos daquela área e os marcados como "ambos".
 */
export async function fetchKnowledgeContext(
  admin: SupabaseClient,
  orgId: string,
  area: KnowledgeArea | null = null,
): Promise<string> {
  // Só os 2.000 primeiros caracteres de cada documento vão para o prompt: o corte
  // é feito no banco (knowledge_docs_preview), sem baixar documentos inteiros,
  // que com PDFs grandes estouravam memória/CPU da função. Sem a migração, cai
  // na consulta antiga.
  const preview = async () => {
    const r = await admin.rpc("knowledge_docs_preview", { _org_id: orgId, _chars: 2000, _area: area });
    if (!r.error) return { data: (r.data ?? []) as { title: string; category: string | null; extracted_content: string | null }[] };
    // Sem a migração da área (coluna e RPC novas), cai na consulta antiga, sem filtro.
    const { data } = await admin.from("knowledge_documents").select("title, category, extracted_content")
      .eq("org_id", orgId).not("extracted_content", "is", null);
    return { data: data ?? [] };
  };
  const [docsRes, itemsRes] = await Promise.all([
    preview().then(({ data }) => ({ data: data.map((d) => ({ ...d, extracted_content: (d as { preview?: string }).preview ?? d.extracted_content })) })),
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
