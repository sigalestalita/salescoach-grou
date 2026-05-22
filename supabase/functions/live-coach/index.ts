// Live coach: reads recent transcript + KB context, asks Lovable AI for ONE actionable tip,
// inserts into live_tips (which the browser/extension subscribes to via Realtime).

import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { meetingId } = await req.json();
    if (!meetingId) return json({ error: "meetingId required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: meeting } = await admin
      .from("meetings")
      .select("id, title, lead_name, lead_company, meeting_type")
      .eq("id", meetingId)
      .single();
    if (!meeting) return json({ error: "meeting not found" }, 404);

    // Last ~12 segments
    const { data: segs } = await admin
      .from("transcription_segments")
      .select("text, speaker, created_at")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: false })
      .limit(12);
    const transcript = (segs || []).reverse().map((s) => `[${s.speaker}] ${s.text}`).join("\n");

    // Recent tips to avoid repetition
    const { data: recent } = await admin
      .from("live_tips")
      .select("titulo, categoria")
      .eq("meeting_id", meetingId)
      .order("emitted_at", { ascending: false })
      .limit(5);
    const recentStr = (recent || []).map((t) => `- (${t.categoria}) ${t.titulo}`).join("\n");

    // Light KB snippet (top 5 by recency — full RAG can be added later)
    const { data: kb } = await admin
      .from("knowledge_documents")
      .select("title, extracted_content")
      .limit(5);
    const kbStr = (kb || [])
      .map((d) => `# ${d.title}\n${(d.extracted_content || "").slice(0, 600)}`)
      .join("\n\n");

    const system = `Você é o Sales Coach AI ao vivo. Analise a transcrição parcial de uma reunião comercial em PT-BR e gere NO MÁXIMO UMA dica curta, específica e acionável para o vendedor usar agora. Se nada relevante para sugerir, retorne {"should_emit": false}.

Categorias possíveis: SPIN, objecao, talk_ratio, proxima_pergunta, kb, rapport, fechamento.
Urgência: baixa | media | alta.

NÃO repita dicas já emitidas. Seja telegráfico (titulo <= 70 chars, acao <= 140 chars).`;

    const user = `## Reunião
Título: ${meeting.title}
Lead: ${meeting.lead_name ?? "?"} (${meeting.lead_company ?? "?"})
Tipo: ${meeting.meeting_type}

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
        model: "google/gemini-3.5-flash",
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
      return json({ error: "ai_failed" }, 500);
    }
    const ai = await aiRes.json();
    const content = ai.choices?.[0]?.message?.content ?? "{}";
    let tip: any;
    try { tip = JSON.parse(content); } catch { tip = {}; }

    if (!tip.should_emit || !tip.titulo) {
      return json({ emitted: false });
    }

    const { data: inserted, error: insErr } = await admin.from("live_tips").insert({
      meeting_id: meetingId,
      categoria: String(tip.categoria || "kb").slice(0, 40),
      urgencia: ["baixa", "media", "alta"].includes(tip.urgencia) ? tip.urgencia : "media",
      titulo: String(tip.titulo).slice(0, 200),
      acao: tip.acao ? String(tip.acao).slice(0, 400) : null,
    }).select().single();

    if (insErr) {
      console.error("insert tip error", insErr);
      return json({ error: "insert_failed" }, 500);
    }
    return json({ emitted: true, tip: inserted });
  } catch (e) {
    console.error("live-coach error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
