// Avisos da Recall sobre o robô de reunião (protótipo). Cada mudança de estado
// atualiza meeting_bots; quando o robô termina (bot.done), a reunião é criada
// com o áudio da Recall e vai para a mesma análise das gravações da extensão.
//
// verify_jwt = false (config.toml): quem chama é a Recall. A autenticidade vem
// da assinatura (RECALL_WEBHOOK_SECRET). Responde rápido: a Recall espera 15 s
// e tenta de novo por 24 h se não receber 2xx.

import { adminClient } from "../_shared/tenant.ts";
import { audioDoRobo, avisoValido } from "../_shared/recall.ts";

const ESTADO: Record<string, string> = {
  "bot.joining_call": "entrando",
  "bot.in_waiting_room": "sala_de_espera",
  "bot.in_call_not_recording": "na_chamada",
  "bot.recording_permission_allowed": "gravando",
  "bot.in_call_recording": "gravando",
  "bot.call_ended": "processando",
};
const MOTIVO: Record<string, string> = {
  "bot.recording_permission_denied": "O anfitrião não permitiu a gravação.",
  "bot.fatal": "O robô não conseguiu gravar a reunião.",
};
const resposta = (status = 200, corpo: unknown = { ok: true }) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return resposta(405, { error: "Use POST." });
  const corpo = await req.text();
  if (!await avisoValido(req, corpo)) return resposta(401, { error: "Assinatura inválida." });

  // deno-lint-ignore no-explicit-any
  let ev: any;
  try { ev = JSON.parse(corpo); } catch { return resposta(400, { error: "JSON inválido." }); }
  const evento: string = ev?.event ?? "";
  const botId: string = ev?.data?.bot?.id ?? "";
  if (!botId) return resposta();

  const admin = adminClient();
  const { data: robo } = await admin.from("meeting_bots").select("*").eq("provider_bot_id", botId).maybeSingle();
  if (!robo || robo.status === "cancelado" || robo.meeting_id) return resposta();
  const agora = new Date().toISOString();
  const atualizar = (campos: Record<string, unknown>) =>
    admin.from("meeting_bots").update({ ...campos, updated_at: agora }).eq("id", robo.id);

  if (ESTADO[evento]) { await atualizar({ status: ESTADO[evento], status_detail: null }); return resposta(); }
  if (MOTIVO[evento]) {
    const sub = ev?.data?.data?.sub_code ? ` (${ev.data.data.sub_code})` : "";
    await atualizar({ status: "erro", status_detail: MOTIVO[evento] + sub });
    return resposta();
  }
  if (evento !== "bot.done") return resposta();

  try {
    const audio = await audioDoRobo(botId);
    if (!audio) { await atualizar({ status: "erro", status_detail: "A Recall não devolveu a gravação." }); return resposta(); }

    let tipo = robo.meeting_type as string | null;
    if (!tipo) {
      const { data: tipos } = await admin.from("meeting_types").select("key").eq("org_id", robo.org_id).eq("is_active", true).order("sort_order").limit(1);
      tipo = tipos?.[0]?.key ?? null;
    }
    const { data: perfil } = await admin.from("profiles").select("team_id").eq("user_id", robo.user_id).maybeSingle();
    // O áudio fica no link temporário da Recall (alguns dias); a análise usa na hora.
    const { data: reuniao, error } = await admin.from("meetings").insert({
      title: robo.title || "Reunião gravada pelo robô",
      org_id: robo.org_id, seller_id: robo.user_id, team_id: perfil?.team_id ?? null, meeting_type: tipo,
      lead_name: robo.lead_name, lead_company: robo.lead_company, lead_email: robo.lead_email,
      meeting_url: robo.meeting_url, calendar_event_id: robo.calendar_event_id, attendees: robo.attendees,
      youtube_url: audio, status: "enviado", meeting_date: robo.start_at ?? agora,
    }).select("id").single();
    if (error || !reuniao) throw error ?? new Error("meetings: insert");
    await atualizar({ status: "concluido", status_detail: null, meeting_id: reuniao.id });

    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-meeting`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
      },
      body: JSON.stringify({ meetingId: reuniao.id }),
    });
    if (!r.ok) console.error("meeting-bot-webhook: análise", r.status, (await r.text()).slice(0, 300));
  } catch (e) {
    console.error("meeting-bot-webhook:", e);
    await atualizar({ status: "erro", status_detail: "Não foi possível enviar a gravação para análise." });
  }
  return resposta();
});
