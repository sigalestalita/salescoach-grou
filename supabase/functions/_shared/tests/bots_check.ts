/* eslint-disable @typescript-eslint/no-explicit-any */
// Verificação do bot de reunião (Recall.ai) com a Recall, o Storage e o banco simulados.
// Rodar a partir de supabase/functions:
//   CRM_TOKEN_KEY=<32+ caracteres> deno run --allow-env --allow-net --allow-read _shared/tests/bots_check.ts
import { fakeDb } from "../crm/tests/fakedb.ts";
import { attendeesOf, CalendarEvent, isMeetingUrl, joinAtFor, shouldRecord, verifyWebhook } from "../recall.ts";
import { cancelBot, handleBotEvent, processDoneBot, scheduleManualBot, syncCalendar } from "../bots.ts";
import { RecallError } from "../recall.ts";
const assert = (c: unknown, m: string) => { if (!c) throw new Error("FALHOU: " + m); console.log("ok -", m); };
Deno.env.set("RECALL_API_BASE", "https://us-west-2.recall.ai");
Deno.env.set("RECALL_API_KEY", "rk");
Deno.env.set("SUPABASE_URL", "https://proj.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "srk");

// ── Links e regra de gravação ──
assert(isMeetingUrl("https://meet.google.com/abc-defg-hij") && isMeetingUrl("https://teams.microsoft.com/l/meetup-join/19%3a") &&
  isMeetingUrl("https://empresa.zoom.us/j/123456") && !isMeetingUrl("https://evil.com/meet.google.com/abc-defg-hij"), "aceita só links de Meet, Teams e Zoom");
const now = new Date("2026-10-15T12:00:00Z");
assert(joinAtFor(new Date("2026-10-15T14:00:00Z"), now) === "2026-10-15T13:59:00.000Z" && joinAtFor(new Date("2026-10-15T12:05:00Z"), now) === undefined,
  "agenda com antecedência; reunião próxima vai na hora");

const ev = (over: Partial<CalendarEvent> & { attendees?: any[] }): CalendarEvent => ({
  id: over.id ?? "ev1", start_time: over.start_time ?? "2026-10-16T13:00:00Z", end_time: over.end_time ?? "2026-10-16T14:00:00Z",
  meeting_url: over.meeting_url === undefined ? "https://meet.google.com/abc-defg-hij" : over.meeting_url, is_deleted: over.is_deleted ?? false,
  raw: { summary: "Diagnóstico Clínica X", attendees: over.attendees ?? [{ email: "ana@nexa.com", self: true, responseStatus: "accepted" }, { email: "joao@clinica.com.br", displayName: "João" }] },
});
assert(shouldRecord(ev({}), "ana@nexa.com", "externas", now), "grava reunião com alguém de fora");
assert(!shouldRecord(ev({ attendees: [{ email: "ana@nexa.com", self: true }, { email: "bia@nexa.com" }] }), "ana@nexa.com", "externas", now), "não grava reunião interna no modo externas");
assert(shouldRecord(ev({ attendees: [{ email: "ana@nexa.com", self: true }, { email: "bia@nexa.com" }] }), "ana@nexa.com", "todas", now), "grava reunião interna no modo todas");
assert(!shouldRecord(ev({ attendees: [{ email: "ana@nexa.com", self: true, responseStatus: "declined" }, { email: "j@x.com" }] }), "ana@nexa.com", "todas", now), "não grava reunião recusada");
assert(!shouldRecord(ev({ meeting_url: null }), "ana@nexa.com", "todas", now) && !shouldRecord(ev({}), "ana@nexa.com", "nenhuma", now), "sem link ou modo nenhuma: não grava");
const outlook = attendeesOf({ ...ev({}), raw: { attendees: [{ emailAddress: { address: "Joao@Cliente.com", name: "João" }, status: { response: "declined" } }] } });
assert(outlook[0].email === "joao@cliente.com" && outlook[0].declined, "lê participantes do Outlook");

// ── Assinatura do webhook ──
const secret = "whsec_" + btoa("chave-de-teste-123456");
const sign = async (id: string, ts: string, body: string) => {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode("chave-de-teste-123456"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return "v1," + btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${id}.${ts}.${body}`)))));
};
const ts = String(Math.floor(Date.now() / 1000));
const h = new Headers({ "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": await sign("msg_1", ts, '{"a":1}') });
assert(await verifyWebhook(h, '{"a":1}', secret), "aceita webhook assinado");
assert(!(await verifyWebhook(h, '{"a":2}', secret)), "recusa corpo adulterado");
const old = String(Math.floor(Date.now() / 1000) - 3600);
assert(!(await verifyWebhook(new Headers({ "webhook-id": "msg_1", "webhook-timestamp": old, "webhook-signature": await sign("msg_1", old, "{}") }), "{}", secret)), "recusa mensagem antiga");
assert(!(await verifyWebhook(h, '{"a":1}', "")), "sem segredo configurado, recusa");

// ── Recall e Storage simulados ──
const calls: { url: string; method: string; body: any }[] = [];
let botSeq = 0;
let mode = "ok";
globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
  const url = String(input), method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body ? "<stream>" : undefined;
  calls.push({ url, method, body });
  if (url.includes("recall.ai/api/v1/bot/") && method === "POST" && !url.includes("leave_call")) {
    if (mode === "507") return new Response("{}", { status: 507 });
    return Response.json({ id: `bot-${++botSeq}` }, { status: 201 });
  }
  if (url.includes("recall.ai/api/v1/bot/") && method === "DELETE") return new Response(null, { status: 204 });
  if (url.includes("/api/v1/bot/bot-1/") && method === "GET") return Response.json({ id: "bot-1", recordings: [{
    started_at: "2026-10-15T13:00:00Z", completed_at: "2026-10-15T13:31:30Z",
    media_shortcuts: { audio_mixed: { data: { download_url: "https://s3.example.com/audio.mp3?sig=1" } } } }] });
  if (url.startsWith("https://s3.example.com/")) return new Response("ID3-audio-bytes", { status: 200 });
  if (url.includes("/storage/v1/object/meeting-files/")) return Response.json({ Key: "ok" });
  if (url.includes("/functions/v1/analyze-meeting")) return Response.json({ ok: true });
  if (url.includes("/api/v2/calendar-events/?")) return Response.json({ next: null, results: [
    ev({ id: "ev-ext" }),
    ev({ id: "ev-int", start_time: "2026-10-16T16:00:00Z", end_time: "2026-10-16T17:00:00Z", attendees: [{ email: "ana@nexa.com", self: true }, { email: "bia@nexa.com" }] }),
  ] });
  if (url.includes("/api/v2/calendar-events/ev-ext/bot/") && method === "POST") return Response.json({ ...ev({ id: "ev-ext" }), bots: [{ bot_id: "bot-cal-1", deduplication_key: body.deduplication_key }] });
  if (url.includes("/api/v2/calendar-events/") && method === "DELETE") return new Response(null, { status: 204 });
  return Response.json({});
}) as typeof fetch;

const db: any = fakeDb({
  organization_branding: [{ org_id: "org1", product_name: "Sales Coach" }],
  profiles: [{ user_id: "u1", org_id: "org1", team_id: "t1" }],
  meetings: [], meeting_bots: [], api_usage_logs: [], calendar_connections: [],
});

// Envio manual
const futuro = new Date(Date.now() + 2 * 3600_000).toISOString();
const r = await scheduleManualBot(db, "org1", "u1", { meetingUrl: "https://meet.google.com/abc-defg-hij", startAt: futuro, title: "Diagnóstico", leadCompany: "Clínica X" });
const create = calls.find((c) => c.url.endsWith("/api/v1/bot/") && c.method === "POST")!;
assert(create.body.join_at && create.body.recording_config.audio_mixed_mp3 && create.body.metadata.meeting_id === r.meetingId, "agenda o bot com join_at, só áudio e o id da reunião");
assert(create.body.chat.on_bot_join.message.includes("gravada"), "bot avisa na reunião que está gravando");
assert(db.tables.meetings[0].status === "agendado" && db.tables.meetings[0].team_id === "t1" && db.tables.meeting_bots[0].recall_bot_id === "bot-1", "cria a reunião agendada e liga o bot");
try { await scheduleManualBot(db, "org1", "u1", { meetingUrl: "https://evil.com/x", title: "x" }); assert(false, "deveria falhar"); }
catch (e) { assert(e instanceof RecallError && e.status === 400, "recusa link que não é de reunião"); }
mode = "507";
try { await scheduleManualBot(db, "org1", "u1", { meetingUrl: "https://meet.google.com/abc-defg-hij", title: "agora" }); assert(false, "deveria falhar"); }
catch (e) { assert(e instanceof RecallError && e.status === 507 && db.tables.meetings.length === 1, "sem bot disponível: avisa e não deixa reunião órfã"); }
mode = "ok";

// Status do bot
const ev2 = (event: string, sub: string | null = null) => ({ event, data: { data: { code: event, sub_code: sub }, bot: { id: "bot-1", metadata: {} } } });
await handleBotEvent(db, "bot.in_waiting_room", ev2("bot.in_waiting_room"));
assert(db.tables.meeting_bots[0].status === "sala_de_espera", "acompanha a sala de espera");
await handleBotEvent(db, "bot.in_call_recording", ev2("bot.in_call_recording"));
assert(db.tables.meeting_bots[0].status === "gravando" && db.tables.meetings[0].status === "gravando", "reunião passa a gravando");
const next = await handleBotEvent(db, "bot.done", ev2("bot.done"));
assert(next === "processar", "bot.done dispara o processamento");
calls.length = 0;
await processDoneBot(db, "bot-1");
const m = db.tables.meetings[0];
assert(m.file_url?.startsWith("u1/") && m.file_url.endsWith("-bot.mp3") && m.file_type === "mp3" && m.status === "enviado" && m.duration_seconds === 1890, "guarda o áudio no bucket do vendedor, com a duração");
assert(calls.some((c) => c.url.includes("/storage/v1/object/meeting-files/") && c.body === "<stream>"), "copia o áudio em fluxo, sem carregar na memória");
assert(calls.some((c) => c.url.endsWith("/functions/v1/analyze-meeting") && c.body.meetingId === m.id), "dispara a análise de sempre");
assert(db.tables.api_usage_logs[0]?.operation_type === "bot_gravacao" && db.tables.api_usage_logs[0].quantity === 32, "registra os minutos gravados no consumo");
calls.length = 0;
await processDoneBot(db, "bot-1");
assert(!calls.length, "webhook repetido não processa de novo");

// Falha do bot
await scheduleManualBot(db, "org1", "u1", { meetingUrl: "https://meet.google.com/xyz-abcd-efg", startAt: futuro, title: "Outra" });
await handleBotEvent(db, "bot.fatal", { event: "bot.fatal", data: { data: { sub_code: "timeout_exceeded_waiting_room" }, bot: { id: "bot-2" } } });
const m2 = db.tables.meetings.find((x: any) => x.title === "Outra");
assert(m2.status === "erro" && m2.error_message.includes("sala de espera"), "erro do bot vira mensagem clara na reunião");

// Cancelar
await scheduleManualBot(db, "org1", "u1", { meetingUrl: "https://meet.google.com/qqq-wwww-eee", startAt: futuro, title: "Cancelar" });
const row3 = db.tables.meeting_bots.find((b: any) => b.recall_bot_id === "bot-3");
calls.length = 0;
await cancelBot(db, row3);
assert(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/api/v1/bot/bot-3/")) && row3.status === "cancelado" && !db.tables.meetings.some((x: any) => x.title === "Cancelar"),
  "cancelar apaga o bot agendado e tira a reunião da lista");

// Agenda conectada
const conn = { id: "c1", org_id: "org1", user_id: "u1", provider: "google_calendar", recall_calendar_id: "cal1", email: "ana@nexa.com", status: "conectado", mode: "externas" };
calls.length = 0;
const s = await syncCalendar(db, conn, "2026-10-15T00:00:00Z");
assert(s.agendados === 1, "agenda o bot só para a reunião com gente de fora");
const sched = calls.find((c) => c.url.includes("/calendar-events/ev-ext/bot/"))!;
assert(sched.body.deduplication_key.startsWith("org1|") && sched.body.bot_config.join_at === "2026-10-16T12:59:00.000Z", "um bot por empresa e reunião, entrando 1 minuto antes");
const calMeeting = db.tables.meetings.find((x: any) => x.title === "Diagnóstico Clínica X");
assert(calMeeting?.status === "agendado" && calMeeting.lead_email === "joao@clinica.com.br" && calMeeting.lead_name === "João", "a reunião da agenda já entra com o lead");
await syncCalendar(db, conn, "2026-10-15T00:00:00Z");
assert(db.tables.meetings.filter((x: any) => x.title === "Diagnóstico Clínica X").length === 1, "sincronizar de novo não duplica");
// Mudou para "nenhuma": o bot agendado sai
calls.length = 0;
await syncCalendar(db, { ...conn, mode: "nenhuma" }, "2026-10-15T00:00:00Z");
assert(calls.some((c) => c.method === "DELETE" && c.url.includes("/calendar-events/ev-ext/bot/")) && !db.tables.meetings.some((x: any) => x.title === "Diagnóstico Clínica X"),
  "regra desligada: tira o bot e a reunião agendada");
console.log("TUDO OK");
