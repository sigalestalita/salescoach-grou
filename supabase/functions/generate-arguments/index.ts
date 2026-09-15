// Gerador de argumentos comerciais.
//
// O foco da oferta, o público-alvo e a persona vêm da configuração da
// organização (offer_types, org_settings, analysis_templates). Antes o prompt
// declarava a empresa e o produto direto no código.

import { json, preflight } from "../_shared/cors.ts";
import { assertQuota, getCaller, HttpError, logUsage } from "../_shared/tenant.ts";
import { loadTemplate } from "../_shared/analysis-template.ts";

const ARGUMENTS_MODEL = Deno.env.get("ARGUMENTS_MODEL") ?? "google/gemini-3-flash-preview";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const ctx = await getCaller(req);
    await assertQuota(ctx.admin, ctx.orgId, "generate_arguments", 1);

    const { context, pains, audienceType, offerType, selectedServices, selectedDocIds } =
      await req.json();

    const supabase = ctx.admin;
    const orgId = ctx.orgId;

    // Contexto da organização: base de conhecimento, ofertas, público e persona.
    const [docsRes, itemsRes, offerRes, settingsRes, orgRes, template] = await Promise.all([
      supabase.from("knowledge_documents").select("title, extracted_content, category").eq("org_id", orgId).limit(20),
      supabase.from("knowledge_items").select("name, description, category, item_type, metadata").eq("org_id", orgId).limit(50),
      supabase.from("offer_types").select("key, label, instructions, allows_item_selection").eq("org_id", orgId).eq("is_active", true).order("sort_order"),
      supabase.from("org_settings").select("argument_audiences").eq("org_id", orgId).maybeSingle(),
      supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      loadTemplate(supabase, orgId),
    ]);

    const knowledgeContext = [
      ...(docsRes.data || []).map((d: any) => `[${d.category || "doc"}] ${d.title}: ${(d.extracted_content || "").slice(0, 500)}`),
      ...(itemsRes.data || []).map((i: any) => `[${i.item_type}/${i.category || ""}] ${i.name}: ${i.description || ""}`),
    ].join("\n");

    const offers = offerRes.data ?? [];
    const offer = offers.find((o: any) => o.key === offerType) ?? offers[0] ?? null;

    // Itens escolhidos pelo executivo para focar dentro da oferta.
    let servicesContext = "";
    if (offer?.allows_item_selection !== false) {
      if (selectedServices && selectedServices.length > 0) {
        const matched = (itemsRes.data || []).filter((i: any) => selectedServices.includes(i.name));
        if (matched.length > 0) {
          servicesContext = matched
            .map((s: any) => `- ${s.name}: ${s.description || "sem descrição"}${s.metadata ? ` | Detalhes: ${JSON.stringify(s.metadata)}` : ""}`)
            .join("\n");
        }
      }

      if (!servicesContext && selectedDocIds && selectedDocIds.length > 0) {
        const { data: selectedDocs } = await supabase
          .from("knowledge_documents")
          .select("title, extracted_content, category")
          .eq("org_id", orgId)
          .in("id", selectedDocIds);

        if (selectedDocs && selectedDocs.length > 0) {
          servicesContext = selectedDocs
            .map((d: any) => `- ${d.title}: ${(d.extracted_content || "").slice(0, 800)}`)
            .join("\n\n");
        }
      }
    }

    // Análises de melhor desempenho da própria organização.
    const { data: analyses } = await supabase
      .from("analysis_results")
      .select("sales_coach, overall_score")
      .eq("org_id", orgId)
      .order("overall_score", { ascending: false })
      .limit(5);

    const topAnalyses = (analyses || [])
      .map((a: any) => {
        const coach = typeof a.sales_coach === "string" ? a.sales_coach : JSON.stringify(a.sales_coach);
        return `Score ${a.overall_score}: ${(coach || "").slice(0, 300)}`;
      })
      .join("\n");

    const painsList = (pains || []).join(", ");

    const audiences: { key: string; label: string }[] = Array.isArray(settingsRes.data?.argument_audiences)
      ? settingsRes.data!.argument_audiences
      : [];
    const audienceLabel =
      audiences.find((a) => a.key === audienceType)?.label ?? audienceType ?? "decisores";

    const orgName = orgRes.data?.name ?? "a empresa";

    const offerInstruction = offer
      ? `${offer.instructions ?? `FOCO: ${offer.label}.`}${servicesContext ? `\n\nITENS SELECIONADOS PELO EXECUTIVO (foque nestes):\n${servicesContext}` : ""}`
      : servicesContext
      ? `ITENS SELECIONADOS PELO EXECUTIVO (foque nestes):\n${servicesContext}`
      : "";

    const systemPrompt = `${template.persona} Você domina frameworks de qualificação como ${template.methodology_label}, SPIN e MEDDIC, e vende de forma consultiva em nome de ${orgName}.

Sua missão é gerar argumentos comerciais personalizados, ROI-driven, que ajudem executivos de vendas a fechar negócios.

${offerInstruction}

REGRAS CRÍTICAS:
- NUNCA gere respostas genéricas. Cruze dor + contexto + solução.
- Traduza TUDO em impacto financeiro e estratégico.
- Use linguagem consultiva, não pitch de vendas.
- Adapte a linguagem para o público: ${audienceLabel}.
- Baseie-se nos argumentos que já performaram bem em negociações anteriores.
- Use APENAS produtos, serviços e diferenciais presentes na base de conhecimento abaixo. Não invente oferta.
- Sempre conecte: DOR → SOLUÇÃO → IMPACTO FINANCEIRO.

BASE DE CONHECIMENTO DA EMPRESA:
${knowledgeContext}

ANÁLISES DE TOP PERFORMANCE (aprenda com estes padrões de sucesso):
${topAnalyses}`;

    const contextLines = Object.entries(context ?? {})
      .map(([key, value]) => `- ${key}: ${value || "não informado"}`)
      .join("\n");

    const userPrompt = `Gere argumentos comerciais completos para o seguinte cenário:

CONTEXTO DO LEAD:
${contextLines}
- Tipo de oferta: ${offer?.label ?? "portfólio completo"}

DORES IDENTIFICADAS:
${painsList}

PÚBLICO-ALVO DA COMUNICAÇÃO: ${audienceLabel}

Gere o output EXATAMENTE neste formato JSON:
{
  "arguments": [
    {
      "pain": "dor específica",
      "solution": "como a solução da empresa resolve",
      "financialImpact": "impacto financeiro estimado",
      "argument": "argumento consultivo completo pronto para uso"
    }
  ],
  "roiSimulation": {
    "summary": "resumo da simulação de ROI",
    "details": [
      { "metric": "nome da métrica", "before": "antes", "after": "depois", "saving": "economia estimada" }
    ]
  },
  "readyPhrases": {
    "proposal": "frase para proposta comercial",
    "whatsapp": "frase para WhatsApp",
    "email": "frase para e-mail",
    "meeting": "frase para reunião ao vivo"
  },
  "objectionHandling": [
    {
      "objection": "objeção comum",
      "response": "resposta consultiva para quebrar a objeção"
    }
  ]
}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ARGUMENTS_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return json(req, { error: "Rate limit exceeded. Tente novamente em alguns segundos." }, 429);
      }
      if (status === 402) {
        return json(req, { error: "Créditos de IA esgotados." }, 402);
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: content };
    } catch {
      parsed = { raw: content };
    }

    await logUsage(supabase, {
      orgId,
      userId: ctx.userId,
      operation: "generate_arguments",
      provider: "lovable-gateway",
      model: ARGUMENTS_MODEL,
      inputTokens: aiData.usage?.prompt_tokens ?? 0,
      outputTokens: aiData.usage?.completion_tokens ?? 0,
      quantity: 1,
      unit: "geracao",
      estimatedCost:
        (aiData.usage?.prompt_tokens ?? 0) * 0.000001 +
        (aiData.usage?.completion_tokens ?? 0) * 0.000004,
    });

    return json(req, parsed);
  } catch (e) {
    if (e instanceof HttpError) {
      return json(req, { error: e.message, code: e.code }, e.status);
    }
    console.error("generate-arguments error:", e);
    return json(req, { error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
