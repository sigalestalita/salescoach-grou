// Modo de treino: a IA representa um lead simulado.
//
// Duas formas de chamada:
//   - sem sessionId: cria uma sessão nova (persona + primeira dor a explorar)
//     e devolve a persona, sem falar nada — o vendedor abre a conversa.
//   - com sessionId + message: registra a fala do vendedor e devolve a
//     resposta do lead simulado.
//
// A persona nasce do catálogo de dores e das objeções reais já vistas nas
// reuniões da própria organização (highlights tipo "objecao"), então o
// treino soa como o negócio real da empresa, não um cenário genérico.

import { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { json, preflight } from "../_shared/cors.ts";
import { assertQuota, getCaller, HttpError, logUsage } from "../_shared/tenant.ts";
import { loadMeetingTypeContext, loadTemplate } from "../_shared/analysis-template.ts";

const ROLEPLAY_MODEL = Deno.env.get("ROLEPLAY_MODEL") ?? "google/gemini-2.5-flash";
const MAX_TURNS_HINT = 14; // ~7 idas e vindas — a partir daqui sugerimos encerrar, sem bloquear.

const LEAD_FIRST_NAMES = ["Ricardo", "Patrícia", "João", "Fernanda", "Marcos", "Luciana", "André", "Simone", "Eduardo", "Beatriz", "Cláudio", "Renata", "Gustavo", "Vanessa", "Paulo", "Aline", "Rodrigo", "Juliana", "Sérgio", "Carla"];
const LEAD_LAST_NAMES = ["Almeida", "Gomes", "Henrique", "Castro", "Vinícius", "Prado", "Teixeira", "Rocha", "Lima", "Moraes", "Santos", "Fonseca", "Pires", "Carvalho", "Martins", "Neves", "Batista", "Mendes"];
const LEAD_ROLES = ["gerente comercial", "diretor(a) de operações", "sócio(a)-fundador(a)", "coordenador(a) de compras", "gerente de projetos", "head de operações"];
const COMPANY_SUFFIX = ["Comércio e Serviços", "Distribuidora", "Grupo Empresarial", "Indústria", "Soluções Corporativas", "Consultoria", "Rede de Lojas"];

const TEMPERAMENT: Record<string, string> = {
  facil: "Receptivo. Faz poucas objeções, confirma dores quando perguntado diretamente e sinaliza interesse cedo.",
  media: "Cético, mas educado. Levanta uma ou duas objeções reais, só confirma orçamento e prazo se o vendedor perguntar bem, e não entrega informação de graça.",
  dificil: "Ocupado e desconfiado. Interrompe, questiona o valor logo no início, compara com o que já usa hoje, e só amolece se o vendedor conectar a dor certa com um número.",
};

interface Persona {
  name: string;
  role: string;
  company: string;
  temperament: string;
  focusPain: string | null;
  knownObjections: string[];
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function buildPersona(
  admin: SupabaseClient,
  orgId: string,
  difficulty: string,
  focusPainInput: string | null,
): Promise<Persona> {
  const [painsRes, objectionsRes] = await Promise.all([
    admin.from("pain_items").select("label").eq("org_id", orgId).limit(30),
    admin
      .from("highlights")
      .select("text")
      .eq("org_id", orgId)
      .eq("highlight_type", "objecao")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const pains: string[] = (painsRes.data ?? []).map((p: { label: string }) => p.label);
  const focusPain = focusPainInput || (pains.length ? pick(pains) : null);

  const allObjections: string[] = (objectionsRes.data ?? []).map((h: { text: string }) => h.text);
  // Até 3 objeções reais, distintas, para dar tempero sem virar roteiro decorado.
  const knownObjections = Array.from(new Set(allObjections)).sort(() => Math.random() - 0.5).slice(0, 3);

  return {
    name: `${pick(LEAD_FIRST_NAMES)} ${pick(LEAD_LAST_NAMES)}`,
    role: pick(LEAD_ROLES),
    company: `${pick(["Aliança", "Horizonte", "Vale Verde", "Central", "Bom Sucesso", "Nova Era", "Porto", "Planalto"])} ${pick(COMPANY_SUFFIX)}`,
    temperament: TEMPERAMENT[difficulty] ?? TEMPERAMENT.media,
    focusPain,
    knownObjections,
  };
}

function systemPrompt(persona: Persona, orgName: string, meetingTypeLabel: string | null, meetingTypeContext: string): string {
  return `Você está simulando um LEAD em uma ligação de vendas de treino, para um vendedor da empresa "${orgName}" praticar. Você NÃO é o vendedor — você é o cliente em potencial do outro lado da linha.

SEU PERSONAGEM:
- Nome: ${persona.name}
- Cargo: ${persona.role}, na empresa ${persona.company}
- Temperamento: ${persona.temperament}
${persona.focusPain ? `- Você tem esta dor, mas só a revela se o vendedor perguntar bem (não conte de graça): ${persona.focusPain}` : ""}
${persona.knownObjections.length ? `- Objeções que você pode levantar, quando fizer sentido no contexto (use no máximo uma por vez, com suas próprias palavras): ${persona.knownObjections.map((o) => `"${o}"`).join("; ")}` : ""}
${meetingTypeLabel ? `\nCONTEXTO DA CONVERSA: ${meetingTypeLabel}.${meetingTypeContext}` : ""}

REGRAS:
- Fale sempre em primeira pessoa, como ${persona.name}. Nunca saia do personagem, nunca mencione que é uma IA ou uma simulação.
- Respostas curtas e realistas, como fala ao telefone ou em videochamada — 1 a 3 frases, não parágrafos.
- Não facilite: só avance (revele orçamento, prazo, decisor) se o vendedor perguntar direito. Não ofereça informação que ninguém pediu.
- Reaja ao que o vendedor disser de verdade — se ele responder bem a uma objeção, amoleça; se ele empurrar demais sem ouvir, fique mais resistente.
- Nunca fale pelo vendedor. Você só escreve a fala do lead.`;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const ctx = await getCaller(req);
    const body = await req.json().catch(() => ({}));
    const { sessionId, message, start } = body as {
      sessionId?: string;
      message?: string;
      start?: { meetingType?: string; focusPain?: string; difficulty?: string };
    };

    // ── Criar sessão ──
    if (!sessionId) {
      await assertQuota(ctx.admin, ctx.orgId, "roleplay", 1);

      const difficulty = ["facil", "media", "dificil"].includes(start?.difficulty ?? "") ? start!.difficulty! : "media";
      const persona = await buildPersona(ctx.admin, ctx.orgId, difficulty, start?.focusPain ?? null);

      const { data: session, error } = await ctx.admin
        .from("roleplay_sessions")
        .insert({
          org_id: ctx.orgId,
          user_id: ctx.userId,
          meeting_type: start?.meetingType ?? null,
          focus_pain: persona.focusPain,
          difficulty,
          persona,
        })
        .select("id, meeting_type, focus_pain, difficulty, persona, status, turn_count, created_at")
        .single();

      if (error || !session) throw new HttpError(500, "Não foi possível iniciar o treino");

      await logUsage(ctx.admin, { orgId: ctx.orgId, userId: ctx.userId, operation: "roleplay", quantity: 1, unit: "sessoes" });

      return json(req, { session });
    }

    // ── Turno de conversa ──
    if (!message?.trim()) throw new HttpError(400, "Mensagem vazia");

    const { data: session } = await ctx.admin
      .from("roleplay_sessions")
      .select("id, org_id, user_id, meeting_type, status, turn_count, persona")
      .eq("id", sessionId)
      .eq("org_id", ctx.orgId)
      .maybeSingle();

    if (!session || session.user_id !== ctx.userId) throw new HttpError(404, "Sessão de treino não encontrada");
    if (session.status !== "em_andamento") throw new HttpError(400, "Este treino já foi encerrado");

    const persona = session.persona as Persona;

    const [{ data: history }, template, meetingTypeContext, orgRes] = await Promise.all([
      ctx.admin.from("roleplay_messages").select("role, content").eq("session_id", sessionId).order("created_at"),
      loadTemplate(ctx.admin, ctx.orgId),
      loadMeetingTypeContext(ctx.admin, ctx.orgId, session.meeting_type),
      ctx.admin.from("organizations").select("name").eq("id", ctx.orgId).maybeSingle(),
    ]);

    const meetingTypeLabel = session.meeting_type
      ? (await ctx.admin.from("meeting_types").select("label").eq("org_id", ctx.orgId).eq("key", session.meeting_type).maybeSingle()).data?.label ?? null
      : null;

    await ctx.admin.from("roleplay_messages").insert({ session_id: sessionId, org_id: ctx.orgId, role: "seller", content: message.trim() });

    const chatMessages = [
      { role: "system", content: systemPrompt(persona, orgRes.data?.name ?? "a empresa", meetingTypeLabel, meetingTypeContext) },
      ...(history ?? []).map((m: { role: string; content: string }) => ({ role: m.role === "seller" ? "user" : "assistant", content: m.content })),
      { role: "user", content: message.trim() },
    ];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: ROLEPLAY_MODEL, messages: chatMessages, temperature: 0.85, max_tokens: 220 }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) return json(req, { error: "Muitas mensagens em pouco tempo. Tente de novo em instantes." }, 429);
      if (aiResponse.status === 402) return json(req, { error: "Créditos de IA esgotados." }, 402);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const leadReply: string = aiData.choices?.[0]?.message?.content?.trim() || "Desculpa, pode repetir?";

    await ctx.admin.from("roleplay_messages").insert({ session_id: sessionId, org_id: ctx.orgId, role: "lead", content: leadReply });

    const turnCount = (session.turn_count ?? 0) + 1;
    await ctx.admin.from("roleplay_sessions").update({ turn_count: turnCount, updated_at: new Date().toISOString() }).eq("id", sessionId);

    await logUsage(ctx.admin, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      operation: "roleplay",
      quantity: 0, // a cota é cobrada na criação da sessão, não por mensagem
      unit: "mensagens",
      model: ROLEPLAY_MODEL,
      provider: "lovable-gateway",
      inputTokens: aiData.usage?.prompt_tokens ?? 0,
      outputTokens: aiData.usage?.completion_tokens ?? 0,
    });

    return json(req, { reply: leadReply, turnCount, suggestFinish: turnCount >= MAX_TURNS_HINT });
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    console.error("roleplay-chat error:", e);
    return json(req, { error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
