// Avisos da Recall sobre o robô de reunião (protótipo). Cada mudança de estado
// atualiza meeting_bots; quando o robô termina (bot.done), a reunião é criada,
// o vídeo da chamada é copiado para o Storage em partes (os links da Recall
// expiram; ver _shared/copiaVideo.ts) e a
// reunião vai para a mesma análise das gravações da extensão. Se o vendedor
// ligou o coach ao vivo pela extensão nesta chamada, a gravação entra na
// reunião que a extensão abriu (meetings.meeting_bot_id), sem duplicar.
//
// verify_jwt = false (config.toml): quem chama é a Recall. A autenticidade vem
// da assinatura (RECALL_WEBHOOK_SECRET). Responde rápido: a Recall espera 15 s
// e tenta de novo por 24 h se não receber 2xx.

import { adminClient } from "../_shared/tenant.ts";
import { avisoValido, gravacaoDoRobo } from "../_shared/recall.ts";
import { chamarCopia } from "../_shared/copiaVideo.ts";

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
    // A reunião do coach ao vivo esperava esta gravação: avisa nela.
    await admin.from("meetings").update({ status: "erro", error_message: `O robô não gravou: ${MOTIVO[evento]}${sub}` })
      .eq("meeting_bot_id", robo.id).eq("seller_id", robo.user_id).eq("status", "ao_vivo");
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
    // A análise começa já, com o link temporário da Recall (o áudio, mais leve).
    const midia = { youtube_url: audio ?? video, status: "enviado" };
    // Coach ao vivo da extensão nesta chamada: a reunião já existe, com a
    // transcrição ao vivo. Só a do próprio vendedor (a coluna vem da extensão).
    const { data: doCoach } = await admin.from("meetings").select("id, meeting_type")
      .eq("meeting_bot_id", robo.id).eq("seller_id", robo.user_id).in("status", ["ao_vivo", "erro"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    let reuniao: { id: string };
    if (doCoach) {
      const { error } = await admin.from("meetings").update({
        ...midia, error_message: null, ...(doCoach.meeting_type ? {} : { meeting_type: tipo }),
      }).eq("id", doCoach.id);
      if (error) throw error;
      reuniao = { id: doCoach.id };
    } else {
      const { data: perfil } = await admin.from("profiles").select("team_id").eq("user_id", robo.user_id).maybeSingle();
      const { data, error } = await admin.from("meetings").insert({
        title: robo.title || "Reunião gravada pelo robô",
        org_id: robo.org_id, seller_id: robo.user_id, team_id: perfil?.team_id ?? null, meeting_type: tipo,
        lead_name: robo.lead_name, lead_company: robo.lead_company, lead_email: robo.lead_email,
        meeting_url: robo.meeting_url, calendar_event_id: robo.calendar_event_id, attendees: robo.attendees,
        ...midia, meeting_date: robo.start_at ?? agora(), meeting_bot_id: robo.id,
      }).select("id").single();
      if (error || !data) throw error ?? new Error("meetings: insert");
      reuniao = data;
    }
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

    // Depois o vídeo vai para o Storage, na pasta do vendedor (como as gravações
    // da extensão), em partes e numa chamada à parte (_shared/copiaVideo.ts): uma
    // reunião longa não cabe no tempo de vida desta função. Até terminar, a
    // reunião fica com o áudio do link temporário (a Recall guarda por 7 dias).
    await admin.from("meeting_bots").update({
      copia_status: "pendente", copia_offset: 0, copia_tamanho: null, copia_upload_url: null,
      copia_tentativas: 0, copia_detalhe: null, copia_em: null, copia_lease: null,
    }).eq("id", robo.id);
    await chamarCopia(robo.id);
  } catch (e) {
    console.error("meeting-bot-webhook:", e);
    await atualizar({ status: "erro", status_detail: "Não foi possível enviar a gravação para análise." });
  }
}
