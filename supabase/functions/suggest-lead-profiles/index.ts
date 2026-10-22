// Sugere perfis de cliente para o modo de treino.
//
// Empresa sem reuniões gravadas não tem de onde tirar dores e objeções reais.
// Esta função lê a base de conhecimento (o que a empresa vende, para quem,
// cases), o catálogo de dores, os tipos de reunião, as reuniões já analisadas
// e um texto livre de quem pediu, e propõe perfis de quem costuma comprar.
// Nada é salvo aqui: a tela mostra os perfis para revisar e adicionar.
//
// POST (admin ou gestor) { focus?: string, count?: number }
//   → { profiles: [{ name, segment, role, company_profile, pains[], objections[], context }] }

import { json, preflight } from "../_shared/cors.ts";
import { assertQuota, getCaller, HttpError, logUsage, requireRole } from "../_shared/tenant.ts";
import { fetchKnowledgeContext } from "../_shared/analysis-template.ts";
import { parseProfiles } from "../_shared/lead-profiles.ts";

const MODEL = Deno.env.get("ANALYSIS_MODEL") ?? "google/gemini-2.5-flash";
const MAX_KB_CHARS = 40_000;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const ctx = await getCaller(req);
    requireRole(ctx, "admin", "gestor");
    const body = await req.json().catch(() => ({}));
    const focus = typeof body.focus === "string" ? body.focus.trim().slice(0, 2000) : "";
    const count = Math.min(8, Math.max(3, Number(body.count) || 5));
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new HttpError(503, "IA não configurada.");
    await assertQuota(ctx.admin, ctx.orgId, "analise", 1);

    const [knowledge, { data: org }, { data: types }, { data: pains }, { data: existing }, { data: analyses }] = await Promise.all([
      fetchKnowledgeContext(ctx.admin, ctx.orgId, "vendas"),
      ctx.admin.from("organizations").select("name").eq("id", ctx.orgId).maybeSingle(),
      ctx.admin.from("meeting_types").select("label, prompt_context").eq("org_id", ctx.orgId).eq("is_active", true).order("sort_order"),
      ctx.admin.from("pain_items").select("label").eq("org_id", ctx.orgId).limit(40),
      ctx.admin.from("lead_profiles").select("name").eq("org_id", ctx.orgId),
      ctx.admin.from("analysis_results").select("insights, meeting_summary").eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false }).limit(10),
    ]);

    const meetingsContext = (analyses ?? []).map((a, i) =>
      `Reunião ${i + 1}: ${JSON.stringify({ resumo: a.meeting_summary ?? null, insights: a.insights ?? null }).slice(0, 700)}`
    ).join("\n");

    if (!knowledge.trim() && !focus && !meetingsContext && !(pains ?? []).length) {
      throw new HttpError(400, "Adicione documentos na base de conhecimento ou descreva os clientes no campo de texto antes de pedir a sugestão.");
    }

    const prompt = `Você conhece bem o mercado da empresa "${org?.name ?? "cliente"}". Monte ${count} perfis de clientes que costumam procurar ou comprar dela, para um vendedor treinar conversas de venda contra um lead simulado por IA.

Use o que a empresa vende, para quem vende, os cases, os segmentos atendidos, as dores e as objeções que aparecem no material. Cada perfil deve ser um tipo de comprador diferente (segmento, porte ou cargo diferentes), realista e específico deste negócio.

Para cada perfil:
- "name": nome curto do perfil (ex.: "Dono de rede de clínicas odontológicas").
- "segment": segmento da empresa do lead.
- "role": cargo de quem participa da reunião.
- "company_profile": porte e situação da empresa do lead, com números plausíveis (funcionários, unidades, faturamento ou ticket).
- "pains": de 3 a 5 dores concretas, na voz do lead, que a empresa resolve.
- "objections": de 2 a 4 objeções típicas, na voz do lead, entre aspas não.
- "context": como esse lead costuma chegar (canal), o que já tentou, quem decide junto e o que o faz decidir.

Regras: português do Brasil; não invente fatos sobre a empresa que vende que não estejam no material; não repita perfis que já existem.

Responda APENAS com JSON: {"profiles": [{"name": "...", "segment": "...", "role": "...", "company_profile": "...", "pains": ["..."], "objections": ["..."], "context": "..."}]}

=== O QUE QUEM PEDIU CONTOU SOBRE OS CLIENTES ===
${focus || "(nada)"}

=== PERFIS QUE JÁ EXISTEM ===
${(existing ?? []).map((p) => `- ${p.name}`).join("\n") || "(nenhum)"}

=== CATÁLOGO DE DORES ===
${(pains ?? []).map((p) => `- ${p.label}`).join("\n") || "(vazio)"}

=== TIPOS DE REUNIÃO ===
${(types ?? []).map((t) => `- ${t.label}${t.prompt_context ? `: ${t.prompt_context}` : ""}`).join("\n") || "(nenhum)"}

=== REUNIÕES JÁ ANALISADAS ===
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
        temperature: 0.6,
      }),
    });
    if (!aiRes.ok) {
      console.error("suggest-lead-profiles AI:", aiRes.status, await aiRes.text());
      throw new HttpError(502, "A IA não respondeu agora. Tente de novo em instantes.");
    }
    const ai = await aiRes.json();

    await logUsage(ctx.admin, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      operation: "sugestao_perfis",
      provider: "lovable-gateway",
      model: MODEL,
      inputTokens: ai.usage?.prompt_tokens ?? 0,
      outputTokens: ai.usage?.completion_tokens ?? 0,
      quantity: 1,
      unit: "sugestao",
      estimatedCost: (ai.usage?.prompt_tokens ?? 0) * 0.0000003 + (ai.usage?.completion_tokens ?? 0) * 0.0000025,
    });

    let profiles;
    try {
      profiles = parseProfiles(ai.choices?.[0]?.message?.content ?? "");
    } catch (e) {
      console.error("suggest-lead-profiles parse:", e);
      throw new HttpError(502, "A IA devolveu perfis incompletos. Tente de novo.");
    }
    return json(req, { profiles });
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    console.error("suggest-lead-profiles:", e);
    return json(req, { error: "Erro inesperado." }, 500);
  }
});
