/* eslint-disable @typescript-eslint/no-explicit-any */
// Verificação da fila de envio com banco e CRM simulados. Rodar a partir de supabase/functions:
//   CRM_TOKEN_KEY=<32+ caracteres> deno run --allow-env --allow-net --allow-read _shared/crm/tests/sync_check.ts
import { fakeDb } from "./fakedb.ts";
import { encryptToken } from "../crypto.ts";
import { enqueueMeeting, processJob } from "../sync.ts";
const assert = (c: unknown, m: string) => { if (!c) throw new Error("FALHOU: " + m); console.log("ok -", m); };
Deno.env.set("RDSTATION_CRM_CLIENT_ID", "cid"); Deno.env.set("RDSTATION_CRM_CLIENT_SECRET", "sec"); Deno.env.set("APP_URL", "https://app.x.com");

let deals: any[] = [];
let mode = "ok";
const writes: { method: string; url: string; body: any }[] = [];
let refreshes = 0;
globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
  const url = String(input), method = init?.method ?? "GET";
  const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : init?.body?.toString();
  if (url.includes("/oauth2/token")) { refreshes++; return Response.json({ access_token: "NOVO", refresh_token: "R2", expires_in: 7200 }); }
  if (mode === "429" && method !== "GET") return new Response("{}", { status: 429, headers: { "Retry-After": "45" } });
  if (method !== "GET") { writes.push({ method, url, body }); return Response.json({ data: {} }, { status: method === "POST" ? 201 : 200 }); }
  if (url.includes("/contacts?")) return Response.json({ data: [{ id: "c1" }] });
  if (url.includes("/deals?")) return Response.json({ data: deals });
  const m = url.match(/\/deals\/(\w+)$/); if (m) return Response.json({ data: deals.find((d) => d.id === m[1]) });
  return Response.json({ data: [] });
}) as typeof fetch;

async function setup(expiresInMin = 60) {
  const db = fakeDb({
    crm_connections: [{ id: "conn1", org_id: "org1", provider: "rdstation", status: "ativo", account_label: "RD", settings: { criar_anotacao: true, criar_tarefa: true }, connected_at: "2026-10-01" }],
    crm_credentials: [{ connection_id: "conn1", org_id: "org1", access_token_enc: await encryptToken("A"), refresh_token_enc: await encryptToken("R"), expires_at: new Date(Date.now() + expiresInMin * 60000).toISOString() }],
    crm_field_mappings: [
      { org_id: "org1", provider: "rdstation", source_key: "nota", target_field: "nota_sc", target_type: "number", mode: "sempre" },
      { org_id: "org1", provider: "rdstation", source_key: "proximo_passo", target_field: "prox", target_type: "text", mode: "se_vazio" },
    ],
    meetings: [{ id: "m1", org_id: "org1", title: "Diagnóstico", lead_email: "ana@x.com", meeting_date: "2026-10-13", status: "completo", crm_deal_id: null, crm_provider: null }],
    analysis_results: [{ meeting_id: "m1", created_at: "2026-10-13", overall_score: 91, temperature: "quente", bant_score: { budget: { score: 20, reason: "ok" } },
      sales_coach: { next_steps: ["Enviar proposta"], next_step_date: "2026-10-17" }, raw_analysis: { overall_score_reason: "Boa." } }],
    analysis_templates: [], crm_sync_jobs: [],
  });
  return db as any;
}
const job = async (db: any) => { const id = await enqueueMeeting(db, "org1", "m1"); return db.tables.crm_sync_jobs.find((j: any) => j.id === id); };

// 1. Um negócio aberto: envia tudo e vincula
deals = [{ id: "d1", name: "Aliança", status: "ongoing", custom_fields: { prox: "Ligar segunda", nota_sc: 10 } }, { id: "d9", name: "Antigo", status: "lost" }];
let db = await setup(); writes.length = 0;
let r = await processJob(db, await job(db));
assert(r.status === "enviado", "envia quando há um único negócio aberto");
const put = writes.find((w) => w.method === "PUT");
assert(put && put.url.endsWith("/deals/d1") && put.body.data.custom_fields.nota_sc === 91 && !("prox" in put.body.data.custom_fields), "atualiza a nota e não toca no campo já preenchido (só se vazio)");
assert(writes.some((w) => w.url.endsWith("/deals/d1/notes")), "cria a anotação");
assert(writes.some((w) => w.url.endsWith("/tasks") && w.body.data.due_date.startsWith("2026-10-17")), "cria a tarefa com a data combinada");
assert(db.tables.meetings[0].crm_deal_id === "d1", "vincula a reunião ao negócio");
assert(db.tables.crm_sync_jobs[0].status === "enviado", "envio marcado como enviado");

// 2. Retomada: anotação já feita não é refeita
db = await setup(); writes.length = 0;
const j = await job(db); j.sent = { etapas: ["campos", "anotacao"] }; j.status = "erro";
db.tables.meetings[0].crm_deal_id = "d1"; db.tables.meetings[0].crm_provider = "rdstation";
r = await processJob(db, j);
assert(r.status === "enviado" && writes.length === 1 && writes[0].url.endsWith("/tasks"), "nova tentativa só faz o passo que faltou");

// 3. Dois negócios abertos: espera o vendedor escolher
deals = [{ id: "d1", name: "A", status: "ongoing" }, { id: "d2", name: "B", status: "ongoing" }];
db = await setup(); writes.length = 0;
r = await processJob(db, await job(db));
assert(r.status === "aguardando_vinculo" && writes.length === 0, "com dois negócios abertos, não grava nada e pede escolha");
assert(/2 negócios/.test(db.tables.crm_sync_jobs[0].last_error), "explica o motivo");

// 4. Limite do RD: volta para a fila
deals = [{ id: "d1", name: "A", status: "ongoing", custom_fields: {} }];
db = await setup(); mode = "429";
r = await processJob(db, await job(db));
const jj = db.tables.crm_sync_jobs[0];
assert(r.status === "pendente" && jj.attempts === 1 && Date.parse(jj.next_attempt_at) - Date.now() > 40000, "429 volta para a fila depois do Retry-After");
mode = "ok";

// 5. Token vencendo: renova antes de usar
db = await setup(2); refreshes = 0;
r = await processJob(db, await job(db));
assert(refreshes === 1 && r.status === "enviado", "renova o token que vence em menos de 5 minutos");

// 6. Sem e-mail e sem vínculo
db = await setup(); db.tables.meetings[0].lead_email = null; writes.length = 0;
r = await processJob(db, await job(db));
assert(r.status === "aguardando_vinculo" && writes.length === 0, "sem e-mail do lead, pede o negócio");

// 7. Envio automático desligado: não entra na fila
db = await setup(); db.tables.crm_connections[0].settings.envio_automatico = false;
assert(await enqueueMeeting(db, "org1", "m1") === null, "envio automático desligado não enfileira");
assert(await enqueueMeeting(db, "org1", "m1", { manual: true }) !== null, "envio manual enfileira mesmo assim");
console.log("TUDO OK");
