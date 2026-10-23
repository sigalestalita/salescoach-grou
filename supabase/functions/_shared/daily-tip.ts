// Dica do dia da tela Início: o que a IA recebe e como a resposta é conferida.
//
// A dica parte dos números das últimas análises da pessoa (o critério da
// metodologia em que ela está mais fraca e as sugestões do coach), da
// metodologia e da base de conhecimento da empresa. Para admin e gestor que
// quase não gravam, vira uma dica de gestão a partir das análises do time.
// Nenhum dado da agenda (Google ou Outlook) vai para a IA.

export interface TipAnalysis {
  overall_score: number | null;
  bant_score: Record<string, unknown> | null;
  methodology: {
    label?: string;
    mode?: string;
    criteria?: { key: string; label: string; max_score?: number }[];
  } | null;
  sales_coach: { suggestions?: unknown } | null;
}

export interface CriterionAvg {
  key: string;
  label: string;
  /** Média de 0 a 100 (nota sobre o máximo do critério). */
  pct: number;
  n: number;
}

export interface DailyTip {
  titulo: string;
  dica: string;
  porque: string;
  frase_pronta: string | null;
  foco: string | null;
  tipo: "vendedor" | "gestao";
}

const num = (v: unknown): number | null => {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v && typeof v === "object" && "score" in v) {
    const n = Number((v as { score: unknown }).score);
    return isFinite(n) ? n : null;
  }
  return null;
};

/** Média de cada critério nas análises, do mais fraco para o mais forte. */
export function criterionAverages(
  analyses: TipAnalysis[],
  fallback: { key: string; label: string; max_score?: number }[],
): CriterionAvg[] {
  const acc = new Map<string, { key: string; label: string; sum: number; n: number }>();
  for (const a of analyses) {
    if (a.methodology?.mode === "playbook" || !a.bant_score) continue;
    const criteria = a.methodology?.criteria?.length ? a.methodology.criteria : fallback;
    for (const c of criteria) {
      const v = num(a.bant_score[c.key]);
      const max = c.max_score && c.max_score > 0 ? c.max_score : 25;
      if (v == null) continue;
      // Pelo nome: a mesma metodologia pode ter mudado de chave entre versões.
      const cur = acc.get(c.label) ?? { key: c.key, label: c.label, sum: 0, n: 0 };
      cur.sum += Math.max(0, Math.min(100, (v / max) * 100));
      cur.n++;
      acc.set(c.label, cur);
    }
  }
  return [...acc.values()]
    .map((x) => ({ key: x.key, label: x.label, pct: Math.round(x.sum / x.n), n: x.n }))
    .sort((a, b) => a.pct - b.pct || b.n - a.n);
}

export function recentSuggestions(analyses: TipAnalysis[], max = 6): string[] {
  const out: string[] = [];
  for (const a of analyses) {
    const s = a.sales_coach?.suggestions;
    if (!Array.isArray(s)) continue;
    for (const x of s) {
      if (typeof x === "string" && x.trim()) out.push(x.trim().slice(0, 220));
      if (out.length >= max) return out;
    }
  }
  return out;
}

export function buildTipPrompt(p: {
  orgName: string;
  persona: string;
  methodologyLabel: string;
  tipo: "vendedor" | "gestao";
  firstName: string | null;
  analyses: TipAnalysis[];
  criteria: CriterionAvg[];
  suggestions: string[];
  knowledge: string;
  weekday: string;
}): { system: string; user: string } {
  const scores = p.analyses.map((a) => a.overall_score).filter((s): s is number => typeof s === "number");
  const media = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;
  const fracos = p.criteria.slice(0, 3).map((c) => `${c.label}: ${c.pct}% (${c.n} reuniões)`).join("; ");
  const fortes = p.criteria.slice(-2).reverse().map((c) => `${c.label}: ${c.pct}%`).join("; ");

  const quem = p.tipo === "gestao"
    ? `um gestor comercial de ${p.orgName}. A dica é de GESTÃO: como desenvolver o time a partir dos números do time abaixo (um ritual, uma pauta de 1:1, um exercício para a reunião semanal).`
    : `um vendedor de ${p.orgName}. A dica é para ele aplicar HOJE nas próprias reuniões.`;

  const system = `${p.persona}
Você é o coach do Sales Coach e escreve a "dica do dia" para ${quem}
A empresa avalia as reuniões pela metodologia ${p.methodologyLabel}.

REGRAS:
- Uma dica só, prática e específica, para aplicar hoje. Nada genérico como "escute mais o cliente".
- Ligue a dica ao ponto mais fraco nos números abaixo. Sem números, ensine algo da base de conhecimento (um diferencial, uma pergunta de descoberta, uma objeção comum e como responder).
- Cite produtos, serviços, preços e cases SOMENTE se estiverem na base de conhecimento. Não invente oferta.
- Português do Brasil, tom de colega experiente, direto. Trate a pessoa por "você".
- Responda só com o JSON pedido.

BASE DE CONHECIMENTO DA EMPRESA (resumo):
${p.knowledge || "(vazia)"}`;

  const user = `Hoje é ${p.weekday}.${p.firstName ? ` A pessoa se chama ${p.firstName}.` : ""}

NÚMEROS ${p.tipo === "gestao" ? "DO TIME" : "DA PESSOA"} (últimas ${p.analyses.length} reuniões analisadas):
- Score médio: ${media ?? "sem reuniões analisadas ainda"}
- Critérios mais fracos: ${fracos || "sem dados"}
- Critérios mais fortes: ${fortes || "sem dados"}
- Sugestões recentes do coach nas análises:
${p.suggestions.length ? p.suggestions.map((s) => `  • ${s}`).join("\n") : "  (nenhuma)"}

Responda EXATAMENTE neste JSON:
{
  "titulo": "título curto e chamativo, até 60 caracteres",
  "dica": "2 ou 3 frases: o que fazer hoje e como",
  "porque": "1 frase ligando a dica aos números acima (ou à base de conhecimento)",
  "frase_pronta": "uma pergunta ou frase para usar na próxima reunião, ou null",
  "foco": "o critério ou tema da dica, em até 3 palavras"
}`;
  return { system, user };
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Confere a resposta da IA; null se não der para usar. */
export function parseTip(content: string, tipo: DailyTip["tipo"]): DailyTip | null {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(m[0]); } catch { return null; }
  const dica = str(raw.dica, 600);
  if (!dica) return null;
  const frase = str(raw.frase_pronta, 300);
  return {
    titulo: str(raw.titulo, 80) || "Dica do dia",
    dica,
    porque: str(raw.porque, 300),
    frase_pronta: frase && frase.toLowerCase() !== "null" ? frase : null,
    foco: str(raw.foco, 40) || null,
    tipo,
  };
}

/** Data de hoje (AAAA-MM-DD): a do navegador, se for plausível; senão, a de Brasília. */
export function tipDay(clientDay: unknown, now = new Date()): string {
  const brasilia = new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  if (typeof clientDay !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(clientDay)) return brasilia;
  const diff = Math.abs(new Date(`${clientDay}T12:00:00Z`).getTime() - new Date(`${brasilia}T12:00:00Z`).getTime());
  return diff <= 86400_000 ? clientDay : brasilia;
}
