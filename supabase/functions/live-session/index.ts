// Sessão de transcrição ao vivo (extensão).
//
// Antes, o áudio passava por um WebSocket aberto na função live-transcribe,
// que repassava à AssemblyAI. Edge function tem tempo máximo de vida (150 s
// no plano gratuito, 400 s nos pagos) e pode ser encerrada antes disso com o
// socket aberto: o live parava sozinho no meio da reunião.
//
// Agora a extensão conecta direto na AssemblyAI com um token temporário que
// esta função emite (a chave da AssemblyAI nunca sai do servidor), uma
// conexão por trilha: "vendedor" (microfone) e "cliente" (áudio da aba).
//
// POST com o token do usuário:
//   { action: "start", meetingId, channels?: ["vendedor","cliente"] }
//       → { tokens: { vendedor: "...", cliente: "..." } }
//   { action: "finish", meetingId, seconds, channels }
//       → registra o consumo em api_usage_logs

import { json, preflight } from "../_shared/cors.ts";
import { getCaller, HttpError } from "../_shared/tenant.ts";

const ASSEMBLY_KEY = Deno.env.get("ASSEMBLYAI_API_KEY") ?? "";
const CHANNELS = ["vendedor", "cliente"] as const;
type Channel = (typeof CHANNELS)[number];
// Uma reunião longa cabe com folga; a AssemblyAI aceita até 3 horas.
const MAX_SESSION_SECONDS = 3 * 60 * 60;

async function assemblyToken(): Promise<string> {
  const q = new URLSearchParams({
    // Prazo para abrir a conexão; a sessão em si dura até MAX_SESSION_SECONDS.
    expires_in_seconds: "600",
    max_session_duration_seconds: String(MAX_SESSION_SECONDS),
  });
  const r = await fetch(`https://streaming.assemblyai.com/v3/token?${q}`, { headers: { Authorization: ASSEMBLY_KEY } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body?.token) {
    console.error("AssemblyAI token:", r.status, JSON.stringify(body));
    throw new HttpError(502, "Transcrição ao vivo indisponível agora.");
  }
  return body.token;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const ctx = await getCaller(req);
    const body = await req.json().catch(() => ({}));
    const meetingId = String(body.meetingId ?? "");
    if (!meetingId) throw new HttpError(400, "meetingId é obrigatório");

    const { data: meeting } = await ctx.admin.from("meetings")
      .select("id, org_id, seller_id").eq("id", meetingId).maybeSingle();
    if (!meeting || meeting.org_id !== ctx.orgId || meeting.seller_id !== ctx.userId) {
      throw new HttpError(403, "Reunião não encontrada");
    }

    const channels = (Array.isArray(body.channels) ? body.channels : CHANNELS)
      .filter((c: string): c is Channel => (CHANNELS as readonly string[]).includes(c));
    if (!channels.length) throw new HttpError(400, "Nenhuma trilha válida");

    if (body.action === "start") {
      if (!ASSEMBLY_KEY) throw new HttpError(503, "Transcrição ao vivo não configurada.");
      const tokens: Partial<Record<Channel, string>> = {};
      await Promise.all(channels.map(async (c: Channel) => { tokens[c] = await assemblyToken(); }));
      return json(req, { tokens });
    }

    if (body.action === "finish") {
      const seconds = Math.min(Math.max(Number(body.seconds) || 0, 0), MAX_SESSION_SECONDS);
      const minutes = Math.ceil(seconds / 60) * channels.length;
      if (minutes > 0) {
        const { error } = await ctx.admin.from("api_usage_logs").insert({
          org_id: ctx.orgId,
          user_id: ctx.userId,
          meeting_id: meetingId,
          operation_type: "live_transcricao",
          model_used: "u3-rt-pro",
          provider: "assemblyai",
          quantity: minutes,
          unit: "minutos",
        });
        if (error) console.error("live-session: consumo não registrado:", error.message);
      }
      return json(req, { ok: true });
    }

    throw new HttpError(400, "Ação desconhecida");
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    console.error("live-session:", e);
    return json(req, { error: "Erro inesperado" }, 500);
  }
});
