// Cliente da Recall.ai: o bot que entra na reunião e a agenda conectada.
//
// Documentação: https://docs.recall.ai
// - RECALL_API_BASE: endereço da região da conta (ex.: https://us-west-2.recall.ai)
// - RECALL_API_KEY: chave da API
// - RECALL_WEBHOOK_SECRET: segredo de verificação do workspace (whsec_...)
// - Bot agendado com mais de 10 minutos de antecedência entra na hora certa;
//   com menos, sai de um grupo de bots prontos, que pode esgotar (erro 507).

export class RecallError extends Error {
  constructor(message: string, public status = 500, public retryable = false) {
    super(message);
  }
}

function base(): string {
  const b = (Deno.env.get("RECALL_API_BASE") ?? "").replace(/\/$/, "");
  if (!b) throw new RecallError("Bot de reunião não configurado na plataforma (RECALL_API_BASE).", 400);
  return b;
}

function key(): string {
  const k = Deno.env.get("RECALL_API_KEY");
  if (!k) throw new RecallError("Bot de reunião não configurado na plataforma (RECALL_API_KEY).", 400);
  return k;
}

type Json = Record<string, unknown>;

export async function recall(method: string, path: string, body?: unknown): Promise<Json> {
  const url = path.startsWith("http") ? path : `${base()}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Token ${key()}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return {};
  const text = await res.text();
  let json: Json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { detail: text.slice(0, 300) }; }
  if (res.ok) return json;
  const detail = String(json.detail ?? json.message ?? JSON.stringify(json.errors ?? json).slice(0, 300));
  if (res.status === 507) throw new RecallError("Nenhum bot disponível agora. Tente de novo em alguns minutos.", 507, true);
  if (res.status === 429) throw new RecallError("Muitas solicitações ao serviço do bot. Tente de novo em instantes.", 429, true);
  if (res.status === 401 || res.status === 403) throw new RecallError("Chave do serviço do bot inválida.", res.status);
  throw new RecallError(`Serviço do bot recusou: ${detail}`, res.status, res.status >= 500);
}

// ── Links de reunião ────────────────────────────────────────────────────────

const MEETING_URL_PATTERNS = [
  /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i,
  /^https:\/\/teams\.microsoft\.com\/(l\/meetup-join|meet)\//i,
  /^https:\/\/teams\.live\.com\/meet\//i,
  /^https:\/\/([a-z0-9-]+\.)?zoom\.us\/(j|my|w)\//i,
];

/** Link de Meet, Teams ou Zoom que o bot consegue abrir. */
export function isMeetingUrl(url: string): boolean {
  return MEETING_URL_PATTERNS.some((re) => re.test(url.trim()));
}

// ── Configuração do bot ─────────────────────────────────────────────────────

export interface BotMeta {
  orgId: string;
  meetingId: string;
  userId: string;
}

/** Configuração comum a todo bot do Sales Coach. */
export function botConfig(meta: BotMeta, productName: string, extra: Json = {}): Json {
  const nome = productName || "Sales Coach";
  return {
    bot_name: `${nome} · gravação`,
    // Só o áudio: é o que a análise usa, e o arquivo fica pequeno.
    recording_config: { audio_mixed_mp3: {} },
    // Avisa na reunião que ela está sendo gravada (consentimento, LGPD).
    chat: {
      on_bot_join: {
        send_to: "everyone",
        message: `Olá! Sou o assistente de gravação do ${nome}. Esta reunião está sendo gravada para gerar o resumo e os próximos passos.`,
      },
    },
    metadata: { org_id: meta.orgId, meeting_id: meta.meetingId, user_id: meta.userId, source: "salescoach" },
    ...extra,
  };
}

/** join_at só quando há mais de 10 minutos de antecedência (bot agendado). */
export function joinAtFor(start: Date, now = new Date()): string | undefined {
  // Entra 1 minuto antes do horário marcado.
  const join = new Date(start.getTime() - 60_000);
  return join.getTime() - now.getTime() > 10 * 60_000 ? join.toISOString() : undefined;
}

// ── Agenda: quais reuniões gravar ───────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  start_time: string;
  end_time: string;
  meeting_url: string | null;
  is_deleted: boolean;
  raw: Json;
  platform?: string;
  bots?: { bot_id: string; deduplication_key?: string; meeting_url?: string; start_time?: string }[];
}

export interface Attendee { email: string; name: string | null; self: boolean; declined: boolean; organizer: boolean }

/** Participantes do evento, para Google e Outlook. */
export function attendeesOf(ev: CalendarEvent): Attendee[] {
  const raw = ev.raw ?? {};
  const list = Array.isArray(raw.attendees) ? (raw.attendees as Json[]) : [];
  return list.map((a) => {
    // Outlook: { emailAddress: { address, name }, status: { response } }
    const ea = (a.emailAddress ?? {}) as Json;
    const email = String(a.email ?? ea.address ?? "").toLowerCase();
    const name = (a.displayName ?? ea.name ?? null) as string | null;
    const resp = String(a.responseStatus ?? (a.status as Json)?.response ?? "").toLowerCase();
    return {
      email,
      name: name ? String(name) : null,
      self: a.self === true,
      declined: resp === "declined",
      organizer: a.organizer === true,
    };
  }).filter((a) => a.email);
}

export function eventTitle(ev: CalendarEvent): string {
  const raw = ev.raw ?? {};
  return String(raw.summary ?? raw.subject ?? "Reunião").trim() || "Reunião";
}

const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

/**
 * Decide se o bot vai à reunião.
 * - nenhuma: nunca (só envio manual)
 * - todas: toda reunião com link, que o vendedor não recusou
 * - externas: além disso, com pelo menos um participante de outro domínio
 */
export function shouldRecord(ev: CalendarEvent, calendarEmail: string, mode: string, now = new Date()): boolean {
  if (mode === "nenhuma" || ev.is_deleted || !ev.meeting_url || !isMeetingUrl(ev.meeting_url)) return false;
  if (new Date(ev.end_time).getTime() <= now.getTime()) return false;
  const raw = ev.raw ?? {};
  if (String(raw.status ?? "").toLowerCase() === "cancelled" || raw.isCancelled === true) return false;
  const people = attendeesOf(ev);
  const me = calendarEmail.toLowerCase();
  if (people.some((p) => (p.self || p.email === me) && p.declined)) return false;
  if (mode === "todas") return true;
  const myDomain = domainOf(me);
  return people.some((p) => p.email !== me && !p.self && domainOf(p.email) && domainOf(p.email) !== myDomain);
}

/** Primeiro participante de fora: vira o lead da reunião. */
export function externalLead(ev: CalendarEvent, calendarEmail: string): Attendee | null {
  const myDomain = domainOf(calendarEmail);
  return attendeesOf(ev).find((p) => !p.self && p.email !== calendarEmail.toLowerCase() && domainOf(p.email) !== myDomain) ?? null;
}

// ── Webhooks ────────────────────────────────────────────────────────────────

const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

/** Verifica a assinatura de um webhook da Recall (formato Svix / Standard Webhooks). */
export async function verifyWebhook(headers: Headers, payload: string, secret = Deno.env.get("RECALL_WEBHOOK_SECRET") ?? "", nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!secret.startsWith("whsec_")) return false;
  const id = headers.get("webhook-id") ?? headers.get("svix-id");
  const ts = headers.get("webhook-timestamp") ?? headers.get("svix-timestamp");
  const sig = headers.get("webhook-signature") ?? headers.get("svix-signature");
  if (!id || !ts || !sig) return false;
  // Recusa mensagens com mais de 5 minutos (reenvio de mensagem antiga).
  if (!/^\d+$/.test(ts) || Math.abs(nowSec - Number(ts)) > 300) return false;
  const keyBytes = Uint8Array.from(atob(secret.slice("whsec_".length)), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = b64(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${id}.${ts}.${payload}`)));
  return sig.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value || value.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < value.length; i++) diff |= value.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

/** Rótulo e status interno para cada evento de status do bot. */
export const BOT_STATUS: Record<string, string> = {
  "bot.joining_call": "entrando",
  "bot.in_waiting_room": "sala_de_espera",
  "bot.in_call_not_recording": "entrando",
  "bot.recording_permission_allowed": "gravando",
  "bot.in_call_recording": "gravando",
  "bot.recording_permission_denied": "erro",
  "bot.call_ended": "processando",
  "bot.done": "processando",
  "bot.fatal": "erro",
};

/** Motivo legível para os sub-códigos mais comuns de falha. */
export function friendlyBotError(subCode: string | null | undefined): string {
  const c = String(subCode ?? "");
  if (c.includes("waiting_room")) return "O bot ficou na sala de espera e ninguém o admitiu.";
  if (c.includes("denied") || c.includes("removed")) return "O bot foi recusado ou removido da reunião.";
  if (c.includes("meeting_not_found") || c.includes("invalid_meeting")) return "Link de reunião inválido ou reunião encerrada.";
  if (c.includes("not_started") || c.includes("host")) return "A reunião não começou a tempo e o bot desistiu.";
  if (c.includes("permission")) return "O anfitrião não permitiu a gravação.";
  return c ? `O bot não conseguiu gravar (${c}).` : "O bot não conseguiu gravar a reunião.";
}
