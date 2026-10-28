// Robô de reunião (Recall.ai): um participante que entra no Meet, Teams ou Zoom
// pelos servidores da Recall e grava a chamada. O computador do vendedor não
// grava nada. Segredos: RECALL_API_KEY, RECALL_REGION (padrão us-west-2) e
// RECALL_WEBHOOK_SECRET (whsec_..., para conferir os avisos da Recall).

const REGIAO = Deno.env.get("RECALL_REGION") ?? "us-west-2";
const BASE = `https://${REGIAO}.recall.ai/api/v1`;

export const recallAtivo = () => !!Deno.env.get("RECALL_API_KEY");

export class RecallError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

async function recall(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Token ${Deno.env.get("RECALL_API_KEY")}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const texto = await res.text();
  if (!res.ok) {
    console.error("recall:", path, res.status, texto.slice(0, 500));
    throw new RecallError(res.status === 404 ? "Robô não encontrado na Recall." : `A Recall recusou o pedido (${res.status}).`, res.status);
  }
  return texto ? JSON.parse(texto) : null;
}

/** Plataformas que o robô atende. */
export function plataformaDe(url: string): "meet" | "teams" | "zoom" | null {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  if (host === "meet.google.com") return "meet";
  if (/(^|\.)teams\.(microsoft|live)\.com$/.test(host)) return "teams";
  if (/(^|\.)zoom\.us$/.test(host)) return "zoom";
  return null;
}

export interface NovoRobo {
  meetingUrl: string;
  nome: string;
  inicio: Date | null;
  metadata: Record<string, string>;
}

/** Agenda o robô. Com mais de 10 minutos de antecedência, a Recall reserva o robô para a hora certa. */
export function criarRobo(r: NovoRobo): Promise<{ id: string }> {
  const agendado = r.inicio && r.inicio.getTime() - Date.now() > 10 * 60_000;
  return recall("/bot/", {
    method: "POST",
    body: JSON.stringify({
      meeting_url: r.meetingUrl,
      bot_name: r.nome.slice(0, 100),
      ...(agendado ? { join_at: r.inicio!.toISOString() } : {}),
      metadata: r.metadata,
      // Vídeo da chamada (quem fala e a tela compartilhada) e o áudio à parte, mais leve, de reserva.
      recording_config: { video_mixed_mp4: {}, audio_mixed_mp3: {} },
      automatic_leave: { waiting_room_timeout: 900, noone_joined_timeout: 900 },
    }),
  });
}

/** Cancela: tira da agenda (se ainda não entrou) ou faz o robô sair da chamada. */
export async function cancelarRobo(id: string, jaEntrou: boolean) {
  if (jaEntrou) await recall(`/bot/${id}/leave_call/`, { method: "POST" });
  else await recall(`/bot/${id}/`, { method: "DELETE" });
}

/**
 * Por que o robô saiu da chamada (sub_code do aviso bot.call_ended), em
 * português. Sem tradução, devolve null e a saída foi normal.
 */
export function motivoDaSaida(subCode: string | null | undefined): string | null {
  const motivos: Record<string, string> = {
    timeout_exceeded_waiting_room: "ninguém admitiu o robô: ele esperou 15 minutos na sala de espera do Meet e saiu",
    bot_kicked_from_waiting_room: "o robô foi recusado na sala de espera",
    timeout_exceeded_noone_joined: "ninguém entrou na reunião em 15 minutos (o link da agenda era o mesmo da chamada?)",
    bot_kicked_from_call: "o robô foi removido da chamada",
    timeout_exceeded_recording_permission_denied: "o anfitrião não permitiu a gravação",
    meeting_not_found: "o link da reunião não existe",
    meeting_link_invalid: "o link da reunião é inválido",
    meeting_not_started: "a reunião não tinha começado",
    meeting_full: "a reunião estava lotada",
    meeting_requires_sign_in: "a reunião só aceita participantes com login",
    google_meet_sign_in_required: "a reunião só aceita participantes com login",
    google_meet_sign_in_failed: "a reunião só aceita participantes com login",
  };
  return subCode ? motivos[subCode] ?? null : null;
}

/** Endereços temporários da gravação (vídeo e áudio), depois que o robô termina. */
export async function gravacaoDoRobo(id: string): Promise<{ video: string | null; audio: string | null }> {
  const bot = await recall(`/bot/${id}/`);
  // deno-lint-ignore no-explicit-any
  const rec = (bot?.recordings ?? []).find((r: any) => r?.media_shortcuts) ?? bot?.recordings?.[0];
  const m = rec?.media_shortcuts ?? {};
  return { video: m.video_mixed?.data?.download_url ?? null, audio: m.audio_mixed?.data?.download_url ?? null };
}

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/**
 * Confere a assinatura do aviso da Recall (padrão Standard Webhooks/Svix):
 * HMAC-SHA256 de "{id}.{timestamp}.{corpo}" com a chave do segredo whsec_.
 * Aceita os cabeçalhos webhook-* e os antigos svix-*.
 */
export async function avisoValido(req: Request, corpo: string): Promise<boolean> {
  const segredo = Deno.env.get("RECALL_WEBHOOK_SECRET") ?? "";
  if (!segredo.startsWith("whsec_")) return false;
  const h = (n: string) => req.headers.get(`webhook-${n}`) ?? req.headers.get(`svix-${n}`) ?? "";
  const id = h("id"), ts = h("timestamp"), assinaturas = h("signature");
  if (!id || !ts || !assinaturas) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 10 * 60) return false;
  const chave = await crypto.subtle.importKey("raw", b64(segredo.slice(6)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperado = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(`${id}.${ts}.${corpo}`)));
  for (const parte of assinaturas.split(" ")) {
    const [versao, sig] = parte.split(",");
    if (versao !== "v1" || !sig) continue;
    let recebido: Uint8Array;
    try { recebido = b64(sig); } catch { continue; }
    if (recebido.length !== esperado.length) continue;
    let dif = 0;
    for (let i = 0; i < esperado.length; i++) dif |= esperado[i] ^ recebido[i];
    if (dif === 0) return true;
  }
  return false;
}
