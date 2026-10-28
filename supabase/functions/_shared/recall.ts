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
      recording_config: { audio_mixed_mp3: {} },
      automatic_leave: { waiting_room_timeout: 900, noone_joined_timeout: 900 },
    }),
  });
}

/** Cancela: tira da agenda (se ainda não entrou) ou faz o robô sair da chamada. */
export async function cancelarRobo(id: string, jaEntrou: boolean) {
  if (jaEntrou) await recall(`/bot/${id}/leave_call/`, { method: "POST" });
  else await recall(`/bot/${id}/`, { method: "DELETE" });
}

/** Endereço temporário (alguns dias) do áudio da reunião, depois que o robô termina. */
export async function audioDoRobo(id: string): Promise<string | null> {
  const bot = await recall(`/bot/${id}/`);
  // deno-lint-ignore no-explicit-any
  const rec = (bot?.recordings ?? []).find((r: any) => r?.media_shortcuts) ?? bot?.recordings?.[0];
  const m = rec?.media_shortcuts ?? {};
  return m.audio_mixed?.data?.download_url ?? m.video_mixed?.data?.download_url ?? null;
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
