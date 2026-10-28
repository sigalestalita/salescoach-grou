// Avisos da Recall sobre o robô de reunião (protótipo). Cada mudança de estado
// atualiza meeting_bots; quando o robô termina (bot.done), a reunião é criada,
// o vídeo da chamada é copiado para o Storage (os links da Recall expiram) e a
// reunião vai para a mesma análise das gravações da extensão.
//
// verify_jwt = false (config.toml): quem chama é a Recall. A autenticidade vem
// da assinatura (RECALL_WEBHOOK_SECRET). Responde rápido: a Recall espera 15 s
// e tenta de novo por 24 h se não receber 2xx.

import { adminClient } from "../_shared/tenant.ts";
import { avisoValido, gravacaoDoRobo } from "../_shared/recall.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

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
  if (!robo || ["cancelado", "concluido"].includes(robo.status) || robo.meeting_id) return resposta();
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

  // A cópia do vídeo pode levar mais que os 15 s que a Recall espera: responde já
  // e termina em segundo plano. Marcar "concluido" antes impede que um aviso
  // repetido duplique a reunião; se algo falhar, finalizar() troca para "erro".
  await atualizar({ status: "concluido", status_detail: null });
  EdgeRuntime.waitUntil(finalizar(admin, robo, botId));
  return resposta();
});

// deno-lint-ignore no-explicit-any
async function finalizar(admin: any, robo: any, botId: string) {
  const agora = () => new Date().toISOString();
  const atualizar = (campos: Record<string, unknown>) =>
    admin.from("meeting_bots").update({ ...campos, updated_at: agora() }).eq("id", robo.id);
  try {
    const { video, audio } = await gravacaoDoRobo(botId);
    if (!video && !audio) { await atualizar({ status: "erro", status_detail: "A Recall não devolveu a gravação." }); return; }

    let tipo = robo.meeting_type as string | null;
    if (!tipo) {
      const { data: tipos } = await admin.from("meeting_types").select("key").eq("org_id", robo.org_id).eq("is_active", true).order("sort_order").limit(1);
      tipo = tipos?.[0]?.key ?? null;
    }
    const { data: perfil } = await admin.from("profiles").select("team_id").eq("user_id", robo.user_id).maybeSingle();
    const { data: reuniao, error } = await admin.from("meetings").insert({
      title: robo.title || "Reunião gravada pelo robô",
      org_id: robo.org_id, seller_id: robo.user_id, team_id: perfil?.team_id ?? null, meeting_type: tipo,
      lead_name: robo.lead_name, lead_company: robo.lead_company, lead_email: robo.lead_email,
      meeting_url: robo.meeting_url, calendar_event_id: robo.calendar_event_id, attendees: robo.attendees,
      // A análise começa já, com o link temporário da Recall (o áudio, mais leve).
      youtube_url: audio ?? video, status: "enviado", meeting_date: robo.start_at ?? agora(),
    }).select("id").single();
    if (error || !reuniao) throw error ?? new Error("meetings: insert");
    await atualizar({ meeting_id: reuniao.id });

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
    if (!video) return;

    // Depois guarda o vídeo no Storage, na pasta do vendedor (como as gravações da
    // extensão), e o player passa a mostrá-lo. Se a cópia falhar ou for interrompida,
    // a reunião fica com o áudio do link temporário (a Recall guarda por 7 dias).
    const caminho = `${robo.user_id}/robo-${reuniao.id}.mp4`;
    try {
      const baixar = await fetch(video);
      if (!baixar.ok || !baixar.body) throw new Error(`download ${baixar.status}`);
      const tamanho = baixar.headers.get("content-length");
      const subir = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/meeting-files/${caminho}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "video/mp4",
          "x-upsert": "true",
          ...(tamanho ? { "Content-Length": tamanho } : {}),
        },
        body: baixar.body,
        duplex: "half",
      } as RequestInit);
      if (!subir.ok) throw new Error(`upload ${subir.status}: ${(await subir.text()).slice(0, 200)}`);
      await admin.from("meetings").update({ file_url: caminho, file_type: "mp4", gravou_tela: true, youtube_url: null }).eq("id", reuniao.id);
    } catch (e) {
      console.error("meeting-bot-webhook: cópia do vídeo", e);
    }
  } catch (e) {
    console.error("meeting-bot-webhook:", e);
    await atualizar({ status: "erro", status_detail: "Não foi possível enviar a gravação para análise." });
  }
}
