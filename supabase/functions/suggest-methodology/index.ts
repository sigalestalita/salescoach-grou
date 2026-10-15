// Sugere uma metodologia de qualificação a partir do que a empresa já tem.
//
// Nem toda empresa tem processo comercial estruturado. Esta função lê a base
// de conhecimento (documentos e produtos), os tipos de reunião, as reuniões já
// analisadas (dores, objeções, o que faltou) e um texto livre do admin, e
// propõe: nome, persona da IA, critérios com peso, faixas de temperatura e
// regras da operação. Nada é salvo aqui: a tela mostra a proposta para o admin
// revisar e salvar.
//
// POST (admin) { focus?: string, meetingTypeKey?: string }
//   → { suggestion: { methodology_label, persona, rationale, criteria[],
//       temperature_levels[], extra_instructions, sources[] } }

import { json, preflight } from "../_shared/cors.ts";
import { assertQuota, getCaller, HttpError, logUsage, requireRole } from "../_shared/tenant.ts";
import { fetchKnowledgeContext } from "../_shared/analysis-template.ts";

const MODEL = Deno.env.get("ANALYSIS_MODEL") ?? "google/gemini-2.5-flash";
const MAX_KB_CHARS = 40_000;

interface Criterion { label: string; description: string; max_score: number }
interface Level { label: string; criteria: string }

const clean = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const slug = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

/** Pesos inteiros que somam 100, proporcionais ao que a IA sugeriu. */
export function normalizeWeights(criteria: Criterion[]): Criterion[] {
  const raw = criteria.map((c) => (Number.isFinite(c.max_score) && c.max_score > 0 ? c.max_score : 1));
  const sum = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map((v) => (v / sum) * 100);
  const floors = scaled.map(Math.floor);
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const order = scaled.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (rest-- <= 0) break; floors[i]++; }
  return criteria.map((c, i) => ({ ...c, max_score: Math.max(1, floors[i]) }));
}

/** Valida e limpa a resposta da IA. Lança se não der para aproveitar. */
export function parseSuggestion(raw: string) {
  const s = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  const criteria: Criterion[] = (Array.isArray(s.criteria) ? s.criteria : [])
    .map((c: Record<string, unknown>) => ({ label: clean(c.label, 60), description: clean(c.description, 300), max_score: Number(c.max_score) }))
    .filter((c: Criterion) => c.label)
    .slice(0, 10);
  if (criteria.length < 2) throw new Error("A IA não propôs critérios suficientes.");
  const levels: Level[] = (Array.isArray(s.temperature_levels) ? s.temperature_levels : [])
    .map((l: Record<string, unknown>) => ({ label: clean(l.label, 40), criteria: clean(l.criteria, 300) }))
    .filter((l: Level) => l.label)
    .slice(0, 7);
  return {
    methodology_label: clean(s.methodology_label, 60) || "Metodologia da empresa",
    persona: clean(s.persona, 600),
    rationale: clean(s.rationale, 1200),
    criteria: normalizeWeights(criteria).map((c) => ({ ...c, key: slug(c.label) })),
    temperature_levels: levels.map((l) => ({ ...l, key: slug(l.label) })),
    extra_instructions: clean(s.extra_instructions, 2000),
    sources: (Array.isArray(s.sources) ? s.sources : []).map((x: unknown) => clean(x, 120)).filter(Boolean).slice(0, 10),
  };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const ctx = await getCaller(req);
    requireRole(ctx, "admin");
    const body = await req.json().catch(() => ({}));
    const focus = clean(body.focus, 2000);
    const meetingTypeKey = clean(body.meetingTypeKey, 60) || null;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new HttpError(503, "IA não configurada.");
    await assertQuota(ctx.admin, ctx.orgId, "analise", 1);

    const [knowledge, { data: org }, { data: types }, { data: analyses }] = await Promise.all([
      fetchKnowledgeContext(ctx.admin, ctx.orgId),
      ctx.admin.from("organizations").select("name").eq("id", ctx.orgId).maybeSingle(),
      ctx.admin.from("meeting_types").select("key, label, prompt_context").eq("org_id", ctx.orgId).eq("is_active", true).order("sort_order"),
      ctx.admin.from("analysis_results").select("insights, sales_coach, temperature, overall_score")
        .eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(15),
    ]);

    const meetingsContext = (analyses ?? []).map((a, i) => {
      const ins = a.insights as Record<string, unknown> | null;
      return `Reunião ${i + 1} (score ${a.overall_score ?? "-"}, ${a.temperature ?? "-"}): ${JSON.stringify(ins ?? {}).slice(0, 700)}`;
    }).join("\n");

    if (!knowledge.trim() && !focus && !meetingsContext) {
      throw new HttpError(400, "Adicione documentos na base de conhecimento, descreva o processo de vendas no campo de texto ou analise algumas reuniões antes de pedir a sugestão.");
    }

    const typeLabel = meetingTypeKey ? (types ?? []).find((t) => t.key === meetingTypeKey)?.label : null;
    const prompt = `Você é um consultor de processos comerciais B2B. Monte uma metodologia de qualificação de vendas sob medida para a empresa "${org?.name ?? "cliente"}", que será usada por uma IA para avaliar gravações de reuniões de venda.

${typeLabel ? `A metodologia é para reuniões do tipo "${typeLabel}".\n` : ""}Use o que a empresa vende, para quem vende, como vende e as dores e objeções que aparecem nas reuniões. Se o material indicar uma metodologia conhecida (BANT, SPICED, MEDDIC, GPCTBA/C&I, Sandler...), adapte-a; se não, crie critérios próprios.

Regras:
- De 4 a 8 critérios, cada um observável numa conversa de vendas (a IA precisa conseguir dizer, pela transcrição, se o vendedor cobriu aquilo).
- Pesos inteiros que somam 100, maiores para o que mais define uma venda boa NESTE negócio.
- Exatamente 5 faixas de temperatura, da mais fria para a mais quente, cada uma com uma regra clara baseada nos critérios.
- "extra_instructions": regras específicas da operação (o que conta como orçamento confirmado, objeções típicas e como devem ser tratadas, produtos para cross-sell...), tiradas do material. Em tópicos curtos.
- "persona": quem a IA é ao avaliar (ex.: "Você é o head comercial da X, que vende Y para Z.").
- "rationale": 2 a 4 frases explicando por que esses critérios, citando o material.
- "sources": títulos dos documentos que mais pesaram.
- Português do Brasil. Não invente fatos sobre a empresa que não estejam no material.

Responda APENAS com JSON:
{"methodology_label": "...", "persona": "...", "rationale": "...", "criteria": [{"label": "...", "description": "...", "max_score": 0}], "temperature_levels": [{"label": "...", "criteria": "..."}], "extra_instructions": "...", "sources": ["..."]}

=== O QUE O ADMIN CONTOU SOBRE O PROCESSO ===
${focus || "(nada)"}

=== TIPOS DE REUNIÃO ===
${(types ?? []).map((t) => `- ${t.label}${t.prompt_context ? `: ${t.prompt_context}` : ""}`).join("\n") || "(nenhum)"}

=== REUNIÕES JÁ ANALISADAS (mais recentes) ===
${meetingsContext || "(nenhuma)"}

${knowledge.slice(0, MAX_KB_CHARS) || "=== BASE DE CONHECIMENTO ===\n(vazia)"}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "Você responde apenas com JSON válido, sem markdown." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    if (!aiRes.ok) {
      console.error("suggest-methodology AI:", aiRes.status, await aiRes.text());
      throw new HttpError(502, "A IA não respondeu agora. Tente de novo em instantes.");
    }
    const ai = await aiRes.json();

    await logUsage(ctx.admin, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      operation: "sugestao_metodologia",
      provider: "lovable-gateway",
      model: MODEL,
      inputTokens: ai.usage?.prompt_tokens ?? 0,
      outputTokens: ai.usage?.completion_tokens ?? 0,
      quantity: 1,
      unit: "sugestao",
      estimatedCost: (ai.usage?.prompt_tokens ?? 0) * 0.0000003 + (ai.usage?.completion_tokens ?? 0) * 0.0000025,
    });

    let suggestion;
    try {
      suggestion = parseSuggestion(ai.choices?.[0]?.message?.content ?? "");
    } catch (e) {
      console.error("suggest-methodology parse:", e);
      throw new HttpError(502, "A IA devolveu uma proposta incompleta. Tente de novo.");
    }
    return json(req, { suggestion });
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    console.error("suggest-methodology:", e);
    return json(req, { error: "Erro inesperado." }, 500);
  }
});
