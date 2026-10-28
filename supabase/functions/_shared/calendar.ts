// Agenda do vendedor: Google Agenda e Outlook (Microsoft 365), só leitura.
//
// Uso: achar o evento da reunião em que o vendedor está, para a gravação já
// nascer com o título da agenda, os participantes e o lead (quem é de fora da
// empresa). A conexão é por OAuth; os tokens ficam criptografados em
// calendar_tokens, com a mesma chave dos tokens de CRM (CRM_TOKEN_KEY).
//
// Segredos: GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET e
// MICROSOFT_CALENDAR_CLIENT_ID / MICROSOFT_CALENDAR_CLIENT_SECRET. Sem eles,
// o botão daquela agenda não aparece.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { decryptToken, encryptToken } from "./crm/crypto.ts";

export type CalendarProvider = "google" | "microsoft";

export class CalendarError extends Error {
  constructor(message: string, public status = 400, public reconnect = false) {
    super(message);
  }
}

export interface Attendee {
  name: string | null;
  email: string;
  externo: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  /** Chaves de reunião encontradas no evento (código do Meet, id do Teams, id do Zoom). */
  keys: string[];
  /** Link para entrar na chamada (Meet ou Teams), quando o evento tem. */
  joinUrl?: string | null;
  /** O evento na própria agenda (Google Agenda ou Outlook na web). */
  webLink?: string | null;
  /** O dono da agenda recusou o convite. */
  selfDeclined?: boolean;
  attendees: { name: string | null; email: string; self: boolean; resource: boolean; declined: boolean }[];
}

export interface EventMatch {
  eventId: string;
  title: string;
  description: string | null;
  attendees: Attendee[];
  lead: { name: string | null; email: string } | null;
}

const env = (k: string) => Deno.env.get(k) ?? "";

// Para onde o Google e a Microsoft devolvem a pessoa depois da autorização. Com
// CALENDAR_REDIRECT_URI (ex.: https://salescoach.nexatech.ia.br/agenda/retorno), o
// retorno passa pelo domínio do Sales Coach, que repassa para esta função: a
// verificação do app no Google exige que todos os domínios sejam da empresa, e o
// supabase.co não é. Sem o segredo, volta direto para a função, como antes.
export const calendarRedirectUri = () =>
  env("CALENDAR_REDIRECT_URI").trim() || `${env("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/calendar`;

// ── OAuth ───────────────────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

interface ProviderDef {
  available(): boolean;
  authorizeUrl(state: string): string;
  tokenUrl: string;
  tokenParams(extra: Record<string, string>): Record<string, string>;
  accountEmail(accessToken: string): Promise<string | null>;
  listEvents(accessToken: string, from: Date, to: Date, limit?: number): Promise<CalendarEvent[]>;
}

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/userinfo.email";
const MS_SCOPE = "offline_access openid email User.Read Calendars.Read";

const google: ProviderDef = {
  available: () => !!(env("GOOGLE_CALENDAR_CLIENT_ID") && env("GOOGLE_CALENDAR_CLIENT_SECRET")),
  authorizeUrl(state) {
    const q = new URLSearchParams({
      client_id: env("GOOGLE_CALENDAR_CLIENT_ID"),
      redirect_uri: calendarRedirectUri(),
      response_type: "code",
      scope: GOOGLE_SCOPE,
      // offline + consent: o Google só devolve refresh token assim.
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },
  tokenUrl: "https://oauth2.googleapis.com/token",
  tokenParams: (extra) => ({
    client_id: env("GOOGLE_CALENDAR_CLIENT_ID"),
    client_secret: env("GOOGLE_CALENDAR_CLIENT_SECRET"),
    ...extra,
  }),
  async accountEmail(token) {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return (await res.json()).email ?? null;
  },
  async listEvents(token, from, to, limit = 50) {
    const q = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(limit),
    });
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await assertOk(res, "Google Agenda");
    // deno-lint-ignore no-explicit-any
    const items: any[] = (await res.json()).items ?? [];
    return items
      .filter((e) => e.status !== "cancelled" && e.start?.dateTime)
      .map((e) => ({
        id: String(e.id),
        title: String(e.summary ?? "").trim(),
        description: e.description ? stripHtml(String(e.description)) : null,
        start: e.start.dateTime,
        end: e.end?.dateTime ?? e.start.dateTime,
        keys: meetingKeys([
          e.hangoutLink,
          ...(e.conferenceData?.entryPoints ?? []).map((p: { uri?: string }) => p.uri),
          e.location,
          e.description,
        ]),
        joinUrl: e.hangoutLink ??
          (e.conferenceData?.entryPoints ?? []).find((p: { entryPointType?: string }) => p.entryPointType === "video")?.uri ?? null,
        webLink: e.htmlLink ?? null,
        // deno-lint-ignore no-explicit-any
        selfDeclined: (e.attendees ?? []).some((a: any) => a.self && a.responseStatus === "declined"),
        // deno-lint-ignore no-explicit-any
        attendees: (e.attendees ?? []).filter((a: any) => a.email).map((a: any) => ({
          name: a.displayName ?? null,
          email: String(a.email).toLowerCase(),
          self: !!a.self,
          resource: !!a.resource,
          declined: a.responseStatus === "declined",
        })),
      }));
  },
};

const microsoft: ProviderDef = {
  available: () => !!(env("MICROSOFT_CALENDAR_CLIENT_ID") && env("MICROSOFT_CALENDAR_CLIENT_SECRET")),
  authorizeUrl(state) {
    const q = new URLSearchParams({
      client_id: env("MICROSOFT_CALENDAR_CLIENT_ID"),
      redirect_uri: calendarRedirectUri(),
      response_type: "code",
      response_mode: "query",
      scope: MS_SCOPE,
      prompt: "select_account",
      state,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${q}`;
  },
  tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  tokenParams: (extra) => ({
    client_id: env("MICROSOFT_CALENDAR_CLIENT_ID"),
    client_secret: env("MICROSOFT_CALENDAR_CLIENT_SECRET"),
    scope: MS_SCOPE,
    ...extra,
  }),
  async accountEmail(token) {
    const res = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const me = await res.json();
    return me.mail ?? me.userPrincipalName ?? null;
  },
  async listEvents(token, from, to, limit = 50) {
    const q = new URLSearchParams({
      startDateTime: from.toISOString(),
      endDateTime: to.toISOString(),
      $top: String(limit),
      $orderby: "start/dateTime",
      $select: "id,subject,bodyPreview,body,start,end,attendees,organizer,onlineMeeting,onlineMeetingUrl,location,isCancelled,webLink,responseStatus",
    });
    const res = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${q}`, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' },
    });
    await assertOk(res, "Outlook");
    // deno-lint-ignore no-explicit-any
    const items: any[] = (await res.json()).value ?? [];
    const utc = (d?: string) => (d && !/Z|[+-]\d\d:\d\d$/.test(d) ? `${d}Z` : d ?? "");
    return items
      .filter((e) => !e.isCancelled && e.start?.dateTime)
      .map((e) => ({
        id: String(e.id),
        title: String(e.subject ?? "").trim(),
        description: e.bodyPreview ? String(e.bodyPreview).trim() : null,
        start: utc(e.start.dateTime),
        end: utc(e.end?.dateTime ?? e.start.dateTime),
        keys: meetingKeys([e.onlineMeeting?.joinUrl, e.onlineMeetingUrl, e.location?.displayName, e.body?.content]),
        joinUrl: e.onlineMeeting?.joinUrl ?? e.onlineMeetingUrl ?? null,
        webLink: e.webLink ?? null,
        selfDeclined: e.responseStatus?.response === "declined",
        attendees: [
          // O organizador não vem na lista de participantes do Outlook.
          ...(e.organizer?.emailAddress?.address ? [e.organizer.emailAddress] : []).map((a: { name?: string; address: string }) => ({
            name: a.name ?? null, email: a.address.toLowerCase(), self: false, resource: false, declined: false,
          })),
          // deno-lint-ignore no-explicit-any
          ...(e.attendees ?? []).filter((a: any) => a.emailAddress?.address).map((a: any) => ({
            name: a.emailAddress.name ?? null,
            email: String(a.emailAddress.address).toLowerCase(),
            self: false,
            resource: a.type === "resource",
            declined: a.status?.response === "declined",
          })),
        ],
      }));
  },
};

const PROVIDERS: Record<CalendarProvider, ProviderDef> = { google, microsoft };

export function availableProviders(): CalendarProvider[] {
  return (Object.keys(PROVIDERS) as CalendarProvider[]).filter((p) => PROVIDERS[p].available());
}

function providerOf(p: string): ProviderDef {
  const def = PROVIDERS[p as CalendarProvider];
  if (!def) throw new CalendarError("Agenda não suportada.");
  if (!def.available()) throw new CalendarError("A conexão com essa agenda ainda não foi configurada na plataforma.");
  return def;
}

export function authorizeUrl(provider: string, state: string): string {
  return providerOf(provider).authorizeUrl(state);
}

async function tokenRequest(provider: string, params: Record<string, string>): Promise<TokenResponse> {
  const def = providerOf(provider);
  const res = await fetch(def.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(def.tokenParams(params)),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const detail = body.error_description || body.error || `HTTP ${res.status}`;
    // Refresh token revogado ou expirado: só reconectando.
    const reconnect = body.error === "invalid_grant" || body.error === "interaction_required";
    throw new CalendarError(`A agenda recusou o acesso: ${detail}`, 400, reconnect);
  }
  return body as TokenResponse;
}

/** Troca o código do OAuth por tokens e descobre o e-mail da agenda. */
export async function exchangeCode(provider: string, code: string) {
  const t = await tokenRequest(provider, { code, grant_type: "authorization_code", redirect_uri: calendarRedirectUri() });
  if (!t.refresh_token) throw new CalendarError("A agenda não liberou o acesso contínuo. Tente conectar de novo.");
  const email = await providerOf(provider).accountEmail(t.access_token);
  return { ...t, refresh_token: t.refresh_token, email };
}

/** Grava (ou substitui) a agenda do vendedor. */
export async function saveAccount(
  admin: SupabaseClient,
  a: { orgId: string; userId: string; provider: CalendarProvider; email: string | null; tokens: TokenResponse & { refresh_token: string } },
): Promise<void> {
  const { data: account, error } = await admin.from("calendar_accounts").upsert({
    org_id: a.orgId,
    user_id: a.userId,
    provider: a.provider,
    email: a.email,
    status: "conectado",
    last_error: null,
    connected_at: new Date().toISOString(),
  }, { onConflict: "user_id" }).select("id").single();
  if (error || !account) throw new CalendarError(`Falha ao salvar a agenda: ${error?.message ?? "sem retorno"}`, 500);

  const { error: tokErr } = await admin.from("calendar_tokens").upsert({
    account_id: account.id,
    access_token_enc: await encryptToken(a.tokens.access_token),
    refresh_token_enc: await encryptToken(a.tokens.refresh_token),
    expires_at: expiry(a.tokens.expires_in),
    refreshed_at: new Date().toISOString(),
  }, { onConflict: "account_id" });
  if (tokErr) throw new CalendarError(`Falha ao salvar a agenda: ${tokErr.message}`, 500);
}

interface AccountRow { id: string; provider: CalendarProvider; email: string | null; status: string }

/** Token de acesso válido da agenda do vendedor, renovando quando preciso. */
async function accessToken(admin: SupabaseClient, account: AccountRow): Promise<string> {
  const { data: tok } = await admin.from("calendar_tokens")
    .select("access_token_enc, refresh_token_enc, expires_at").eq("account_id", account.id).maybeSingle();
  if (!tok) throw new CalendarError("Agenda sem credenciais. Conecte de novo.", 400, true);

  const fresh = tok.access_token_enc && tok.expires_at && new Date(tok.expires_at).getTime() - Date.now() > 60_000;
  if (fresh) return decryptToken(tok.access_token_enc);

  try {
    const t = await tokenRequest(account.provider, {
      grant_type: "refresh_token",
      refresh_token: await decryptToken(tok.refresh_token_enc),
    });
    await admin.from("calendar_tokens").update({
      access_token_enc: await encryptToken(t.access_token),
      // A Microsoft gira o refresh token; o Google mantém o mesmo.
      ...(t.refresh_token ? { refresh_token_enc: await encryptToken(t.refresh_token) } : {}),
      expires_at: expiry(t.expires_in),
      refreshed_at: new Date().toISOString(),
    }).eq("account_id", account.id);
    if (account.status !== "conectado") {
      await admin.from("calendar_accounts").update({ status: "conectado", last_error: null }).eq("id", account.id);
    }
    return t.access_token;
  } catch (e) {
    if (e instanceof CalendarError && e.reconnect) {
      await admin.from("calendar_accounts")
        .update({ status: "erro", last_error: "O acesso à agenda expirou. Conecte de novo." }).eq("id", account.id);
    }
    throw e;
  }
}

// ── Achar o evento da reunião ───────────────────────────────────────────────

/**
 * Evento da agenda do vendedor para a reunião aberta agora. Devolve null quando
 * ele não tem agenda conectada ou quando nada bate (link avulso).
 */
export async function lookupMeeting(
  admin: SupabaseClient,
  userId: string,
  userEmail: string | null,
  q: { meetingUrl?: string | null; title?: string | null; at?: Date },
): Promise<EventMatch | null> {
  const { data: account } = await admin.from("calendar_accounts")
    .select("id, provider, email, status").eq("user_id", userId).maybeSingle();
  if (!account) return null;

  const at = q.at ?? new Date();
  const token = await accessToken(admin, account as AccountRow);
  const events = await providerOf(account.provider).listEvents(
    token,
    new Date(at.getTime() - 3 * 3600_000),
    new Date(at.getTime() + 3 * 3600_000),
  );
  const event = pickEvent(events, { meetingUrl: q.meetingUrl ?? null, title: q.title ?? null, at });
  if (!event) return null;
  return describe(event, [account.email, userEmail].filter(Boolean) as string[]);
}

/** Chaves de reunião em qualquer texto: código do Meet, id do Teams, id do Zoom. */
export function meetingKeys(texts: (string | null | undefined)[]): string[] {
  const keys = new Set<string>();
  for (const raw of texts) {
    if (!raw) continue;
    let t = String(raw);
    try { t = decodeURIComponent(t); } catch { /* texto com % solto */ }
    for (const m of t.matchAll(/meet\.google\.com\/(?:meet\/)?([a-z]{3}-[a-z]{4}-[a-z]{3})/gi)) keys.add(`meet:${m[1].toLowerCase()}`);
    for (const m of t.matchAll(/(19:meeting_[A-Za-z0-9_-]+@thread\.v2)/g)) keys.add(`teams:${m[1].toLowerCase()}`);
    for (const m of t.matchAll(/zoom\.us\/(?:j|wc\/join|wc)\/(\d{9,11})/gi)) keys.add(`zoom:${m[1]}`);
  }
  return [...keys];
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Escolhe o evento: pelo link da reunião quando a página tem um identificador
 * (Meet sempre tem); senão, entre os eventos com reunião online acontecendo
 * agora, pelo título ou por ser o único.
 */
export function pickEvent(
  events: CalendarEvent[],
  q: { meetingUrl: string | null; title: string | null; at: Date },
): CalendarEvent | null {
  const [key] = meetingKeys([q.meetingUrl]);
  const now = q.at.getTime();
  const near = (e: CalendarEvent) =>
    new Date(e.start).getTime() - 20 * 60_000 <= now && new Date(e.end).getTime() + 20 * 60_000 >= now;

  if (key) {
    const same = events.filter((e) => e.keys.includes(key));
    if (same.length) return same.find(near) ?? same[0];
    // Link do Meet que não está na agenda: reunião avulsa. Não chuta.
    if (key.startsWith("meet:") || key.startsWith("zoom:")) return null;
  }

  const live = events.filter((e) => near(e) && e.keys.length > 0);
  if (q.title) {
    const t = norm(q.title);
    const byTitle = live.filter((e) => e.title && (norm(e.title) === t || t.includes(norm(e.title)) || norm(e.title).includes(t)));
    if (byTitle.length === 1) return byTitle[0];
  }
  return live.length === 1 ? live[0] : null;
}

/** Domínios de e-mail pessoal: não identificam a empresa de ninguém. */
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.br", "outlook.com", "outlook.com.br", "live.com",
  "msn.com", "yahoo.com", "yahoo.com.br", "icloud.com", "me.com", "bol.com.br", "uol.com.br", "terra.com.br",
  "ig.com.br", "proton.me", "protonmail.com",
]);
const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

/**
 * Participantes e lead. É "de fora" quem não é o vendedor e não tem o domínio
 * de e-mail da empresa dele (quando o vendedor usa e-mail pessoal, só ele conta
 * como de dentro). O lead é o primeiro de fora que não recusou o convite.
 */
export function describe(event: CalendarEvent, sellerEmails: string[]): EventMatch {
  const mine = new Set(sellerEmails.map((e) => e.toLowerCase()));
  const internalDomains = new Set([...mine].map(domainOf).filter((d) => d && !FREE_MAIL.has(d)));
  const seen = new Set<string>();
  const people = event.attendees.filter((a) => !a.resource && !seen.has(a.email) && seen.add(a.email));
  const attendees: Attendee[] = people.slice(0, 30).map((a) => ({
    name: a.name && a.name !== a.email ? a.name : null,
    email: a.email,
    externo: !a.self && !mine.has(a.email) && !internalDomains.has(domainOf(a.email)),
  }));
  const external = attendees.filter((a) => a.externo);
  const declined = new Set(people.filter((a) => a.declined).map((a) => a.email));
  const lead = external.find((a) => !declined.has(a.email)) ?? external[0] ?? null;
  return {
    eventId: event.id,
    title: event.title,
    description: event.description ? event.description.slice(0, 2000) : null,
    attendees,
    lead: lead ? { name: lead.name, email: lead.email } : null,
  };
}

// ── Minha agenda ────────────────────────────────────────────────────────────

/** Gravação do vendedor ligada a um evento da agenda. */
export interface AgendaMeeting {
  id: string;
  title: string;
  status: string;
  overall_score: number | null;
  temperature: string | null;
}

export interface AgendaItem {
  id: string;
  title: string;
  start: string;
  end: string;
  joinUrl: string | null;
  webLink: string | null;
  declined: boolean;
  attendees: Attendee[];
  lead: { name: string | null; email: string } | null;
  /** Tem alguém de fora da empresa: é reunião com cliente. */
  externo: boolean;
  meeting: AgendaMeeting | null;
}

export interface MeetingRow extends AgendaMeeting {
  meeting_url: string | null;
  calendar_event_id: string | null;
  created_at: string;
}

export const AGENDA_MAX_DAYS = 42;

/**
 * Liga cada evento à gravação do vendedor: pelo id do evento que a extensão
 * guardou ao gravar ou, sem ele, pelo link da reunião gravada perto do horário
 * do evento (reuniões recorrentes usam o mesmo link toda semana).
 */
export function matchMeetings(events: CalendarEvent[], meetings: MeetingRow[]): Map<string, MeetingRow> {
  const out = new Map<string, MeetingRow>();
  const keysOf = new Map(meetings.map((m) => [m.id, meetingKeys([m.meeting_url])]));
  const rank = (m: MeetingRow) => (m.status === "completo" ? 2 : m.status === "erro" ? 0 : 1);
  for (const e of events) {
    const start = new Date(e.start).getTime() - 30 * 60_000;
    const end = new Date(e.end).getTime() + 3 * 3600_000;
    const cands = meetings.filter((m) => {
      if (m.calendar_event_id) return m.calendar_event_id === e.id;
      const t = new Date(m.created_at).getTime();
      return t >= start && t <= end && (keysOf.get(m.id) ?? []).some((k) => e.keys.includes(k));
    });
    if (!cands.length) continue;
    cands.sort((a, b) => rank(b) - rank(a) || b.created_at.localeCompare(a.created_at));
    out.set(e.id, cands[0]);
  }
  return out;
}

/**
 * Eventos da agenda principal do vendedor no período, com a gravação de cada
 * um. Lidos na hora, nada é guardado. Null quando ele não conectou a agenda.
 */
export async function agendaEvents(
  admin: SupabaseClient,
  userId: string,
  userEmail: string | null,
  from: Date,
  to: Date,
): Promise<AgendaItem[] | null> {
  const { data: account } = await admin.from("calendar_accounts")
    .select("id, provider, email, status").eq("user_id", userId).maybeSingle();
  if (!account) return null;

  const token = await accessToken(admin, account as AccountRow);
  const [events, { data: meetings }] = await Promise.all([
    providerOf(account.provider).listEvents(token, from, to, 250),
    admin.from("meetings")
      .select("id, title, status, overall_score, temperature, meeting_url, calendar_event_id, created_at")
      .eq("seller_id", userId)
      .gte("created_at", new Date(from.getTime() - 86400_000).toISOString())
      .lte("created_at", new Date(to.getTime() + 86400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const linked = matchMeetings(events, (meetings ?? []) as MeetingRow[]);
  const sellerEmails = [account.email, userEmail].filter(Boolean) as string[];
  return events.map((e) => {
    const d = describe(e, sellerEmails);
    const m = linked.get(e.id);
    return {
      id: e.id,
      title: e.title || "(sem título)",
      start: e.start,
      end: e.end,
      joinUrl: e.joinUrl ?? null,
      webLink: e.webLink ?? null,
      declined: !!e.selfDeclined,
      attendees: d.attendees,
      lead: d.lead,
      externo: d.attendees.some((a) => a.externo),
      meeting: m
        ? { id: m.id, title: m.title, status: m.status, overall_score: m.overall_score, temperature: m.temperature }
        : null,
    };
  });
}

// ── Utilidades ──────────────────────────────────────────────────────────────

function expiry(expiresIn?: number): string | null {
  return expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
}

async function assertOk(res: Response, who: string): Promise<void> {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  if (res.status === 401) throw new CalendarError(`O ${who} recusou o acesso. Conecte a agenda de novo.`, 400, true);
  throw new CalendarError(`O ${who} respondeu ${res.status}: ${text.slice(0, 200)}`, 502);
}

function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}
