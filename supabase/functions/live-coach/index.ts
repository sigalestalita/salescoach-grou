// Coach ao vivo.
//
// A cada trecho final da transcrição, monta o contexto da organização —
// metodologia e critérios de qualificação, faixas de temperatura, tipo de
// reunião, ofertas e os trechos da base de conhecimento mais relevantes para
// o que está sendo dito — e pede UMA orientação concreta: por que agora e a
// frase exata que o vendedor deve falar. A dica vai para live_tips, que a
// extensão e o app escutam por Realtime.
//
// Acesso: chamada interna (live-transcribe) ou usuário autenticado com acesso
// à reunião.

import { json, preflight } from "../_shared/cors.ts";
import {
  adminClient,
  assertQuota,
  getCaller,
  isInternalCall,
  HttpError,
  logUsage,
} from "../_shared/tenant.ts";
import { loadMeetingTypeContext, loadTemplate } from "../_shared/analysis-template.ts";

const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
// Mesmo modelo da análise, comprovadamente aceito pelo gateway. LIVE_COACH_MODEL
// permite trocar sem deploy.
const LIVE_COACH_MODEL = Deno.env.get("LIVE_COACH_MODEL") ?? "google/gemini-2.5-flash";

const TRANSCRIPT_WINDOW = 24;   // últimos trechos considerados (~2 a 4 minutos)
const RECENT_TIPS = 6;          // dicas recentes a não repetir
const KB_DOCS = 4;              // documentos mais relevantes para o momento
const KB_CHARS_PER_DOC = 900;
const KB_ITEMS = 30;

// ── Relevância da base de conhecimento ──────────────────────────────────────
// Ranqueia documentos pela sobreposição de termos com a conversa recente. Não
// é busca semântica, mas troca "os 5 mais recentes" por "os que falam do que
// o lead está falando", sem custo extra de IA.

const STOPWORDS = new Set([
  "a","o","e","de","da","do","das","dos","em","um","uma","que","não","nao","com",
  "para","pra","por","se","na","no","nas","nos","é","eh","ao","à","as","os","mas",
  "ou","como","mais","muito","isso","esse","essa","este","esta","aqui","ali","lá",
  "la","já","ja","tem","ter","ser","está","esta","tá","ta","vai","vou","foi","são",
  "sao","eu","você","voce","ele","ela","eles","elas","nós","nos","gente","né","ne",
  "então","entao","também","tambem","sim","bom","bem","tipo","assim","porque",
  "quando","onde","qual","quais","sobre","até","ate","ainda","meu","minha","seu",
  "sua","nosso","nossa","deles","delas","tudo","nada","cada","todo","toda","dessa",
  "desse","nessa","nesse","pela","pelo","the","and","for","with",
]);

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t)),
  );
}

function relevance(query: Set<string>, text: string): number {
  if (query.size === 0) return 0;
  const docTerms = terms(text);
  let hits = 0;
  for (const t of query) if (docTerms.has(t)) hits++;
  return hits;
}

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

    if (!internal) {
      const ctx = await getCaller(req);
      if (ctx.orgId !== meeting.org_id) return json(req, { error: "forbidden" }, 403);
      if (meeting.seller_id !== ctx.userId && ctx.role !== "admin" && ctx.role !== "gestor") {
        return json(req, { error: "forbidden" }, 403);
      }
    }

    const orgId: string = meeting.org_id;
    await assertQuota(admin, orgId, "live_coach", 1);

    // ── Conversa recente e dicas já dadas ─────────────────────────────────
    const [{ data: segs }, { data: recent }] = await Promise.all([
      admin
        .from("transcription_segments")
        .select("text, speaker, created_at")
        .eq("meeting_id", meetingId)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(TRANSCRIPT_WINDOW),
      admin
        .from("live_tips")
        .select("titulo, categoria, acao")
        .eq("meeting_id", meetingId)
        .eq("org_id", orgId)
        .order("emitted_at", { ascending: false })
        .limit(RECENT_TIPS),
    ]);

    const ordered = (segs || []).reverse();
    const transcript = ordered.map((s) => `- ${s.text}`).join("\n");
    const lastTurn = ordered.slice(-4).map((s) => s.text).join(" ");
    const recentStr = (recent || [])
      .map((t) => `- [${t.categoria}] ${t.titulo}${t.acao ? ` → "${t.acao}"` : ""}`)
      .join("\n");

    if (!transcript.trim()) return json(req, { emitted: false, reason: "sem transcrição" });

    // ── Contexto da organização ───────────────────────────────────────────
    const [template, typeContext, { data: typeRow }, { data: offers }, { data: docs }, { data: items }] =
      await Promise.all([
        loadTemplate(admin, orgId),
        loadMeetingTypeContext(admin, orgId, meeting.meeting_type),
        admin.from("meeting_types").select("label").eq("org_id", orgId).eq("key", meeting.meeting_type ?? "").maybeSingle(),
        admin.from("offer_types").select("label, instructions").eq("org_id", orgId).eq("is_active", true).order("sort_order"),
        admin.from("knowledge_documents").select("id, title, category, extracted_content").eq("org_id", orgId).not("extracted_content", "is", null),
        admin.from("knowledge_items").select("name, item_type, category, description").eq("org_id", orgId).limit(KB_ITEMS),
      ]);

    // Documentos ranqueados pelo que está sendo dito agora.
    const query = terms(lastTurn + " " + transcript);
    const rankedDocs = (docs || [])
      .map((d) => ({ ...d, score: relevance(query, `${d.title} ${d.extracted_content ?? ""}`) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, KB_DOCS);

    const kbStr = rankedDocs
      .map((d) => `### ${d.title}${d.category ? ` (${d.category})` : ""}\n${(d.extracted_content || "").slice(0, KB_CHARS_PER_DOC)}`)
      .join("\n\n");

    const itemsStr = (items || [])
      .map((i) => `- ${i.name} [${i.item_type}${i.category ? `/${i.category}` : ""}]${i.description ? `: ${i.description}` : ""}`)
      .join("\n");

    const offersStr = (offers || [])
      .map((o) => `- ${o.label}${o.instructions ? `: ${o.instructions.split("\n")[0]}` : ""}`)
      .join("\n");

    const criteriaStr = template.qualification_criteria
      .map((c) => `- ${c.key}: ${c.label}${c.description ? ` — ${c.description}` : ""}`)
      .join("\n");

    const levelsStr = template.temperature_levels
      .map((l) => `- ${l.label}: ${l.criteria}`)
      .join("\n");

    const criteriaKeys = template.qualification_criteria.map((c) => c.key);
    const categorias = [...criteriaKeys, "objecao", "oferta", "proxima_pergunta", "fechamento", "rapport", "talk_ratio"];

    // ── Prompt ────────────────────────────────────────────────────────────
    const system = `${template.persona} Você acompanha uma reunião comercial AO VIVO, em português do Brasil, e orienta o vendedor em tempo real.

METODOLOGIA DE QUALIFICAÇÃO (${template.methodology_label}):
${criteriaStr}

FAIXAS DE TEMPERATURA:
${levelsStr}

${offersStr ? `OFERTAS QUE O VENDEDOR PODE APRESENTAR:\n${offersStr}\n` : ""}
${template.extra_instructions ? `REGRAS DESTA OPERAÇÃO:\n${template.extra_instructions}\n` : ""}
SUA TAREFA A CADA CHAMADA:
1. Avalie, pela conversa até agora, quais critérios da metodologia já foram cobertos e quais ainda não.
2. Identifique o momento: o lead acabou de levantar uma dor, uma objeção, um sinal de compra, ou a conversa está sem direção?
3. Escolha UMA única orientação, a mais útil para os próximos 30 segundos. Prioridade: (a) responder objeção ou sinal de compra que acabou de surgir; (b) explorar um critério ainda não coberto; (c) conectar uma dor dita pelo lead a algo da base de conhecimento; (d) corrigir postura (falar menos, perguntar mais).
4. Escreva a frase EXATA que o vendedor deve dizer, em primeira pessoa, natural, como se fosse falada — não uma descrição do que fazer. Se a orientação usar a base de conhecimento, cite o produto/serviço/dado pelo nome que aparece nela e nunca invente número, preço ou funcionalidade que não esteja lá.
5. Se nada agregar valor agora, ou se a última orientação ainda estiver sendo executada, retorne {"should_emit": false}.

FORMATO (JSON puro):
{
  "should_emit": true,
  "categoria": "<uma de: ${categorias.join(" | ")}>",
  "urgencia": "<baixa | media | alta>",
  "titulo": "<por que agora, em até 70 caracteres. Ex.: 'Lead citou orçamento apertado — hora de qualificar Budget'>",
  "acao": "<a frase exata para o vendedor falar, em até 240 caracteres>",
  "fonte": "<título do documento da base usado, ou null>",
  "criterios_cobertos": ["<keys dos critérios já cobertos até agora>"]
}

Urgência alta = objeção, sinal de compra ou o lead fazendo uma pergunta direta. Não repita orientação já dada. Seja específico ao que foi dito; nada genérico.`;

    const user = `## Reunião
Título: ${meeting.title}
Lead: ${meeting.lead_name ?? "?"}${meeting.lead_company ? ` (${meeting.lead_company})` : ""}
Tipo: ${typeRow?.label ?? meeting.meeting_type ?? "não especificado"}${typeContext ? `\n${typeContext.trim()}` : ""}

## Conversa recente (do mais antigo ao mais novo; a transcrição não separa quem fala — deduza pelo conteúdo)
${transcript}

## Orientações já dadas nesta reunião (não repetir)
${recentStr || "(nenhuma)"}

## Base de conhecimento — trechos mais relacionados ao que está sendo dito
${kbStr || "(sem documentos relacionados)"}

${itemsStr ? `## Portfólio cadastrado\n${itemsStr}` : ""}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LIVE_COACH_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      return json(req, { error: "ai_failed", status: aiRes.status }, 500);
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

    if (!tip.should_emit || !tip.titulo || !tip.acao) {
      return json(req, { emitted: false });
    }

    // Referência ao documento usado, quando o modelo citou um da lista.
    const fonteDoc = tip.fonte
      ? rankedDocs.find((d) => d.title.toLowerCase() === String(tip.fonte).toLowerCase())
      : null;

    const categoria = categorias.includes(tip.categoria) ? tip.categoria : "proxima_pergunta";

    const { data: inserted, error: insErr } = await admin.from("live_tips").insert({
      meeting_id: meetingId,
      org_id: orgId,
      categoria: String(categoria).slice(0, 40),
      urgencia: ["baixa", "media", "alta"].includes(tip.urgencia) ? tip.urgencia : "media",
      titulo: String(tip.titulo).slice(0, 200),
      acao: String(tip.acao).slice(0, 400),
      fonte_kb_id: fonteDoc?.id ?? null,
    }).select().single();

    if (insErr) {
      console.error("insert tip error", insErr);
      return json(req, { error: "insert_failed" }, 500);
    }

    return json(req, { emitted: true, tip: inserted, criterios_cobertos: tip.criterios_cobertos ?? [] });
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    console.error("live-coach error", e);
    return json(req, { error: String(e) }, 500);
  }
});
