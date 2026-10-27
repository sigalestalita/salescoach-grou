// Dica do dia da tela Início.
//
// POST com o token do usuário: { day: "AAAA-MM-DD" } (o dia no navegador).
// Devolve { tip, day, cached }. A dica sai uma vez por pessoa por dia e fica
// em daily_tips; sem a tabela (migração ainda não aplicada), gera sem guardar.
//
// Base: as últimas reuniões analisadas da pessoa, a metodologia e a base de
// conhecimento da empresa. Admin e gestor com menos de 2 reuniões próprias
// recebem uma dica de gestão, a partir das análises do time.

import { json, preflight } from "../_shared/cors.ts";
import { getCaller, HttpError, logUsage } from "../_shared/tenant.ts";
import { docMatchesArea, loadTemplate } from "../_shared/analysis-template.ts";
import {
  buildTipPrompt, criterionAverages, DailyTip, parseTip, recentSuggestions, TipAnalysis, tipDay,
} from "../_shared/daily-tip.ts";

const TIP_MODEL = Deno.env.get("DAILY_TIP_MODEL") ?? "google/gemini-3-flash-preview";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const ctx = await getCaller(req);
    const body = await req.json().catch(() => ({}));
    const day = tipDay(body.day);
    const admin = ctx.admin;

    const { data: cached, error: cacheErr } = await admin.from("daily_tips")
      .select("tip").eq("user_id", ctx.userId).eq("day", day).maybeSingle();
    if (cached?.tip) return json(req, { tip: cached.tip, day, cached: true });
    const canStore = !cacheErr;

    // Últimas reuniões analisadas da pessoa.
    const lastAnalyses = async (q: { sellerId?: string; teamId?: string | null }, limit: number) => {
      let mq = admin.from("meetings").select("id").eq("org_id", ctx.orgId).eq("status", "completo")
        .order("created_at", { ascending: false }).limit(limit);
      if (q.sellerId) mq = mq.eq("seller_id", q.sellerId);
      if (q.teamId) mq = mq.eq("team_id", q.teamId);
      const { data: ms } = await mq;
      const ids = (ms ?? []).map((m: { id: string }) => m.id);
      if (!ids.length) return [] as TipAnalysis[];
      const { data } = await admin.from("analysis_results")
        .select("meeting_id, overall_score, bant_score, methodology, sales_coach, created_at")
        .in("meeting_id", ids).order("created_at", { ascending: false });
      const seen = new Set<string>();
      // deno-lint-ignore no-explicit-any
      return (data ?? []).filter((a: any) => !seen.has(a.meeting_id) && seen.add(a.meeting_id)) as TipAnalysis[];
    };

    let analyses = await lastAnalyses({ sellerId: ctx.userId }, 8);
    let tipo: DailyTip["tipo"] = "vendedor";
    if ((ctx.role === "admin" || ctx.role === "gestor") && analyses.length < 2) {
      // Gestor vê o próprio time; admin, a empresa toda.
      analyses = await lastAnalyses({ teamId: ctx.role === "gestor" ? ctx.teamId : null }, 20);
      tipo = "gestao";
    }

    const atendimento = analyses.length > 0 &&
      analyses.filter((a) => a.methodology?.mode === "playbook").length > analyses.length / 2;
    const [template, docsRes, itemsRes, orgRes, profileRes] = await Promise.all([
      loadTemplate(admin, ctx.orgId),
      admin.from("knowledge_documents").select("*").eq("org_id", ctx.orgId).limit(40),
      admin.from("knowledge_items").select("name, description, category, item_type").eq("org_id", ctx.orgId).limit(40),
      admin.from("organizations").select("name").eq("id", ctx.orgId).maybeSingle(),
      admin.from("profiles").select("full_name").eq("user_id", ctx.userId).maybeSingle(),
    ]);

    const area = atendimento ? "atendimento" : "vendas";
    const knowledge = [
      // deno-lint-ignore no-explicit-any
      ...(docsRes.data ?? []).filter((d: any) => docMatchesArea(d.area, area)).slice(0, 12)
        // deno-lint-ignore no-explicit-any
        .map((d: any) => `[${d.category || "doc"}] ${d.title}: ${(d.extracted_content || "").slice(0, 400)}`),
      // deno-lint-ignore no-explicit-any
      ...(itemsRes.data ?? []).map((i: any) => `[${i.item_type}/${i.category || ""}] ${i.name}: ${(i.description || "").slice(0, 200)}`),
    ].join("\n").slice(0, 7000);

    const criteria = criterionAverages(analyses, template.qualification_criteria);
    const firstName = (profileRes.data?.full_name ?? "").trim().split(/\s+/)[0] || null;
    const weekday = new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
    const prompt = buildTipPrompt({
      orgName: orgRes.data?.name ?? "a empresa",
      persona: template.persona,
      methodologyLabel: template.methodology_label,
      tipo,
      firstName,
      analyses,
      criteria,
      suggestions: recentSuggestions(analyses),
      knowledge,
      weekday,
    });

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("LOVABLE_API_KEY not configured");
    const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TIP_MODEL,
        messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
        temperature: 0.8,
      }),
    });
    if (!ai.ok) {
      if (ai.status === 429) return json(req, { error: "Muitas dicas ao mesmo tempo. Tente de novo em instantes." }, 429);
      if (ai.status === 402) return json(req, { error: "Créditos de IA esgotados." }, 402);
      throw new Error(`AI gateway error: ${ai.status}`);
    }
    const data = await ai.json();
    const tip = parseTip(data.choices?.[0]?.message?.content ?? "", tipo);
    if (!tip) throw new Error("A IA não devolveu uma dica válida.");

    if (canStore) {
      await admin.from("daily_tips").upsert(
        { user_id: ctx.userId, org_id: ctx.orgId, day, tip, model: TIP_MODEL },
        { onConflict: "user_id,day" },
      );
    }
    await logUsage(admin, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      operation: "dica_do_dia",
      provider: "lovable-gateway",
      model: TIP_MODEL,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      quantity: 1,
      unit: "dica",
      estimatedCost: (data.usage?.prompt_tokens ?? 0) * 0.000001 + (data.usage?.completion_tokens ?? 0) * 0.000004,
    });

    return json(req, { tip, day, cached: false });
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    console.error("daily-tip:", e);
    return json(req, { error: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
