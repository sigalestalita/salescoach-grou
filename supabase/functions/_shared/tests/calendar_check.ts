// Verificação da agenda (Google e Outlook simulados).
// CRM_TOKEN_KEY=uma-chave-de-teste-com-32-caracteres deno run --allow-env --allow-read _shared/tests/calendar_check.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { agendaEvents, describe, lookupMeeting, matchMeetings, meetingKeys, pickEvent, saveAccount } from "../calendar.ts";
import { decryptToken } from "../crm/crypto.ts";
import { fakeDb } from "../crm/tests/fakedb.ts";

let fails = 0;
const ok = (cond: unknown, msg: string) => { console.log(`${cond ? "ok " : "FALHOU"} ${msg}`); if (!cond) fails++; };

Deno.env.set("SUPABASE_URL", "https://proj.supabase.co");
Deno.env.set("GOOGLE_CALENDAR_CLIENT_ID", "gid"); Deno.env.set("GOOGLE_CALENDAR_CLIENT_SECRET", "gsec");
Deno.env.set("MICROSOFT_CALENDAR_CLIENT_ID", "mid"); Deno.env.set("MICROSOFT_CALENDAR_CLIENT_SECRET", "msec");

// ── Chaves de reunião ──
ok(meetingKeys(["https://meet.google.com/abc-defg-hij?authuser=0"])[0] === "meet:abc-defg-hij", "código do Meet");
ok(meetingKeys(["https://teams.microsoft.com/l/meetup-join/19%3ameeting_NjA0ZTU@thread.v2/0?context=x"])[0] === "teams:19:meeting_nja0ztu@thread.v2", "id do Teams no link codificado");
ok(meetingKeys(["Entrar: https://us02web.zoom.us/j/81234567890?pwd=x"])[0] === "zoom:81234567890", "id do Zoom na descrição");

// ── Escolha do evento ──
const at = new Date("2026-10-20T14:05:00Z");
const ev = (id: string, title: string, start: string, end: string, keys: string[]) =>
  ({ id, title, description: null, start, end, keys, attendees: [] });
const events = [
  ev("a", "Diagnóstico · Clínica Sorriso", "2026-10-20T14:00:00Z", "2026-10-20T15:00:00Z", ["meet:abc-defg-hij"]),
  ev("b", "Proposta · Padaria Real", "2026-10-20T14:00:00Z", "2026-10-20T14:30:00Z", ["teams:19:meeting_x@thread.v2"]),
  ev("c", "Almoço", "2026-10-20T12:00:00Z", "2026-10-20T13:00:00Z", []),
];
ok(pickEvent(events, { meetingUrl: "https://meet.google.com/abc-defg-hij", title: null, at })?.id === "a", "Meet: acha pelo código");
ok(pickEvent(events, { meetingUrl: "https://meet.google.com/zzz-zzzz-zzz", title: "Diagnóstico · Clínica Sorriso", at }) === null, "Meet avulso: não chuta pelo horário");
ok(pickEvent(events, { meetingUrl: "https://teams.microsoft.com/v2/", title: "Proposta · Padaria Real | Microsoft Teams", at })?.id === "b", "Teams sem id na página: acha pelo título");
ok(pickEvent([events[1]], { meetingUrl: "https://teams.microsoft.com/v2/", title: null, at })?.id === "b", "Teams: único evento online agora");
ok(pickEvent(events, { meetingUrl: "https://teams.microsoft.com/v2/", title: null, at }) === null, "dois eventos ao mesmo tempo sem pista: nenhum");

// ── Participantes e lead ──
const people = {
  ...ev("a", "Diagnóstico", "2026-10-20T14:00:00Z", "2026-10-20T15:00:00Z", []),
  attendees: [
    { name: "Vendedora", email: "vend@nexa.com.br", self: true, resource: false, declined: false },
    { name: "Gestor", email: "gestor@nexa.com.br", self: false, resource: false, declined: false },
    { name: "Sala 3", email: "sala3@resource.calendar.google.com", self: false, resource: true, declined: false },
    { name: "Beto", email: "beto@clinicasorriso.com.br", self: false, resource: false, declined: true },
    { name: "Ana Souza", email: "ana@clinicasorriso.com.br", self: false, resource: false, declined: false },
  ],
};
const d = describe(people, ["vend@nexa.com.br"]);
ok(d.lead?.email === "ana@clinicasorriso.com.br" && d.lead?.name === "Ana Souza", "lead: primeiro de fora que não recusou");
ok(d.attendees.length === 4 && !d.attendees.some((a) => a.email.includes("resource")), "sala de reunião fica de fora");
ok(d.attendees.find((a) => a.email === "gestor@nexa.com.br")?.externo === false, "colega do mesmo domínio é de dentro");
const gmailSeller = describe({ ...people, attendees: [
  { name: null, email: "vend@gmail.com", self: true, resource: false, declined: false },
  { name: null, email: "cliente@gmail.com", self: false, resource: false, declined: false },
] }, ["vend@gmail.com"]);
ok(gmailSeller.lead?.email === "cliente@gmail.com", "vendedor com Gmail: outro Gmail ainda é lead");

// ── Ponta a ponta com Google simulado ──
const calls: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  calls.push(url);
  const j = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
  if (url.startsWith("https://oauth2.googleapis.com/token")) {
    const p = new URLSearchParams(String(init?.body));
    if (p.get("grant_type") === "refresh_token" && p.get("refresh_token") === "revogado") return j({ error: "invalid_grant" }, 400);
    return j({ access_token: `g-acc-${p.get("grant_type")}`, refresh_token: p.get("grant_type") === "authorization_code" ? "g-ref" : undefined, expires_in: 3600 });
  }
  if (url.startsWith("https://www.googleapis.com/calendar/v3/calendars/primary/events")) {
    return j({ items: [{
      id: "evt1", status: "confirmed", summary: "Diagnóstico · Clínica Sorriso",
      description: "<b>Pauta</b><br>Entender a operação", hangoutLink: "https://meet.google.com/abc-defg-hij",
      htmlLink: "https://www.google.com/calendar/event?eid=evt1",
      start: { dateTime: "2026-10-20T14:00:00-03:00" }, end: { dateTime: "2026-10-20T15:00:00-03:00" },
      attendees: [{ email: "vend@nexa.com.br", self: true, organizer: true }, { email: "Ana@ClinicaSorriso.com.br", displayName: "Ana Souza" }],
    }] });
  }
  if (url.startsWith("https://login.microsoftonline.com/")) return j({ access_token: "m-acc", refresh_token: "m-ref-2", expires_in: 3600 });
  if (url.startsWith("https://graph.microsoft.com/v1.0/me/calendarView")) {
    return j({ value: [{
      id: "m1", subject: "Proposta · Padaria Real", bodyPreview: "Revisar proposta",
      start: { dateTime: "2026-10-20T17:00:00.0000000" }, end: { dateTime: "2026-10-20T17:30:00.0000000" },
      isOnlineMeeting: true, onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_ABC@thread.v2/0" },
      organizer: { emailAddress: { name: "Vendedor", address: "vend@nexa.com.br" } },
      attendees: [{ type: "required", emailAddress: { name: "Rui Lima", address: "rui@padariareal.com" }, status: { response: "accepted" } },
                  { type: "resource", emailAddress: { name: "Sala", address: "sala@nexa.com.br" } }],
    }] });
  }
  return j({}, 404);
}) as typeof fetch;

const db: any = fakeDb({ calendar_accounts: [], calendar_tokens: [], meetings: [] });
await saveAccount(db, { orgId: "org1", userId: "u1", provider: "google", email: "vend@nexa.com.br",
  tokens: { access_token: "g-acc-old", refresh_token: "g-ref", expires_in: -10 } });
const tok = (await db.from("calendar_tokens").select("*").maybeSingle()).data;
ok(tok && tok.refresh_token_enc !== "g-ref" && await decryptToken(tok.refresh_token_enc) === "g-ref", "refresh token guardado criptografado");

const g = await lookupMeeting(db, "u1", "vend@nexa.com.br", { meetingUrl: "https://meet.google.com/abc-defg-hij", at: new Date("2026-10-20T17:10:00Z") });
ok(g?.title === "Diagnóstico · Clínica Sorriso" && g?.lead?.email === "ana@clinicasorriso.com.br", "Google: evento e lead");
ok(g?.description === "Pauta\nEntender a operação", "Google: descrição sem HTML");
ok(calls.some((u) => u.startsWith("https://oauth2.googleapis.com/token")), "token vencido é renovado antes de ler a agenda");
ok(await lookupMeeting(db, "sem-agenda", null, { meetingUrl: "https://meet.google.com/abc-defg-hij" }) === null, "sem agenda conectada: null");

// Outlook
await saveAccount(db, { orgId: "org1", userId: "u2", provider: "microsoft", email: "vend@nexa.com.br",
  tokens: { access_token: "m-old", refresh_token: "m-ref", expires_in: -10 } });
const m = await lookupMeeting(db, "u2", null, { meetingUrl: "https://teams.microsoft.com/v2/", title: "Proposta · Padaria Real | Microsoft Teams", at: new Date("2026-10-20T17:05:00Z") });
ok(m?.eventId === "m1" && m?.lead?.email === "rui@padariareal.com" && m?.lead?.name === "Rui Lima", "Outlook: evento pelo título e lead");
ok(!m?.attendees.some((a) => a.email === "sala@nexa.com.br"), "Outlook: sala fica de fora");
const acc2 = (await db.from("calendar_accounts").select("*").eq("user_id", "u2").maybeSingle()).data;
const tok2 = (await db.from("calendar_tokens").select("*").eq("account_id", acc2.id).maybeSingle()).data;
ok(await decryptToken(tok2.refresh_token_enc) === "m-ref-2", "Outlook: refresh token girado é salvo");

// Refresh revogado: marca erro
await saveAccount(db, { orgId: "org1", userId: "u3", provider: "google", email: "x@nexa.com.br",
  tokens: { access_token: "a", refresh_token: "revogado", expires_in: -10 } });
let threw = false;
try { await lookupMeeting(db, "u3", null, { meetingUrl: "https://meet.google.com/abc-defg-hij" }); } catch (e: any) { threw = e.reconnect === true; }
const acc3 = (await db.from("calendar_accounts").select("*").eq("user_id", "u3").maybeSingle()).data;
ok(threw && acc3.status === "erro", "acesso revogado: pede para reconectar");

// ── Minha agenda ──
const semana = (id: string, start: string, end: string): any => ({ id, title: "Follow-up semanal", description: null, start, end, keys: ["meet:abc-defg-hij"], attendees: [] });
const rec1 = semana("r_1", "2026-10-13T17:00:00Z", "2026-10-13T17:30:00Z");
const rec2 = semana("r_2", "2026-10-20T17:00:00Z", "2026-10-20T17:30:00Z");
const linhas: any[] = [
  { id: "g1", title: "a", status: "completo", overall_score: 80, temperature: "quente", meeting_url: "https://meet.google.com/abc-defg-hij", calendar_event_id: null, created_at: "2026-10-20T17:40:00Z" },
  { id: "g2", title: "b", status: "erro", overall_score: null, temperature: null, meeting_url: "https://meet.google.com/abc-defg-hij", calendar_event_id: null, created_at: "2026-10-20T17:45:00Z" },
  { id: "g3", title: "c", status: "analisando", overall_score: null, temperature: null, meeting_url: "https://meet.google.com/xyz-abcd-efg", calendar_event_id: "r_1", created_at: "2026-10-13T18:00:00Z" },
];
const lig = matchMeetings([rec1, rec2], linhas);
ok(lig.get("r_2")?.id === "g1", "agenda: gravação pelo link e pelo horário, a completa antes da com erro");
ok(lig.get("r_1")?.id === "g3", "agenda: gravação pelo id do evento guardado pela extensão");
ok(!matchMeetings([rec1], [linhas[0]]).has("r_1"), "agenda: reunião recorrente não pega a gravação de outra semana");

await db.from("meetings").insert({ id: "mt1", seller_id: "u1", title: "Diagnóstico", status: "completo", overall_score: 72, temperature: "morno",
  meeting_url: "https://meet.google.com/abc-defg-hij?authuser=0", calendar_event_id: null, created_at: "2026-10-20T17:55:00.000Z" });
await db.from("meetings").insert({ id: "mt2", seller_id: "outro", title: "De outra pessoa", status: "completo", overall_score: 90, temperature: "quente",
  meeting_url: "https://meet.google.com/abc-defg-hij", calendar_event_id: "evt1", created_at: "2026-10-20T17:50:00.000Z" });
const ag = await agendaEvents(db, "u1", "vend@nexa.com.br", new Date("2026-10-18T03:00:00Z"), new Date("2026-10-25T03:00:00Z"));
const e1 = ag?.[0];
ok(e1?.id === "evt1" && e1.externo && e1.lead?.email === "ana@clinicasorriso.com.br", "agenda: evento com cliente e lead");
ok(e1?.joinUrl === "https://meet.google.com/abc-defg-hij" && e1.webLink?.includes("eid=evt1"), "agenda: link para entrar e para abrir no Google");
ok(e1?.meeting?.id === "mt1" && e1.meeting.overall_score === 72, "agenda: gravação do próprio vendedor ligada, nunca a de outra pessoa");
ok(!("description" in (e1 ?? {})), "agenda: descrição do evento não sai");
ok(calls.some((u) => u.includes("maxResults=250")), "agenda: pede a semana inteira ao Google");
ok(await agendaEvents(db, "sem-agenda", null, new Date(), new Date(Date.now() + 86400_000)) === null, "agenda: sem agenda conectada, null");

globalThis.fetch = realFetch;
console.log(fails ? `\n${fails} falha(s)` : "\nTudo certo.");
if (fails) Deno.exit(1);
