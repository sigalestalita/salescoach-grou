/* eslint-disable @typescript-eslint/no-explicit-any */
// Verificação do conector Pipedrive e de um envio completo pela fila, com Pipedrive e banco simulados.
// Rodar a partir de supabase/functions:
//   CRM_TOKEN_KEY=<32+ caracteres> deno run --allow-env --allow-net --allow-read _shared/crm/tests/pipedrive_check.ts
import { fakeDb } from "./fakedb.ts";
import { encryptToken } from "../crypto.ts";
import { connectorFor } from "../connection.ts";
import { pipedriveConnector, pipedriveOAuth } from "../pipedrive.ts";
import { enqueueMeeting, processJob } from "../sync.ts";
import { CrmError } from "../types.ts";
const assert = (c: unknown, m: string) => { if (!c) throw new Error("FALHOU: " + m); console.log("ok -", m); };
Deno.env.set("PIPEDRIVE_CLIENT_ID", "pid"); Deno.env.set("PIPEDRIVE_CLIENT_SECRET", "psec"); Deno.env.set("APP_URL", "https://app.x.com");

const DOMAIN = "https://acme.pipedrive.com";
const calls: { url: string; method: string; body: any; headers: Headers }[] = [];
let mode = "ok";
const fields = [
  { field_name: "Title", field_code: "title", field_type: "varchar", is_custom_field: false, options: null },
  { field_name: "Sales Coach · Nota", field_code: "h_nota", field_type: "double", is_custom_field: true, options: null },
  { field_name: "Sales Coach · Temperatura", field_code: "h_temp", field_type: "enum", is_custom_field: true,
    options: [{ id: 31, label: "Quente" }, { id: 32, label: "Muito quente" }] },
  { field_name: "Próximo passo", field_code: "h_passo", field_type: "varchar", is_custom_field: true, options: null },
  { field_name: "Responsável técnico", field_code: "h_user", field_type: "user", is_custom_field: true, options: null },
];
globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
  const url = String(input), method = init?.method ?? "GET";
  const raw = init?.body?.toString();
  const body = raw && raw.startsWith("{") ? JSON.parse(raw) : raw;
  calls.push({ url, method, body, headers: new Headers(init?.headers) });
  if (url.startsWith("https://oauth.pipedrive.com/oauth/token")) {
    return Response.json(String(body).includes("grant_type=refresh_token")
      ? { access_token: "A2", refresh_token: "R", expires_in: 3599, api_domain: DOMAIN }
      : { access_token: "A", refresh_token: "R", expires_in: 3599, api_domain: DOMAIN });
  }
  if (mode === "429") return new Response("{}", { status: 429, headers: { "x-ratelimit-reset": "2" } });
  if (url.includes("/api/v2/dealFields") && method === "GET") {
    const second = url.includes("cursor=c2");
    return Response.json({ success: true, data: second ? fields.slice(3) : fields.slice(0, 3), additional_data: { next_cursor: second ? null : "c2" } });
  }
  if (url.endsWith("/api/v2/dealFields") && method === "POST") return Response.json({ success: true, data: { field_code: "h_novo", field_name: body.field_name, field_type: body.field_type, options: null } });
  if (url.includes("/api/v2/persons/search")) return Response.json({ success: true, data: { items: [{ item: { id: 7 } }] } });
  if (url.includes("/api/v2/deals?person_id=7")) return Response.json({ success: true, data: [
    { id: 50, title: "Antigo", status: "lost" }, { id: 51, title: "Aliança", status: "open" }, { id: 52, title: "Apagado", status: "deleted" }] });
  if (url.includes("/api/v2/deals/search")) return Response.json({ success: true, data: { items: [{ item: { id: 51, title: "Aliança", status: "open" } }] } });
  if (url.endsWith("/api/v2/deals/51") && method === "GET") return Response.json({ success: true, data: {
    id: 51, title: "Aliança", status: "open", custom_fields: { h_nota: null, h_passo: "Ligar segunda", h_temp: 31 } } });
  return Response.json({ success: true, data: { id: 1 } }, { status: method === "POST" ? 201 : 200 });
}) as typeof fetch;

// OAuth
const authUrl = new URL(pipedriveOAuth.authorizeUrl("st", "https://cb"));
assert(authUrl.origin + authUrl.pathname === "https://oauth.pipedrive.com/oauth/authorize" && authUrl.searchParams.get("state") === "st", "autorização no oauth.pipedrive.com");
const tk = await pipedriveOAuth.exchangeCode("c", "https://cb");
const tokenCall = calls.at(-1)!;
assert(tokenCall.headers.get("Authorization") === `Basic ${btoa("pid:psec")}` && !String(tokenCall.body).includes("client_secret"), "pede o token com Basic auth, sem o segredo no corpo");
assert(tk.refreshToken === "R" && tk.apiDomain === DOMAIN, "guarda o api_domain da empresa");
const rf = await pipedriveOAuth.refresh("R");
assert(rf.accessToken === "A2" && rf.refreshToken === "R", "renovação devolve token novo");

try { pipedriveConnector("A", null); assert(false, "deveria falhar"); } catch (e) { assert(e instanceof CrmError && e.kind === "auth", "sem api_domain pede reconexão"); }
const crm = pipedriveConnector("A", DOMAIN + "/");
const list = await crm.listDealFields();
assert(calls.some((c) => c.url.includes("cursor=c2")), "percorre as páginas de campos");
assert(list.map((f) => f.key).join() === "h_passo,h_nota,h_temp", "lista só campos personalizados de tipo suportado");
assert(list.find((f) => f.key === "h_temp")!.type === "option" && list.find((f) => f.key === "h_nota")!.type === "number", "traduz os tipos do Pipedrive");
assert(calls.at(-1)!.url.startsWith(DOMAIN + "/api/v2/") && calls.at(-1)!.headers.get("Authorization") === "Bearer A", "chama o domínio da empresa com Bearer");

const nf = await crm.createDealField("Sales Coach · Temperatura 2", "option", ["Fria", "Quente"]);
const create = calls.at(-1)!.body;
assert(create.field_type === "enum" && create.options[1].label === "Quente" && nf.key === "h_novo", "cria campo de lista com as opções");
await crm.createDealField("Sales Coach · Link", "hyperlink");
assert(calls.at(-1)!.body.field_type === "varchar", "link vira campo de texto curto");

const deals = await crm.dealsForEmail("ana@x.com");
assert(calls.some((c) => c.url.includes("persons/search") && c.url.includes("exact_match=true") && c.url.includes("fields=email")), "acha a pessoa pelo e-mail exato");
assert(deals[0].id === "51" && deals[0].status === "ongoing" && deals.length === 2, "negócios da pessoa, abertos primeiro, sem os apagados");
assert((await crm.searchDeals("A")).length === 0, "busca com 1 letra não chama a API");
const found = await crm.searchDeals("Ali");
assert(found[0].name === "Aliança" && calls.at(-1)!.url.includes("fields=title"), "busca por título");
const deal = await crm.getDeal("51");
assert(deal.fields.h_passo === "Ligar segunda" && deal.fields.h_nota === null, "lê os campos personalizados do negócio");

await crm.updateDealFields("51", { h_temp: "Muito quente", h_nota: 91, h_passo: "x".repeat(300) });
const patch = calls.at(-1)!;
assert(patch.method === "PATCH" && patch.body.custom_fields.h_temp === 32 && patch.body.custom_fields.h_nota === 91, "lista grava o id da opção");
assert(patch.body.custom_fields.h_passo.length === 255, "texto curto cortado em 255 caracteres");
try { await crm.updateDealFields("51", { h_temp: "Morna" }); assert(false, "deveria falhar"); } catch (e) { assert(e instanceof CrmError && e.kind === "invalid", "opção inexistente é erro claro"); }

await crm.createNote("51", "Nota 91 <b>\nLinha 2");
const note = calls.at(-1)!;
assert(note.url.endsWith("/api/v1/notes") && note.body.deal_id === 51 && note.body.pinned_to_deal_flag === true && note.body.content === "Nota 91 &lt;b&gt;<br>Linha 2", "anotação fixada no negócio, com HTML escapado");
await crm.createTask("51", { name: "Ligar", description: "x", dueDate: "2026-10-17" });
const task = calls.at(-1)!;
assert(task.url.endsWith("/api/v2/activities") && task.body.type === "task" && task.body.due_date === "2026-10-17" && task.body.deal_id === 51, "tarefa como atividade do negócio");

mode = "429";
try { await crm.getDeal("51"); assert(false, "deveria falhar"); } catch (e) { assert(e instanceof CrmError && e.kind === "rate" && e.retryAfterSeconds === 2, "429 vira espera pelo x-ratelimit-reset"); }
mode = "ok";

// Envio completo pela fila, com o Pipedrive conectado e o token vencido
const db: any = fakeDb({
  crm_connections: [{ id: "c1", org_id: "org1", provider: "pipedrive", status: "ativo", account_label: "Pipedrive", settings: {}, connected_at: "2026-10-01" }],
  crm_credentials: [{ connection_id: "c1", org_id: "org1", access_token_enc: await encryptToken("A"), refresh_token_enc: await encryptToken("R"),
    expires_at: new Date(Date.now() - 60e3).toISOString(), api_domain: "https://antigo.pipedrive.com" }],
  crm_field_mappings: [
    { org_id: "org1", provider: "pipedrive", source_key: "nota", target_field: "h_nota", target_type: "number", mode: "se_vazio" },
    { org_id: "org1", provider: "pipedrive", source_key: "proximo_passo", target_field: "h_passo", target_type: "text", mode: "se_vazio" },
    { org_id: "org1", provider: "pipedrive", source_key: "temperatura", target_field: "h_temp", target_type: "option", target_options: ["Quente", "Muito quente"], mode: "sempre" },
  ],
  meetings: [{ id: "m1", org_id: "org1", title: "Diagnóstico", lead_email: "ana@x.com", meeting_date: "2026-10-13", status: "completo" }],
  analysis_results: [{ meeting_id: "m1", created_at: "2026-10-13", overall_score: 91, temperature: "quente",
    sales_coach: { next_steps: ["Enviar proposta"] }, raw_analysis: {} }],
  analysis_templates: [], crm_sync_jobs: [],
});
await connectorFor(db, db.tables.crm_connections[0]);
assert(db.tables.crm_credentials[0].api_domain === DOMAIN, "renovação atualiza o api_domain gravado");
calls.length = 0;
const jobId = await enqueueMeeting(db, "org1", "m1");
const r = await processJob(db, db.tables.crm_sync_jobs.find((j: any) => j.id === jobId));
const sent = calls.find((c) => c.method === "PATCH")!.body.custom_fields;
assert(r.status === "enviado", "envio pela fila com Pipedrive");
assert(sent.h_nota === 91 && !("h_passo" in sent) && sent.h_temp === 31, "respeita \"só se vazio\" e grava a temperatura pelo id");
assert(calls.some((c) => c.url.endsWith("/api/v1/notes")) && calls.some((c) => c.url.endsWith("/api/v2/activities")), "cria anotação e atividade no Pipedrive");
assert(calls.every((c) => c.url.startsWith(DOMAIN) || c.url.startsWith("https://oauth.pipedrive.com")), "todas as chamadas no domínio da empresa");
assert(db.tables.meetings[0].crm_deal_id === "51" && db.tables.meetings[0].crm_provider === "pipedrive", "vincula a reunião ao negócio do Pipedrive");
console.log("TUDO OK");
