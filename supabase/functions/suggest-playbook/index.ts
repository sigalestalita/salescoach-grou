// Monta um playbook de atendimento a partir do material da empresa.
//
// Times de Customer Success, suporte e onboarding costumam ter o playbook num
// documento (roteiro de onboarding, check-in, QBR, renovação...). Esta função
// lê o texto colado pelo admin, a base de conhecimento e os tipos de reunião,
// e propõe o playbook estruturado que a IA usa para avaliar as conversas:
// objetivo, etapas com peso, boas práticas, o que evitar, sinais a detectar,
// informações a registrar e faixas de saúde do cliente. Nada é salvo aqui: a
// tela mostra a proposta para o admin revisar e salvar.
//
// POST (admin) { texto?: string, foco?: string, tipo?: string }
//   → { suggestion: { nome, persona, rationale, objetivo, etapas[], boas_praticas[],
//       evitar[], sinais[], campos[], temperature_levels[], extra_instructions } }

import { json, preflight } from "../_shared/cors.ts";
import { assertQuota, getCaller, HttpError, logUsage, requireRole } from "../_shared/tenant.ts";
import { fetchKnowledgeContext } from "../_shared/analysis-template.ts";
import { parsePlaybookSuggestion } from "../_shared/playbook-suggestion.ts";

const MODEL = Deno.env.get("ANALYSIS_MODEL") ?? "google/gemini-2.5-flash";
const MAX_TEXT_CHARS = 30_000;
const MAX_KB_CHARS = 20_000;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const ctx = await getCaller(req);
    requireRole(ctx, "admin");
    const body = await req.json().catch(() => ({}));
    const texto = clean(body.texto, MAX_TEXT_CHARS);
    const foco = clean(body.foco, 2000);
    const tipo = clean(body.tipo, 80);
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new HttpError(503, "IA não configurada.");
    await assertQuota(ctx.admin, ctx.orgId, "analise", 1);

    const [knowledge, { data: org }, { data: types }] = await Promise.all([
      fetchKnowledgeContext(ctx.admin, ctx.orgId),
      ctx.admin.from("organizations").select("name").eq("id", ctx.orgId).maybeSingle(),
      ctx.admin.from("meeting_types").select("label, prompt_context").eq("org_id", ctx.orgId).eq("is_active", true).order("sort_order"),
    ]);

    if (!texto && !foco && !knowledge.trim()) {
      throw new HttpError(400, "Cole o playbook do time ou descreva como é o atendimento antes de pedir a sugestão.");
    }

    const prompt = `Você é um especialista em Customer Success e operações de atendimento. Monte um playbook estruturado para a empresa "${org?.name ?? "cliente"}", que será usado por uma IA para avaliar gravações de conversas do time com clientes e orientar o time ao vivo.

${tipo ? `O playbook é para conversas do tipo "${tipo}".\n` : ""}Baseie-se PRINCIPALMENTE no playbook que a empresa colou abaixo. Se ele não existir, use a descrição do admin e a base de conhecimento. Não é um processo de vendas: o foco é a condução da conversa com quem já é cliente (ou está entrando), a saúde da conta e os sinais de risco e de oportunidade.

Regras:
- "etapas": de 4 a 10, na ordem em que acontecem, cada uma observável numa conversa (a IA precisa conseguir dizer, pela transcrição, se a etapa aconteceu). Pesos inteiros que somam 100, maiores para o que mais importa. "required": true só para o que não pode faltar.
- "boas_praticas" e "evitar": comportamentos concretos, em frases curtas.
- "sinais": o que o cliente pode dizer que indica risco (de cancelamento, insatisfação, baixo uso), oportunidade (expansão, indicação, novo produto) ou atenção. Cada um com "tipo": risco | oportunidade | atencao.
- "campos": informações que vale registrar quando aparecem (ex.: responsável do cliente, data de go-live, meta do cliente).
- "temperature_levels": exatamente 5 faixas de SAÚDE do cliente, da pior para a melhor, cada uma com uma regra clara.
- "objetivo": o que a conversa precisa alcançar, em 1-2 frases.
- "persona": quem a IA é ao avaliar (ex.: "Você é o head de Customer Success da X.").
- "extra_instructions": regras da operação tiradas do material (SLAs, políticas, o que pode ou não ser prometido). Em tópicos curtos.
- "expansao_comercial": true se, nesta conversa, o time também vende para a carteira (upsell, cross-sell, renovação com proposta comercial); false se não.
- "rationale": 2 a 3 frases explicando a estrutura, citando o material.
- Português do Brasil. Não invente políticas, prazos ou produtos que não estejam no material.

Responda APENAS com JSON:
{"nome": "...", "persona": "...", "rationale": "...", "objetivo": "...", "etapas": [{"label": "...", "description": "...", "max_score": 0, "required": false}], "boas_praticas": ["..."], "evitar": ["..."], "sinais": [{"label": "...", "description": "...", "tipo": "risco"}], "campos": [{"label": "...", "description": "..."}], "temperature_levels": [{"label": "...", "criteria": "..."}], "extra_instructions": "...", "expansao_comercial": false}

=== PLAYBOOK DA EMPRESA (colado pelo admin) ===
${texto || "(não enviado)"}

=== O QUE O ADMIN CONTOU ===
${foco || "(nada)"}

=== TIPOS DE REUNIÃO ===
${(types ?? []).map((t) => `- ${t.label}${t.prompt_context ? `: ${t.prompt_context}` : ""}`).join("\n") || "(nenhum)"}

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
      console.error("suggest-playbook AI:", aiRes.status, await aiRes.text());
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
      suggestion = parsePlaybookSuggestion(ai.choices?.[0]?.message?.content ?? "");
    } catch (e) {
      console.error("suggest-playbook parse:", e);
      throw new HttpError(502, "A IA devolveu um playbook incompleto. Tente de novo.");
    }
    return json(req, { suggestion });
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    console.error("suggest-playbook:", e);
    return json(req, { error: "Erro inesperado." }, 500);
  }
});
