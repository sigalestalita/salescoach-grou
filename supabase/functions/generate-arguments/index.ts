import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client for auth validation
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // Admin client for data queries (bypasses RLS)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { context, pains, audienceType, offerType, selectedServices, selectedDocIds } = await req.json();

    // Fetch knowledge base for context
    const [docsRes, itemsRes] = await Promise.all([
      supabase.from("knowledge_documents").select("title, extracted_content, category").limit(20),
      supabase.from("knowledge_items").select("name, description, category, item_type, metadata").limit(50),
    ]);

    const knowledgeContext = [
      ...(docsRes.data || []).map((d: any) => `[${d.category || 'doc'}] ${d.title}: ${(d.extracted_content || '').slice(0, 500)}`),
      ...(itemsRes.data || []).map((i: any) => `[${i.item_type}/${i.category || ''}] ${i.name}: ${i.description || ''}`),
    ].join("\n");

    // Build services context when relevant
    let servicesContext = "";
    if (offerType !== "pda") {
      // Try matching from knowledge_items first
      if (selectedServices && selectedServices.length > 0) {
        const allItems = itemsRes.data || [];
        const matchedServices = allItems.filter((i: any) => selectedServices.includes(i.name));
        if (matchedServices.length > 0) {
          servicesContext = matchedServices
            .map((s: any) => `- ${s.name}: ${s.description || 'sem descrição'}${s.metadata ? ` | Detalhes: ${JSON.stringify(s.metadata)}` : ''}`)
            .join("\n");
        }
      }

      // Fallback: fetch from knowledge_documents if selectedDocIds provided
      if (!servicesContext && selectedDocIds && selectedDocIds.length > 0) {
        const { data: selectedDocs } = await supabase
          .from("knowledge_documents")
          .select("title, extracted_content, category")
          .in("id", selectedDocIds);

        if (selectedDocs && selectedDocs.length > 0) {
          servicesContext = selectedDocs
            .map((d: any) => `- ${d.title}: ${(d.extracted_content || '').slice(0, 800)}`)
            .join("\n\n");
        }
      }
    }

    // Fetch recent high-scoring analyses for learning
    const { data: analyses } = await supabase
      .from("analysis_results")
      .select("sales_coach, raw_analysis, overall_score, rag_results")
      .order("overall_score", { ascending: false })
      .limit(5);

    const topAnalyses = (analyses || [])
      .map((a: any) => {
        const coach = typeof a.sales_coach === 'string' ? a.sales_coach : JSON.stringify(a.sales_coach);
        return `Score ${a.overall_score}: ${(coach || '').slice(0, 300)}`;
      })
      .join("\n");

    const painsList = (pains || []).join(", ");
    const audienceLabel = audienceType === "c-level" ? "decisores C-Level" : audienceType === "rh" ? "profissionais de RH" : "gestores operacionais";

    // Build offer-specific instructions
    let offerInstruction = "";
    if (offerType === "pda") {
      offerInstruction = `FOCO EXCLUSIVO: Licença PDA (Personal Development Analysis). 
Todos os argumentos devem girar em torno do produto PDA: assessment comportamental, licença PDA, ROI de mapeamento de perfis, assertividade em contratação e desenvolvimento.
NÃO mencione serviços de consultoria ou treinamento — foque apenas no produto/licença.`;
    } else if (offerType === "servicos") {
      offerInstruction = `FOCO EXCLUSIVO: Serviços e Treinamentos Grou.
Todos os argumentos devem girar em torno dos serviços oferecidos pela Grou (consultorias, treinamentos, diagnósticos comportamentais, workshops).
NÃO foque no produto PDA como licença — foque nos serviços que geram valor com a metodologia.
${servicesContext ? `\nSERVIÇOS SELECIONADOS PELO EXECUTIVO (foque nestes):\n${servicesContext}` : ''}`;
    } else {
      offerInstruction = `FOCO: Licença PDA + Serviços Grou combinados.
Gere argumentos que cubram tanto o produto PDA (assessment, licença PDA) quanto os serviços complementares (consultorias, treinamentos, diagnósticos).
${servicesContext ? `\nSERVIÇOS SELECIONADOS:\n${servicesContext}` : ''}`;
    }

    const systemPrompt = `Você é um especialista em vendas consultivas B2B da Grou, empresa líder em inteligência comportamental com a ferramenta PDA (Personal Development Analysis). Você domina frameworks BANT, SPIN e MEDDIC.

Sua missão é gerar argumentos comerciais personalizados, ROI-driven, que ajudem executivos de vendas a fechar negócios.

${offerInstruction}

REGRAS CRÍTICAS:
- NUNCA gere respostas genéricas. Cruze dor + contexto + solução.
- Traduza TUDO em impacto financeiro e estratégico.
- Use linguagem consultiva, não pitch de vendas.
- Adapte a linguagem para o público: ${audienceLabel}.
- Baseie-se nos argumentos que já performaram bem em negociações anteriores.
- Sempre conecte: DOR → SOLUÇÃO (PDA/Grou) → IMPACTO FINANCEIRO.

BASE DE CONHECIMENTO DA EMPRESA:
${knowledgeContext}

ANÁLISES DE TOP PERFORMANCE (aprenda com estes padrões de sucesso):
${topAnalyses}`;

    const userPrompt = `Gere argumentos comerciais completos para o seguinte cenário:

CONTEXTO DO LEAD:
- Segmento: ${context.segment || 'não informado'}
- Tamanho da empresa: ${context.companySize || 'não informado'} colaboradores
- Maturidade de RH: ${context.hrMaturity || 'não informado'}
- Tipo de venda: ${context.saleType || 'não informado'}
- Ticket estimado: ${context.estimatedTicket || 'não informado'}
- Tipo de oferta: ${offerType === 'pda' ? 'Licença PDA (produto)' : offerType === 'servicos' ? 'Serviços Grou' : 'Licença PDA + Serviços'}

DORES IDENTIFICADAS:
${painsList}

PÚBLICO-ALVO DA COMUNICAÇÃO: ${audienceLabel}

Gere o output EXATAMENTE neste formato JSON:
{
  "arguments": [
    {
      "pain": "dor específica",
      "solution": "como o PDA/Grou resolve",
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
        model: "google/gemini-3-flash-preview",
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
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Try to parse JSON from the response
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: content };
    } catch {
      parsed = { raw: content };
    }

    // Log usage
    await supabase.from("api_usage_logs").insert({
      user_id: user.id,
      operation_type: "generate_arguments",
      model_used: "google/gemini-3-flash-preview",
      input_tokens: aiData.usage?.prompt_tokens || 0,
      output_tokens: aiData.usage?.completion_tokens || 0,
      estimated_cost: ((aiData.usage?.prompt_tokens || 0) * 0.000001 + (aiData.usage?.completion_tokens || 0) * 0.000004),
    });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-arguments error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
