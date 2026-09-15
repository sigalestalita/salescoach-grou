// Coach ao vivo: lê os últimos trechos da transcrição e a base de conhecimento
// da organização, pede UMA dica acionável e grava em live_tips (o navegador e a
// extensão escutam por Realtime).
//
// Acesso: só a própria live-transcribe (segredo interno) ou um usuário
// autenticado com acesso à reunião. Antes a função era pública e aceitava
// qualquer meetingId — dava para gerar dicas em reuniões alheias e consumir
// crédito de IA de fora.

import { json, preflight } from "../_shared/cors.ts";
import {
  adminClient,
  assertQuota,
  getCaller,
  isInternalCall,
  HttpError,
  logUsage,
} from "../_shared/tenant.ts";

const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
// Mantém o modelo que já estava em uso; LIVE_COACH_MODEL permite trocar sem deploy.
const LIVE_COACH_MODEL = Deno.env.get("LIVE_COACH_MODEL") ?? "google/gemini-3.5-flash";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const { meetingId } = await req.json();
    if (!meetingId) return json(req, { error: "meetingId required" }, 400);

    const internal = isInternalCall(req);
    const admin = adminClient();

    const { data: meeting } = await admin
      .from("meetings")
      .select("id, title, lead_name, lead_company, meeting_type, org_id, seller_id")
      .eq("id", meetingId)
      .maybeSingle();

    if (!meeting) return json(req, { error: "meeting not found" }, 404);

    // Sem segredo interno, exige usuário autenticado da mesma organização com
    // acesso à reunião.
    if (!internal) {
      const ctx = await getCaller(req);
      if (ctx.orgId !== meeting.org_id) {
        return json(req, { error: "forbidden" }, 403);
      }
      if (meeting.seller_id !== ctx.userId && ctx.role !== "admin" && ctx.role !== "gestor") {
        return json(req, { error: "forbidden" }, 403);
      }
    }

    const orgId: string = meeting.org_id;
    await assertQuota(admin, orgId, "live_coach", 1);

    const { data: segs } = await admin
      .from("transcription_segments")
      .select("text, speaker, created_at")
      .eq("meeting_id", meetingId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(12);
    const transcript = (segs || []).reverse().map((s) => `[${s.speaker}] ${s.text}`).join("\n");

    const { data: recent } = await admin
      .from("live_tips")
      .select("titulo, categoria")
      .eq("meeting_id", meetingId)
      .eq("org_id", orgId)
      .order("emitted_at", { ascending: false })
      .limit(5);
    const recentStr = (recent || []).map((t) => `- (${t.categoria}) ${t.titulo}`).join("\n");

    // Base de conhecimento da organização da reunião.
    const { data: kb } = await admin
      .from("knowledge_documents")
      .select("title, extracted_content")
      .eq("org_id", orgId)
      .limit(5);
    const kbStr = (kb || [])
      .map((d) => `# ${d.title}\n${(d.extracted_content || "").slice(0, 600)}`)
      .join("\n\n");

    // Rótulo do tipo de reunião, configurado por organização.
    const { data: typeRow } = await admin
      .from("meeting_types")
      .select("label")
      .eq("org_id", orgId)
      .eq("key", meeting.meeting_type ?? "")
      .maybeSingle();

    const system =
      `Você é um coach de vendas ao vivo. Analise a transcrição parcial de uma reunião comercial em PT-BR e gere NO MÁXIMO UMA dica curta, específica e acionável para o vendedor usar agora. Se nada relevante para sugerir, retorne {"should_emit": false}.

Categorias possíveis: SPIN, objecao, talk_ratio, proxima_pergunta, kb, rapport, fechamento.
Urgência: baixa | media | alta.

NÃO repita dicas já emitidas. Seja telegráfico (titulo <= 70 chars, acao <= 140 chars).`;

    const user = `## Reunião
Título: ${meeting.title}
Lead: ${meeting.lead_name ?? "?"} (${meeting.lead_company ?? "?"})
Tipo: ${typeRow?.label ?? meeting.meeting_type ?? "não especificado"}

## Transcrição recente
${transcript || "(sem transcrição ainda)"}

## Dicas já emitidas (não repetir)
${recentStr || "(nenhuma)"}

## Base de conhecimento (trechos)
${kbStr.slice(0, 4000)}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: LIVE_COACH_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      return json(req, { error: "ai_failed" }, 500);
    }

    const ai = await aiRes.json();

    await logUsage(admin, {
      orgId,
      userId: meeting.seller_id,
      meetingId,
      operation: "live_coach",
      provider: "lovable-gateway",
      model: LIVE_COACH_MODEL,
      inputTokens: ai.usage?.prompt_tokens ?? 0,
      outputTokens: ai.usage?.completion_tokens ?? 0,
      quantity: 1,
      unit: "dica",
      estimatedCost:
        (ai.usage?.prompt_tokens ?? 0) * 0.0000003 +
        (ai.usage?.completion_tokens ?? 0) * 0.0000025,
    });

    const content = ai.choices?.[0]?.message?.content ?? "{}";
    let tip: any;
    try { tip = JSON.parse(content); } catch { tip = {}; }

    if (!tip.should_emit || !tip.titulo) {
      return json(req, { emitted: false });
    }

    const { data: inserted, error: insErr } = await admin.from("live_tips").insert({
      meeting_id: meetingId,
      org_id: orgId,
      categoria: String(tip.categoria || "kb").slice(0, 40),
      urgencia: ["baixa", "media", "alta"].includes(tip.urgencia) ? tip.urgencia : "media",
      titulo: String(tip.titulo).slice(0, 200),
      acao: tip.acao ? String(tip.acao).slice(0, 400) : null,
    }).select().single();

    if (insErr) {
      console.error("insert tip error", insErr);
      return json(req, { error: "insert_failed" }, 500);
    }

    return json(req, { emitted: true, tip: inserted });
  } catch (e) {
    if (e instanceof HttpError) {
      return json(req, { error: e.message, code: e.code }, e.status);
    }
    console.error("live-coach error", e);
    return json(req, { error: String(e) }, 500);
  }
});
