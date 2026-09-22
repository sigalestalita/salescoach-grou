// Encerra e avalia um treino, reaproveitando o mesmo motor de análise das
// reuniões reais (mesma metodologia, mesmo formato de nota e feedback) — só
// muda a origem do texto: em vez de uma transcrição gravada, é a conversa do
// roleplay.

import { json, preflight } from "../_shared/cors.ts";
import { getCaller, HttpError, logUsage } from "../_shared/tenant.ts";
import { buildAnalysisPrompt, fetchKnowledgeContext, loadMeetingTypeContext, loadTemplate } from "../_shared/analysis-template.ts";
import { achaCenario } from "../_shared/roleplay-scenarios.ts";

const ROLEPLAY_MODEL = Deno.env.get("ROLEPLAY_MODEL") ?? "google/gemini-2.5-flash";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const ctx = await getCaller(req);
    const { sessionId } = await req.json();
    if (!sessionId) throw new HttpError(400, "sessionId é obrigatório");

    const { data: session } = await ctx.admin
      .from("roleplay_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("org_id", ctx.orgId)
      .maybeSingle();

    if (!session || session.user_id !== ctx.userId) throw new HttpError(404, "Sessão de treino não encontrada");
    if (session.status === "concluida") throw new HttpError(400, "Este treino já foi avaliado");

    const { data: messages } = await ctx.admin
      .from("roleplay_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at");

    const sellerTurns = (messages ?? []).filter((m: { role: string }) => m.role === "seller").length;
    if (sellerTurns < 2) throw new HttpError(400, "Converse um pouco mais antes de encerrar — faltam poucas falas para dar uma avaliação justa.");

    const persona = session.persona as { name: string; company: string; relationship?: { tempoDeCasa: string; contratado: string[] } };
    const cenario = achaCenario(session.scenario);
    // O avaliador precisa saber que fase é essa: a mesma pergunta que é boa
    // numa descoberta pode ser o erro numa conversa com cliente antigo.
    const contextoDoCenario = [
      `MOMENTO DA RELAÇÃO: ${cenario.label} — ${cenario.resumo}.`,
      `O vendedor estava tentando: ${cenario.objetivo}`,
      persona.relationship
        ? `A pessoa do outro lado JÁ É CLIENTE há ${persona.relationship.tempoDeCasa} e contratou: ${persona.relationship.contratado.join(", ")}.`
        : `A pessoa do outro lado ainda não é cliente.`,
      `COMO AVALIAR ESTA CONVERSA: ${cenario.avaliacao}`,
      `Ajuste os critérios da metodologia a esta fase: critério que não se aplica aqui não deve puxar a nota para baixo, e o que a fase exige deve pesar mais.`,
    ].join("\n");
    const transcript = (messages ?? [])
      .map((m: { role: string; content: string }) => `${m.role === "seller" ? "Vendedor" : persona.name}: ${m.content}`)
      .join("\n");

    const [template, meetingTypeContext, knowledgeContext, meetingTypeLabelRes] = await Promise.all([
      loadTemplate(ctx.admin, ctx.orgId),
      loadMeetingTypeContext(ctx.admin, ctx.orgId, session.meeting_type),
      fetchKnowledgeContext(ctx.admin, ctx.orgId),
      session.meeting_type
        ? ctx.admin.from("meeting_types").select("label").eq("org_id", ctx.orgId).eq("key", session.meeting_type).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const prompt = buildAnalysisPrompt({
      template,
      transcript,
      meetingTitle: "Simulação de treino",
      meetingTypeLabel: meetingTypeLabelRes.data?.label ?? null,
      meetingTypeContext,
      leadName: persona.name,
      leadCompany: persona.company,
      knowledgeContext,
      scenarioContext: contextoDoCenario,
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ROLEPLAY_MODEL,
        messages: [
          { role: "system", content: `Você avalia uma simulação de treino de vendas, na fase "${cenario.label}". Trate a conversa como se fosse uma reunião real para fins de nota e feedback, cobrando o que essa fase exige.` },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) return json(req, { error: "Muitas avaliações em pouco tempo. Tente de novo em instantes." }, 429);
      if (aiResponse.status === 402) return json(req, { error: "Créditos de IA esgotados." }, 402);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    let feedback: Record<string, unknown>;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      feedback = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: content };
    } catch {
      feedback = { raw: content };
    }

    const { data: updated, error } = await ctx.admin
      .from("roleplay_sessions")
      .update({
        status: "concluida",
        overall_score: typeof feedback.overall_score === "number" ? feedback.overall_score : null,
        temperature: typeof feedback.temperature === "string" ? feedback.temperature : null,
        feedback,
        ended_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .select("id, overall_score, temperature, feedback, persona, meeting_type, difficulty, turn_count, created_at, ended_at")
      .single();

    if (error || !updated) throw new HttpError(500, "Não foi possível salvar a avaliação");

    await logUsage(ctx.admin, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      operation: "roleplay",
      quantity: 0,
      unit: "avaliacoes",
      model: ROLEPLAY_MODEL,
      provider: "lovable-gateway",
      inputTokens: aiData.usage?.prompt_tokens ?? 0,
      outputTokens: aiData.usage?.completion_tokens ?? 0,
    });

    return json(req, { session: updated });
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    console.error("roleplay-finish error:", e);
    return json(req, { error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
