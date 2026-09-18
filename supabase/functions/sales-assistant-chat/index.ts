// Assistente de vendas em pop-up: responde perguntas sobre as agendas da
// organização com acesso real aos dados (não é um resumo estático).
//
// Usa chamada de ferramentas: o modelo pede os dados que precisa (buscar
// reuniões, detalhar uma reunião, estatísticas do time, objeções frequentes),
// este servidor executa a consulta já filtrada pelo papel de quem pergunta —
// vendedor só vê o que é dele, gestor e admin veem o time — e devolve o
// resultado para o modelo formular a resposta final.
//
// Service role bypassa RLS, então o escopo por papel é aplicado aqui, à mão,
// igual ao resto das funções deste projeto (ver _shared/tenant.ts).

import { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { json, preflight } from "../_shared/cors.ts";
import { assertQuota, CallerContext, getCaller, HttpError, logUsage } from "../_shared/tenant.ts";

const ASSISTANT_MODEL = Deno.env.get("ASSISTANT_MODEL") ?? "google/gemini-2.5-flash";
const MAX_TOOL_ROUNDS = 4;
const HISTORY_LIMIT = 16;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "buscar_agendas",
      description: "Busca reuniões (agendas) da organização por texto, vendedor, tipo, temperatura ou período. Use antes de detalhar_agenda quando não tiver o id.",
      parameters: {
        type: "object",
        properties: {
          texto: { type: "string", description: "Busca livre em título, nome do lead ou empresa do lead" },
          vendedor: { type: "string", description: "Nome (ou parte do nome) do executivo de vendas. Ignorado se quem pergunta for um vendedor — nesse caso a busca já é só dele." },
          temperatura: { type: "string", description: "congelado, frio, morno, quente ou muito_quente" },
          periodo_dias: { type: "number", description: "Só reuniões dos últimos N dias" },
          limite: { type: "number", description: "Máximo de resultados, padrão 10" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detalhar_agenda",
      description: "Traz o detalhe completo de uma reunião: score, temperatura, critérios da metodologia, insights, próximos passos e um resumo da transcrição.",
      parameters: {
        type: "object",
        properties: { reuniao_id: { type: "string" } },
        required: ["reuniao_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "estatisticas_time",
      description: "Estatísticas agregadas: total de reuniões, score médio, distribuição de temperatura e ranking por vendedor. Para vendedor, mostra só os próprios números.",
      parameters: {
        type: "object",
        properties: { periodo_dias: { type: "number", description: "Padrão 30" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "objecoes_frequentes",
      description: "Lista as objeções mais recentes levantadas por leads nas reuniões, com o contexto de cada uma.",
      parameters: {
        type: "object",
        properties: { periodo_dias: { type: "number", description: "Padrão 30" }, limite: { type: "number", description: "Padrão 12" } },
      },
    },
  },
] as const;

function scopedSellerFilter(ctx: CallerContext, requested?: string) {
  // Vendedor nunca enxerga dado alheio, mesmo que o modelo peça.
  return ctx.role === "vendedor" ? { onlySelf: true, name: null } : { onlySelf: false, name: requested ?? null };
}

async function resolveSellerIds(admin: SupabaseClient, orgId: string, namePart: string): Promise<string[]> {
  const { data } = await admin.from("profiles").select("user_id").eq("org_id", orgId).ilike("full_name", `%${namePart}%`);
  return (data ?? []).map((p: { user_id: string }) => p.user_id);
}

async function toolBuscarAgendas(ctx: CallerContext, args: Record<string, unknown>) {
  const filter = scopedSellerFilter(ctx, args.vendedor as string | undefined);
  let query = ctx.admin
    .from("meetings")
    .select("id, title, lead_name, lead_company, meeting_type, status, overall_score, temperature, meeting_date, seller_id")
    .eq("org_id", ctx.orgId)
    .order("meeting_date", { ascending: false })
    .limit(Math.min(Number(args.limite) || 10, 25));

  if (filter.onlySelf) query = query.eq("seller_id", ctx.userId);
  else if (filter.name) {
    const ids = await resolveSellerIds(ctx.admin, ctx.orgId, filter.name);
    if (ids.length === 0) return { resultado: "Nenhum executivo encontrado com esse nome." };
    query = query.in("seller_id", ids);
  }
  if (args.texto) query = query.or(`title.ilike.%${args.texto}%,lead_name.ilike.%${args.texto}%,lead_company.ilike.%${args.texto}%`);
  if (args.temperatura) query = query.eq("temperature", args.temperatura);
  if (args.periodo_dias) query = query.gte("meeting_date", new Date(Date.now() - Number(args.periodo_dias) * 86400000).toISOString());

  const { data, error } = await query;
  if (error) return { erro: error.message };

  const sellerIds = Array.from(new Set((data ?? []).map((m: { seller_id: string }) => m.seller_id)));
  const { data: profiles } = sellerIds.length
    ? await ctx.admin.from("profiles").select("user_id, full_name").in("user_id", sellerIds)
    : { data: [] as { user_id: string; full_name: string }[] };
  const nameOf = new Map((profiles ?? []).map((p: { user_id: string; full_name: string }) => [p.user_id, p.full_name]));

  return {
    reunioes: (data ?? []).map((m: Record<string, unknown>) => ({
      id: m.id,
      titulo: m.title,
      lead: m.lead_name,
      empresa: m.lead_company,
      vendedor: nameOf.get(m.seller_id as string) ?? null,
      tipo: m.meeting_type,
      status: m.status,
      score: m.overall_score,
      temperatura: m.temperature,
      data: m.meeting_date,
    })),
  };
}

async function toolDetalharAgenda(ctx: CallerContext, args: Record<string, unknown>) {
  const id = args.reuniao_id as string;
  const { data: meeting } = await ctx.admin
    .from("meetings")
    .select("id, title, lead_name, lead_company, meeting_type, status, overall_score, temperature, meeting_date, seller_id, org_id")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (!meeting) return { erro: "Reunião não encontrada" };
  if (ctx.role === "vendedor" && meeting.seller_id !== ctx.userId) return { erro: "Sem acesso a essa reunião" };

  const [{ data: analysis }, { data: transcription }, { data: highlights }] = await Promise.all([
    ctx.admin.from("analysis_results").select("overall_score, temperature, bant_score, insights, sales_coach, rag_results, raw_analysis").eq("meeting_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ctx.admin.from("transcriptions").select("full_text").eq("meeting_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ctx.admin.from("highlights").select("highlight_type, text").eq("meeting_id", id),
  ]);

  return {
    titulo: meeting.title,
    lead: meeting.lead_name,
    empresa: meeting.lead_company,
    tipo: meeting.meeting_type,
    status: meeting.status,
    score: meeting.overall_score,
    temperatura: meeting.temperature,
    data: meeting.meeting_date,
    analise: analysis
      ? {
          bant: analysis.bant_score,
          pontos_positivos: (analysis.insights as { positives?: string[] } | null)?.positives ?? [],
          pontos_a_melhorar: (analysis.insights as { improvements?: string[] } | null)?.improvements ?? [],
          proximos_passos: (analysis.sales_coach as { next_steps?: string[] } | null)?.next_steps ?? [],
          aderencia_base_conhecimento: (analysis.rag_results as { knowledge_adherence_score?: number } | null)?.knowledge_adherence_score ?? null,
          justificativa_score: (analysis.raw_analysis as { overall_score_reason?: string } | null)?.overall_score_reason ?? null,
          justificativa_temperatura: (analysis.raw_analysis as { temperature_reason?: string } | null)?.temperature_reason ?? null,
        }
      : null,
    destaques: (highlights ?? []).map((h: { highlight_type: string; text: string }) => ({ tipo: h.highlight_type, texto: h.text })),
    trecho_transcricao: (transcription?.full_text ?? "").slice(0, 2500),
  };
}

async function toolEstatisticasTime(ctx: CallerContext, args: Record<string, unknown>) {
  const periodo = Number(args.periodo_dias) || 30;
  const since = new Date(Date.now() - periodo * 86400000).toISOString();
  let query = ctx.admin.from("meetings").select("seller_id, overall_score, temperature, status").eq("org_id", ctx.orgId).gte("meeting_date", since);
  if (ctx.role === "vendedor") query = query.eq("seller_id", ctx.userId);

  const { data } = await query;
  const rows = data ?? [];
  const completed = rows.filter((r: { status: string }) => r.status === "completo");
  const scores = completed.map((r: { overall_score: number | null }) => r.overall_score).filter((s: number | null): s is number => s != null);
  const avg = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : null;

  const tempCounts: Record<string, number> = {};
  for (const r of completed as { temperature: string | null }[]) if (r.temperature) tempCounts[r.temperature] = (tempCounts[r.temperature] ?? 0) + 1;

  let ranking: { vendedor: string; score_medio: number; reunioes: number }[] = [];
  if (ctx.role !== "vendedor") {
    const bySeller = new Map<string, number[]>();
    for (const r of completed as { seller_id: string; overall_score: number | null }[]) {
      if (r.overall_score == null) continue;
      if (!bySeller.has(r.seller_id)) bySeller.set(r.seller_id, []);
      bySeller.get(r.seller_id)!.push(r.overall_score);
    }
    const ids = Array.from(bySeller.keys());
    const { data: profiles } = ids.length ? await ctx.admin.from("profiles").select("user_id, full_name").in("user_id", ids) : { data: [] as { user_id: string; full_name: string }[] };
    const nameOf = new Map((profiles ?? []).map((p: { user_id: string; full_name: string }) => [p.user_id, p.full_name]));
    ranking = ids
      .map((id) => {
        const s = bySeller.get(id)!;
        return { vendedor: nameOf.get(id) ?? "Sem nome", score_medio: Math.round(s.reduce((a, b) => a + b, 0) / s.length), reunioes: s.length };
      })
      .sort((a, b) => b.score_medio - a.score_medio);
  }

  return { periodo_dias: periodo, total_reunioes: rows.length, analisadas: completed.length, score_medio: avg, distribuicao_temperatura: tempCounts, ranking };
}

async function toolObjecoesFrequentes(ctx: CallerContext, args: Record<string, unknown>) {
  const periodo = Number(args.periodo_dias) || 30;
  const since = new Date(Date.now() - periodo * 86400000).toISOString();

  let meetingsQuery = ctx.admin.from("meetings").select("id, title, lead_company").eq("org_id", ctx.orgId).gte("meeting_date", since);
  if (ctx.role === "vendedor") meetingsQuery = meetingsQuery.eq("seller_id", ctx.userId);
  const { data: meetings } = await meetingsQuery;
  const meetingIds = (meetings ?? []).map((m: { id: string }) => m.id);
  if (meetingIds.length === 0) return { objecoes: [] };

  const meetingById = new Map((meetings ?? []).map((m: { id: string; title: string; lead_company: string | null }) => [m.id, m]));
  const { data: highlights } = await ctx.admin
    .from("highlights")
    .select("meeting_id, text, created_at")
    .eq("highlight_type", "objecao")
    .in("meeting_id", meetingIds)
    .order("created_at", { ascending: false })
    .limit(Math.min(Number(args.limite) || 12, 30));

  return {
    objecoes: (highlights ?? []).map((h: { meeting_id: string; text: string }) => ({
      texto: h.text,
      reuniao: meetingById.get(h.meeting_id)?.title ?? null,
      empresa: meetingById.get(h.meeting_id)?.lead_company ?? null,
    })),
  };
}

const TOOL_HANDLERS: Record<string, (ctx: CallerContext, args: Record<string, unknown>) => Promise<unknown>> = {
  buscar_agendas: toolBuscarAgendas,
  detalhar_agenda: toolDetalharAgenda,
  estatisticas_time: toolEstatisticasTime,
  objecoes_frequentes: toolObjecoesFrequentes,
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const ctx = await getCaller(req);
    await assertQuota(ctx.admin, ctx.orgId, "assistant_chat", 1);

    const { conversationId, message, reset } = await req.json();
    if (!message?.trim()) throw new HttpError(400, "Mensagem vazia");

    let conversation: { id: string; title: string | null };
    if (!reset && conversationId) {
      const { data } = await ctx.admin.from("assistant_conversations").select("id, title").eq("id", conversationId).eq("org_id", ctx.orgId).eq("user_id", ctx.userId).maybeSingle();
      if (!data) throw new HttpError(404, "Conversa não encontrada");
      conversation = data;
    } else if (!reset) {
      const { data } = await ctx.admin.from("assistant_conversations").select("id, title").eq("org_id", ctx.orgId).eq("user_id", ctx.userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      conversation = data ?? (await ctx.admin.from("assistant_conversations").insert({ org_id: ctx.orgId, user_id: ctx.userId }).select("id, title").single()).data;
    } else {
      const { data } = await ctx.admin.from("assistant_conversations").insert({ org_id: ctx.orgId, user_id: ctx.userId }).select("id, title").single();
      conversation = data;
    }
    if (!conversation) throw new HttpError(500, "Não foi possível abrir a conversa");

    const { data: history } = await ctx.admin
      .from("assistant_messages")
      .select("role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    await ctx.admin.from("assistant_messages").insert({ conversation_id: conversation.id, org_id: ctx.orgId, role: "user", content: message.trim() });

    if (!conversation.title) {
      await ctx.admin.from("assistant_conversations").update({ title: message.trim().slice(0, 60) }).eq("id", conversation.id);
    }

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = `Você é o assistente de vendas do Sales Coach, respondendo dentro do próprio produto. Hoje é ${today}. Quem pergunta é um(a) ${ctx.role ?? "usuário"} desta organização.

Use as ferramentas disponíveis para buscar dados reais antes de responder qualquer pergunta sobre reuniões, vendedores, scores ou objeções — nunca invente números. Se as ferramentas não trouxerem o que foi pedido, diga isso com clareza em vez de supor.

Responda em português, direto ao ponto, como quem já olhou os dados. Cite nomes de reuniões, empresas e vendedores quando ajudar. A resposta aparece num balão de chat estreito: no máximo 5 linhas ou 5 itens de lista, sem introdução nem fechamento — vá direto ao conteúdo. Use markdown só para negrito e listas simples. Não exponha dados de outros vendedores para quem tem papel de vendedor — as ferramentas já filtram isso, mas não sugira que existe algo além do que veio na resposta.`;

    const messages: Record<string, unknown>[] = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).reverse().map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      { role: "user", content: message.trim() },
    ];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const usedTools: { name: string; args: Record<string, unknown> }[] = [];
    let totalIn = 0;
    let totalOut = 0;
    let finalText = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: ASSISTANT_MODEL, messages, tools: TOOLS, tool_choice: "auto", temperature: 0.3 }),
      });

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) return json(req, { error: "Muitas perguntas em pouco tempo. Tente de novo em instantes." }, 429);
        if (aiResponse.status === 402) return json(req, { error: "Créditos de IA esgotados." }, 402);
        throw new Error(`AI gateway error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      totalIn += aiData.usage?.prompt_tokens ?? 0;
      totalOut += aiData.usage?.completion_tokens ?? 0;
      const choice = aiData.choices?.[0]?.message;
      const toolCalls = choice?.tool_calls as { id: string; function: { name: string; arguments: string } }[] | undefined;

      if (!toolCalls || toolCalls.length === 0) {
        finalText = choice?.content?.trim() || "Não consegui montar uma resposta agora. Tenta reformular a pergunta?";
        break;
      }

      messages.push({ role: "assistant", content: choice.content ?? null, tool_calls: toolCalls });
      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch { /* argumentos malformados viram objeto vazio */ }
        const handler = TOOL_HANDLERS[call.function.name];
        const result = handler ? await handler(ctx, args) : { erro: "Ferramenta desconhecida" };
        usedTools.push({ name: call.function.name, args });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 6000) });
      }

      if (round === MAX_TOOL_ROUNDS - 1) {
        finalText = "Encontrei os dados, mas a pergunta ficou complexa demais para eu resumir agora. Pode perguntar de um jeito mais específico?";
      }
    }

    await ctx.admin.from("assistant_messages").insert({
      conversation_id: conversation.id,
      org_id: ctx.orgId,
      role: "assistant",
      content: finalText,
      meta: usedTools.length ? { tools: usedTools } : null,
    });

    await logUsage(ctx.admin, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      operation: "assistant_chat",
      quantity: 1,
      unit: "mensagens",
      model: ASSISTANT_MODEL,
      provider: "lovable-gateway",
      inputTokens: totalIn,
      outputTokens: totalOut,
    });

    return json(req, { conversationId: conversation.id, message: finalText, tools: usedTools });
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    console.error("sales-assistant-chat error:", e);
    return json(req, { error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
