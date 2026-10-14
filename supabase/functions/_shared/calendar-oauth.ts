// OAuth da agenda (Google Calendar e Microsoft Outlook) para a Recall.ai.
//
// O Sales Coach só pede a autorização e repassa o refresh token à Recall, que
// lê a agenda e agenda os bots. O token não fica guardado aqui.
//
// Segredos: GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET e
// MICROSOFT_CALENDAR_CLIENT_ID / MICROSOFT_CALENDAR_CLIENT_SECRET.

import { RecallError } from "./recall.ts";

export const calendarRedirectUri = () =>
  `${(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "")}/functions/v1/calendar-oauth`;

interface Provider {
  key: "google_calendar" | "microsoft_outlook";
  available(): boolean;
  creds(): { clientId: string; clientSecret: string };
  authorize(state: string): string;
  tokenUrl: string;
  tokenParams(code: string): Record<string, string>;
}

const env = (k: string) => Deno.env.get(k) ?? "";

const google: Provider = {
  key: "google_calendar",
  available: () => !!(env("GOOGLE_CALENDAR_CLIENT_ID") && env("GOOGLE_CALENDAR_CLIENT_SECRET")),
  creds: () => ({ clientId: env("GOOGLE_CALENDAR_CLIENT_ID"), clientSecret: env("GOOGLE_CALENDAR_CLIENT_SECRET") }),
  authorize(state) {
    const q = new URLSearchParams({
      client_id: this.creds().clientId,
      redirect_uri: calendarRedirectUri(),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/userinfo.email",
      // offline + consent: o Google só devolve refresh token assim.
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },
  tokenUrl: "https://oauth2.googleapis.com/token",
  tokenParams(code) {
    const c = this.creds();
    return { client_id: c.clientId, client_secret: c.clientSecret, code, grant_type: "authorization_code", redirect_uri: calendarRedirectUri() };
  },
};

const MS_SCOPE = "offline_access openid email https://graph.microsoft.com/Calendars.Read";
const microsoft: Provider = {
  key: "microsoft_outlook",
  available: () => !!(env("MICROSOFT_CALENDAR_CLIENT_ID") && env("MICROSOFT_CALENDAR_CLIENT_SECRET")),
  creds: () => ({ clientId: env("MICROSOFT_CALENDAR_CLIENT_ID"), clientSecret: env("MICROSOFT_CALENDAR_CLIENT_SECRET") }),
  authorize(state) {
    const q = new URLSearchParams({
      client_id: this.creds().clientId,
      redirect_uri: calendarRedirectUri(),
      response_type: "code",
      response_mode: "query",
      scope: MS_SCOPE,
      state,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${q}`;
  },
  tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  tokenParams(code) {
    const c = this.creds();
    return { client_id: c.clientId, client_secret: c.clientSecret, code, grant_type: "authorization_code", redirect_uri: calendarRedirectUri(), scope: MS_SCOPE };
  },
};

export const CALENDAR_PROVIDERS: Provider[] = [google, microsoft];

export function providerOf(key: string): Provider {
  const p = CALENDAR_PROVIDERS.find((x) => x.key === key);
  if (!p) throw new RecallError("Agenda não suportada.", 400);
  if (!p.available()) throw new RecallError("Conexão com essa agenda ainda não configurada na plataforma.", 400);
  return p;
}

export function authorizeUrl(provider: string, state: string): string {
  return providerOf(provider).authorize(state);
}

/** Troca o código pelo refresh token. */
export async function exchangeCode(provider: string, code: string): Promise<string> {
  const p = providerOf(provider);
  const res = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(p.tokenParams(code)),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.refresh_token) {
    const detail = body.error_description || body.error || `HTTP ${res.status}`;
    throw new RecallError(`A agenda recusou a autorização: ${detail}`, 400);
  }
  return String(body.refresh_token);
}
