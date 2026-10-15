import type { OrgConfig, QualificationCriterion } from "@/hooks/useOrgConfig";

/**
 * Metodologias de qualificação: modelos prontos para começar e a leitura da
 * metodologia com que cada análise foi feita.
 */

export interface MethodologyPreset {
  id: string;
  label: string;
  summary: string;
  criteria: { key: string; label: string; description: string; max_score: number }[];
}

/**
 * Faixas de temperatura genéricas, válidas para qualquer metodologia: contam
 * quantos critérios a reunião cobriu.
 */
export const PRESET_LEVELS = [
  { key: "congelado", label: "Congelado", criteria: "Nenhum critério atendido. Sem perfil para o negócio." },
  { key: "frio", label: "Frio", criteria: "Poucos critérios atendidos. Precisa de nutrição." },
  { key: "morno", label: "Morno", criteria: "Cerca de metade dos critérios atendidos. Interesse real, qualificação incompleta." },
  { key: "quente", label: "Quente", criteria: "A maioria dos critérios atendidos. Oportunidade real com alguma ressalva." },
  { key: "muito_quente", label: "Muito quente", criteria: "Todos os critérios atendidos e próximo passo acordado." },
];

export const METHODOLOGY_PRESETS: MethodologyPreset[] = [
  {
    id: "bant",
    label: "BANT",
    summary: "Orçamento, autoridade, necessidade e prazo. Simples, bom para SDR e primeiras reuniões.",
    criteria: [
      { key: "budget", label: "Budget", description: "Orçamento disponível e confirmado", max_score: 25 },
      { key: "authority", label: "Authority", description: "Acesso ao decisor econômico", max_score: 25 },
      { key: "need", label: "Need", description: "Dor reconhecida e priorizada", max_score: 25 },
      { key: "timeline", label: "Timeline", description: "Janela de decisão definida", max_score: 25 },
    ],
  },
  {
    id: "spiced",
    label: "SPICED",
    summary: "Situação, dor, impacto, evento crítico e decisão. Foco no impacto para o cliente; comum em SaaS.",
    criteria: [
      { key: "situacao", label: "Situação", description: "Contexto atual do cliente: processo, ferramentas, time e números", max_score: 20 },
      { key: "dor", label: "Dor", description: "Problema concreto que o cliente quer resolver", max_score: 20 },
      { key: "impacto", label: "Impacto", description: "Efeito da dor no negócio, de preferência em números", max_score: 20 },
      { key: "evento_critico", label: "Evento crítico", description: "Data ou acontecimento que obriga a decidir até um prazo", max_score: 20 },
      { key: "decisao", label: "Decisão", description: "Quem decide, critérios e processo de decisão", max_score: 20 },
    ],
  },
  {
    id: "gpctba",
    label: "GPCTBA/C&I",
    summary: "Metas, planos, desafios, prazo, orçamento, autoridade, consequências e implicações. Mais completo, para vendas consultivas.",
    criteria: [
      { key: "metas", label: "Metas", description: "Objetivos do cliente para o período", max_score: 13 },
      { key: "planos", label: "Planos", description: "Como o cliente pretende atingir as metas", max_score: 13 },
      { key: "desafios", label: "Desafios", description: "O que impede o cliente de chegar lá", max_score: 13 },
      { key: "prazo", label: "Prazo", description: "Quando o cliente precisa resolver", max_score: 13 },
      { key: "orcamento", label: "Orçamento", description: "Verba prevista para resolver", max_score: 12 },
      { key: "autoridade", label: "Autoridade", description: "Quem decide e quem influencia", max_score: 12 },
      { key: "consequencias", label: "Consequências negativas", description: "O que acontece se nada mudar", max_score: 12 },
      { key: "implicacoes", label: "Implicações positivas", description: "O que o cliente ganha se resolver", max_score: 12 },
    ],
  },
  {
    id: "anum",
    label: "ANUM",
    summary: "Autoridade, necessidade, urgência e dinheiro. Começa pelo decisor; bom para ciclos curtos.",
    criteria: [
      { key: "authority", label: "Autoridade", description: "Falando com quem decide ou tem acesso direto a ele", max_score: 25 },
      { key: "need", label: "Necessidade", description: "Necessidade clara que a solução resolve", max_score: 25 },
      { key: "urgency", label: "Urgência", description: "Prioridade e prazo para resolver", max_score: 25 },
      { key: "money", label: "Dinheiro", description: "Capacidade de investimento", max_score: 25 },
    ],
  },
  {
    id: "champ",
    label: "CHAMP",
    summary: "Desafios, autoridade, dinheiro e priorização. Começa pela dor do cliente.",
    criteria: [
      { key: "challenges", label: "Desafios", description: "Desafios do cliente que a solução resolve", max_score: 25 },
      { key: "authority", label: "Autoridade", description: "Quem decide e como é o processo", max_score: 25 },
      { key: "money", label: "Dinheiro", description: "Orçamento disponível ou possível de alocar", max_score: 25 },
      { key: "prioritization", label: "Priorização", description: "O quanto resolver isso é prioridade agora", max_score: 25 },
    ],
  },
  {
    id: "meddic",
    label: "MEDDIC",
    summary: "Métricas, decisor econômico, critérios e processo de decisão, dor e campeão. Para vendas complexas B2B.",
    criteria: [
      { key: "metrics", label: "Métricas", description: "Ganho mensurável que o cliente espera", max_score: 17 },
      { key: "economic_buyer", label: "Decisor econômico", description: "Quem libera o dinheiro, identificado e envolvido", max_score: 17 },
      { key: "decision_criteria", label: "Critérios de decisão", description: "Como o cliente vai comparar e escolher", max_score: 17 },
      { key: "decision_process", label: "Processo de decisão", description: "Etapas, pessoas e prazos até a assinatura", max_score: 17 },
      { key: "identify_pain", label: "Dor identificada", description: "Dor clara e reconhecida pelo cliente", max_score: 16 },
      { key: "champion", label: "Campeão", description: "Alguém do cliente que defende a compra internamente", max_score: 16 },
    ],
  },
  {
    id: "meddpicc",
    label: "MEDDPICC",
    summary: "MEDDIC com processo de papelada e concorrência. Para vendas enterprise.",
    criteria: [
      { key: "metrics", label: "Métricas", description: "Ganho mensurável que o cliente espera", max_score: 13 },
      { key: "economic_buyer", label: "Decisor econômico", description: "Quem libera o dinheiro, identificado e envolvido", max_score: 13 },
      { key: "decision_criteria", label: "Critérios de decisão", description: "Como o cliente vai comparar e escolher", max_score: 13 },
      { key: "decision_process", label: "Processo de decisão", description: "Etapas, pessoas e prazos até a assinatura", max_score: 13 },
      { key: "paper_process", label: "Processo de contratação", description: "Jurídico, compras e aprovações necessárias", max_score: 12 },
      { key: "identify_pain", label: "Dor identificada", description: "Dor clara e reconhecida pelo cliente", max_score: 12 },
      { key: "champion", label: "Campeão", description: "Alguém do cliente que defende a compra internamente", max_score: 12 },
      { key: "competition", label: "Concorrência", description: "Alternativas que o cliente considera, inclusive não fazer nada", max_score: 12 },
    ],
  },
  {
    id: "sandler",
    label: "Sandler",
    summary: "Contrato inicial, dor, orçamento e decisão. Conversa franca e qualificação sem pressão.",
    criteria: [
      { key: "contrato_inicial", label: "Contrato inicial", description: "Pauta, tempo e próximo passo combinados no início", max_score: 25 },
      { key: "dor", label: "Dor", description: "Dor pessoal e do negócio, aprofundada além do sintoma", max_score: 25 },
      { key: "orcamento", label: "Orçamento", description: "Disposição e capacidade de investir para resolver", max_score: 25 },
      { key: "decisao", label: "Decisão", description: "Como, quando e por quem a decisão será tomada", max_score: 25 },
    ],
  },
];

/** Resumo gravado em analysis_results.methodology (ver migração 20261020090000). */
export interface MethodologySnapshot {
  id?: string | null;
  key?: string;
  label: string;
  criteria: QualificationCriterion[];
  frameworks?: { meddic?: boolean; spin?: boolean; talk_ratio?: boolean };
}

/**
 * Metodologia com que a análise foi feita. Análises antigas, sem o resumo,
 * usam a metodologia padrão atual da empresa.
 */
export function methodologyOf(analysis: { methodology?: unknown } | null | undefined, config: OrgConfig) {
  const snap = analysis?.methodology as MethodologySnapshot | null | undefined;
  if (snap && Array.isArray(snap.criteria) && snap.criteria.length) {
    const max = Math.max(...snap.criteria.map((c) => c.max_score ?? 25));
    return { label: snap.label || config.methodologyLabel, criteria: snap.criteria, maxCriterionScore: max };
  }
  return { label: config.methodologyLabel, criteria: config.criteria, maxCriterionScore: config.maxCriterionScore };
}

/** Grade dos cards de metodologia, conforme quantos aparecem (1 a 3). */
export const FRAMEWORK_GRID: Record<number, string> = {
  1: "grid gap-4",
  2: "grid gap-4 md:grid-cols-2",
  3: "grid gap-4 md:grid-cols-3",
};
