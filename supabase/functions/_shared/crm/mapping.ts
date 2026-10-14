// Do resultado da análise para o CRM do cliente.
//
// Módulo puro (sem Deno, sem rede): monta o que vai para o negócio no CRM a
// partir da análise, do mapeamento de campos da organização e dos valores que o
// negócio já tem. Os conectores só traduzem isto para a API de cada CRM.

/** Tipos de dado que o Sales Coach entrega. */
export type SourceType = "number" | "text" | "date" | "option" | "url";

export interface SourceDef {
  key: string;
  label: string;
  type: SourceType;
  description: string;
}

export interface Criterion {
  key: string;
  label: string;
  max_score?: number;
}

export interface TemperatureLevelDef {
  key: string;
  label: string;
}

/** Dados que cada organização pode mandar para o CRM. Os critérios vêm da metodologia dela. */
export function sourceCatalog(criteria: Criterion[]): SourceDef[] {
  return [
    { key: "nota", label: "Nota da reunião", type: "number", description: "Nota geral de 0 a 100" },
    { key: "temperatura", label: "Temperatura", type: "option", description: "Faixa da metodologia (ex.: Quente)" },
    { key: "resumo", label: "Resumo da reunião", type: "text", description: "Justificativa da nota e da temperatura" },
    { key: "dores", label: "Dores identificadas", type: "text", description: "Dores citadas pelo lead" },
    { key: "proximo_passo", label: "Próximo passo", type: "text", description: "Primeiro próximo passo sugerido" },
    { key: "data_proximo_passo", label: "Data do próximo passo", type: "date", description: "Data combinada na reunião, quando houver" },
    { key: "fala_vendedor", label: "Fala do vendedor (%)", type: "number", description: "Quanto o vendedor falou" },
    { key: "data_reuniao", label: "Data da reunião", type: "date", description: "Dia em que a reunião aconteceu" },
    { key: "link_analise", label: "Link da análise", type: "url", description: "Abre a análise completa no Sales Coach" },
    ...criteria.map((c) => ({
      key: `criterio:${c.key}`,
      label: `Critério: ${c.label}`,
      type: "number" as SourceType,
      description: `Pontos em ${c.label}${c.max_score ? ` (de 0 a ${c.max_score})` : ""}`,
    })),
  ];
}

// ── Entrada ──────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

export interface AnalysisInput {
  overall_score?: number | null;
  temperature?: string | null;
  bant_score?: Json | null;
  talk_ratio?: Json | null;
  sales_coach?: Json | null;
  insights?: Json | null;
  raw_analysis?: Json | null;
}

export interface MeetingInput {
  title: string;
  meeting_date?: string | null;
  created_at?: string | null;
  lead_name?: string | null;
  lead_company?: string | null;
}

export interface SourceContext {
  analysis: AnalysisInput;
  meeting: MeetingInput;
  criteria: Criterion[];
  temperatureLevels: TemperatureLevelDef[];
  /** Link para a análise no app (ou o link compartilhável). */
  analysisUrl?: string | null;
}

const asText = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => asText(x)).filter(Boolean) : [];
const asNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const isoDay = (v: unknown): string | null => {
  const s = asText(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
};

/** Valor de cada dado do catálogo para esta reunião (null = não há). */
export function sourceValues(ctx: SourceContext): Record<string, string | number | null> {
  const a = ctx.analysis;
  const raw = (a.raw_analysis ?? {}) as Json;
  const summary = (raw.meeting_summary ?? {}) as Json;
  const coach = (a.sales_coach ?? raw.sales_coach ?? {}) as Json;
  const talk = (a.talk_ratio ?? {}) as Json;
  const criteria = (a.bant_score ?? {}) as Json;

  const level = ctx.temperatureLevels.find((l) => l.key === a.temperature);
  const resumo = [asText(raw.overall_score_reason), asText(raw.temperature_reason)].filter(Boolean).join(" ");
  const steps = asList(coach.next_steps);

  const values: Record<string, string | number | null> = {
    nota: asNum(a.overall_score),
    temperatura: level?.label ?? (a.temperature ? String(a.temperature) : null),
    resumo: resumo || null,
    dores: asList(summary.identified_pains).join("; ") || null,
    proximo_passo: steps[0] ?? null,
    data_proximo_passo: isoDay(coach.next_step_date),
    fala_vendedor: asNum(talk.seller),
    data_reuniao: isoDay(ctx.meeting.meeting_date) ?? isoDay(ctx.meeting.created_at),
    link_analise: ctx.analysisUrl ?? null,
  };
  for (const c of ctx.criteria) {
    const item = criteria[c.key] as Json | undefined;
    values[`criterio:${c.key}`] = item ? asNum(item.score) : null;
  }
  return values;
}

// ── Conversão para o campo do CRM ──────────────────────────────────────────

export interface FieldMapping {
  source_key: string;
  target_field: string;
  target_label?: string | null;
  /** Tipo do campo no CRM: number, text, date, option, multiple_choice, hyperlink... */
  target_type?: string | null;
  target_options?: string[] | null;
  mode: "sempre" | "se_vazio";
}

export type Converted = { ok: true; value: string | number } | { ok: false; reason: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Converte um valor para o tipo do campo de destino. */
export function convertValue(value: string | number, targetType: string | null | undefined, options?: string[] | null): Converted {
  const t = (targetType ?? "text").toLowerCase();
  if (["number", "numeric", "double", "integer", "monetary"].includes(t)) {
    const n = asNum(value);
    return n === null ? { ok: false, reason: "não é um número" } : { ok: true, value: n };
  }
  if (["date", "date_time", "datetime"].includes(t)) {
    const d = isoDay(String(value));
    return d ? { ok: true, value: d } : { ok: false, reason: "não é uma data" };
  }
  if (["option", "select", "enum", "radiobutton", "multiple_choice", "multiselect", "set"].includes(t)) {
    const list = options ?? [];
    if (!list.length) return { ok: true, value: String(value) };
    const hit = list.find((o) => norm(o) === norm(String(value)));
    return hit ? { ok: true, value: hit } : { ok: false, reason: `"${value}" não é uma das opções do campo` };
  }
  if (["hyperlink", "url"].includes(t)) {
    const s = String(value);
    return /^https?:\/\//i.test(s) ? { ok: true, value: s } : { ok: false, reason: "não é um link" };
  }
  return { ok: true, value: String(value) };
}

const isEmpty = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

export interface FieldUpdate {
  fields: Record<string, string | number>;
  skipped: { field: string; source: string; reason: string }[];
}

/**
 * Campos a gravar no negócio. `current` são os valores que o negócio já tem
 * (por campo do CRM); com mode "se_vazio", um campo preenchido não é tocado.
 */
export function buildFieldUpdate(
  mappings: FieldMapping[],
  values: Record<string, string | number | null>,
  current: Record<string, unknown>,
): FieldUpdate {
  const out: FieldUpdate = { fields: {}, skipped: [] };
  for (const m of mappings) {
    const v = values[m.source_key];
    const field = m.target_label || m.target_field;
    if (v === null || v === undefined || v === "") {
      out.skipped.push({ field, source: m.source_key, reason: "sem valor nesta reunião" });
      continue;
    }
    if (m.mode === "se_vazio" && !isEmpty(current[m.target_field])) {
      out.skipped.push({ field, source: m.source_key, reason: "já preenchido no CRM" });
      continue;
    }
    const c = convertValue(v, m.target_type, m.target_options);
    if ("reason" in c) {
      out.skipped.push({ field, source: m.source_key, reason: c.reason });
      continue;
    }
    out.fields[m.target_field] = c.value;
  }
  return out;
}

// ── Anotação e tarefa ───────────────────────────────────────────────────────

export interface NoteContext extends SourceContext {
  /** Nome da metodologia (ex.: BANT), para o título dos critérios. */
  methodologyLabel?: string;
}

/** Texto da anotação no negócio: o que um vendedor leria no CRM. */
export function buildNote(ctx: NoteContext): string {
  const v = sourceValues(ctx);
  const raw = (ctx.analysis.raw_analysis ?? {}) as Json;
  const coach = (ctx.analysis.sales_coach ?? raw.sales_coach ?? {}) as Json;
  const insights = (ctx.analysis.insights ?? raw.insights ?? {}) as Json;
  const criteria = (ctx.analysis.bant_score ?? {}) as Json;
  const lines: string[] = [];

  const data = v.data_reuniao ? ` · ${String(v.data_reuniao).split("-").reverse().join("/")}` : "";
  lines.push(`Análise do Sales Coach: ${ctx.meeting.title}${data}`);
  const head = [v.nota !== null ? `Nota ${v.nota}/100` : "", v.temperatura ? `Temperatura: ${v.temperatura}` : ""]
    .filter(Boolean).join(" · ");
  if (head) lines.push(head);
  if (v.resumo) lines.push("", String(v.resumo));

  const crit = ctx.criteria
    .map((c) => {
      const item = criteria[c.key] as Json | undefined;
      if (!item) return "";
      const score = asNum(item.score);
      const reason = asText(item.reason);
      return `- ${c.label}: ${score ?? "—"}${c.max_score ? `/${c.max_score}` : ""}${reason ? ` — ${reason}` : ""}`;
    })
    .filter(Boolean);
  if (crit.length) lines.push("", `Critérios${ctx.methodologyLabel ? ` (${ctx.methodologyLabel})` : ""}:`, ...crit);

  if (v.dores) lines.push("", `Dores: ${v.dores}`);
  const steps = asList(coach.next_steps);
  if (steps.length) lines.push("", "Próximos passos:", ...steps.map((s) => `- ${s}`));
  const pos = asList(insights.positives), imp = asList(insights.improvements);
  if (pos.length) lines.push("", "O que foi bem:", ...pos.map((s) => `- ${s}`));
  if (imp.length) lines.push("", "O que melhorar:", ...imp.map((s) => `- ${s}`));
  if (v.link_analise) lines.push("", `Análise completa: ${v.link_analise}`);
  return lines.join("\n");
}

export interface TaskDraft {
  name: string;
  description: string;
  /** AAAA-MM-DD */
  dueDate: string;
}

/** Soma dias úteis (seg–sex) a uma data AAAA-MM-DD. */
export function addBusinessDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Tarefa do próximo passo. Sem data combinada na reunião, vence em
 * `defaultBusinessDays` dias úteis depois dela.
 */
export function buildTask(ctx: SourceContext, today: string, defaultBusinessDays = 2): TaskDraft | null {
  const v = sourceValues(ctx);
  if (!v.proximo_passo) return null;
  const raw = (ctx.analysis.raw_analysis ?? {}) as Json;
  const coach = (ctx.analysis.sales_coach ?? raw.sales_coach ?? {}) as Json;
  const steps = asList(coach.next_steps);
  const base = (v.data_reuniao as string | null) ?? today;
  const due = (v.data_proximo_passo as string | null) ?? addBusinessDays(base, defaultBusinessDays);
  const name = String(v.proximo_passo).slice(0, 150);
  const description = [
    `Próximo passo combinado na reunião "${ctx.meeting.title}".`,
    steps.length > 1 ? `\nOutros passos:\n${steps.slice(1).map((s) => `- ${s}`).join("\n")}` : "",
    v.link_analise ? `\nAnálise: ${v.link_analise}` : "",
  ].join("");
  return { name, description, dueDate: due < today ? today : due };
}
