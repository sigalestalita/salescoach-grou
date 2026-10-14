/* eslint-disable @typescript-eslint/no-explicit-any */
// Verificação do conector Kommo e de um envio completo pela fila, com Kommo e banco simulados.
// Rodar a partir de supabase/functions:
//   CRM_TOKEN_KEY=<32+ caracteres> deno run --allow-env --allow-net --allow-read _shared/crm/tests/kommo_check.ts
import { fakeDb } from "./fakedb.ts";
import { encryptToken } from "../crypto.ts";
import { accessToken, connectorFor } from "../connection.ts";
import { kommoAccountName, kommoBase, kommoConnector, kommoOAuth, tokenExpiry } from "../kommo.ts";
import { enqueueMeeting, processJob } from "../sync.ts";
import { CrmError } from "../types.ts";
const assert = (c: unknown, m: string) => { if (!c) throw new Error("FALHOU: " + m); console.log("ok -", m); };
Deno.env.set("KOMMO_CLIENT_ID", "kid"); Deno.env.set("KOMMO_CLIENT_SECRET", "ksec");
Deno.env.set("APP_URL", "https://app.x.com"); Deno.env.set("SUPABASE_URL", "https://proj.supabase.co");

const BASE = "https://acme.kommo.com";
const calls: { url: string; method: string; body: any }[] = [];
let mode = "ok";
const fields = [
  { id: 101, name: "Sales Coach · Nota", type: "numeric", enums: null },
  { id: 102, name: "Sales Coach · Temperatura", type: "select", enums: [{ id: 501, value: "Quente", sort: 10 }, { id: 502, value: "Muito quente", sort: 20 }] },
  { id: 103, name: "Próximo passo", type: "textarea", enums: null },
  { id: 104, name: "Data do próximo passo", type: "date", enums: null },
  { id: 105, name: "Endereço", type: "smart_address", enums: null },
  { id: 106, name: "Integração X", type: "text", is_api_only: true, enums: null },
];
const lead51 = { id: 51, name: "Aliança", status_id: 3001, custom_fields_values: [
  { field_id: 103, values: [{ value: "Ligar segunda" }] }, { field_id: 102, values: [{ value: "Quente", enum_id: 501 }] }] };
globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
  const url = String(input), method = init?.method ?? "GET";
  const raw = init?.body?.toString();
  const body = raw && /^[[{]/.test(raw) ? JSON.parse(raw) : raw;
  calls.push({ url, method, body });
  if (url.endsWith("/oauth2/access_token")) {
    return Response.json(body.grant_type === "refresh_token"
      ? { token_type: "Bearer", expires_in: 86400, access_token: "A2", refresh_token: "R2" }
      : { token_type: "Bearer", expires_in: 86400, access_token: "A", refresh_token: "R" });
  }
  if (mode === "429") return new Response("{}", { status: 429 });
  if (mode === "401") return Response.json({ title: "Unauthorized" }, { status: 401 });
  if (url.endsWith("/api/v4/account")) return Response.json({ id: 9, name: "Acme Vendas", subdomain: "acme" });
  if (url.includes("/api/v4/leads/custom_fields") && method === "GET") {
    const page = Number(new URL(url).searchParams.get("page"));
    return Response.json({ _embedded: { custom_fields: page === 1 ? fields.slice(0, 3) : fields.slice(3) },
      _links: page === 1 ? { next: { href: "x" } } : {} });
  }
  if (url.endsWith("/api/v4/leads/custom_fields") && method === "POST") return Response.json({ _embedded: { custom_fields: [{ id: 777, ...body[0] }] } });
  if (url.includes("/api/v4/contacts?")) return Response.json({ _embedded: { contacts: [
    { id: 7, custom_fields_values: [{ field_code: "EMAIL", values: [{ value: "Ana@x.com" }] }], _embedded: { leads: [{ id: 50 }, { id: 51 }] } },
    { id: 8, custom_fields_values: [{ field_code: "EMAIL", values: [{ value: "ana@x.com.br" }] }], _embedded: { leads: [{ id: 60 }] } },
  ] } });
  if (url.includes("/api/v4/leads?filter")) return Response.json({ _embedded: { leads: [
    { id: 50, name: "Antigo", status_id: 143 }, { id: 51, name: "Aliança", status_id: 3001 }] } });
  if (url.includes("/api/v4/leads?query=")) return new Response(null, { status: 204 });
  if (url.endsWith("/api/v4/leads/51") && method === "GET") return Response.json(lead51);
  return Response.json({ _embedded: { items: [{ id: 1 }] } });
}) as typeof fetch;

// Endereço da conta
assert(kommoBase("acme") === BASE && kommoBase("https://acme.kommo.com/leads") === BASE && kommoBase("ACME.kommo.com") === BASE, "aceita subdomínio, endereço ou link da conta");
assert(kommoBase("evil.com") === null && kommoBase("acme.kommo.com.evil.com") === null && kommoBase("") === null, "recusa endereço fora do kommo.com (o client_secret vai para ele)");

// OAuth
const authUrl = new URL(kommoOAuth.authorizeUrl("st", "https://cb"));
assert(authUrl.origin + authUrl.pathname === "https://www.kommo.com/oauth" && authUrl.searchParams.get("mode") === "post_message", "autorização no www.kommo.com");
const tk = await kommoOAuth.exchangeCode("c", "https://cb", new URLSearchParams({ referer: "acme.kommo.com" }));
assert(calls.at(-1)!.url === `${BASE}/oauth2/access_token` && calls.at(-1)!.body.client_secret === "ksec", "troca o código no endereço da conta");
assert(tk.apiDomain === BASE && tk.refreshToken === "R", "guarda o endereço da conta");
try { await kommoOAuth.exchangeCode("c", "https://cb", new URLSearchParams({ referer: "evil.com" })); assert(false, "deveria falhar"); }
catch (e) { assert(e instanceof CrmError && e.kind === "auth", "referer fora do kommo.com é recusado"); }
const rf = await kommoOAuth.refresh("R", { apiDomain: BASE, redirectUri: "https://cb" });
assert(rf.refreshToken === "R2" && calls.at(-1)!.body.redirect_uri === "https://cb", "renovação troca o refresh token e manda a URL de retorno");

// Token de longa duração
const jwt = `x.${btoa(JSON.stringify({ exp: 1893456000 })).replace(/=+$/, "")}.y`;
assert(tokenExpiry(jwt) === "2030-01-01T00:00:00.000Z" && tokenExpiry("opaco") === null, "lê a validade do token de longa duração");
assert(await kommoAccountName("T", "acme") === "Acme Vendas", "confere o token e pega o nome da conta");

const crm = kommoConnector("A", BASE);
const list = await crm.listDealFields();
assert(calls.some((c) => c.url.includes("page=2")), "percorre as páginas de campos");
assert(list.map((f) => f.key).sort().join() === "101,102,103,104", "lista só campos de tipo suportado e não restritos à API");
assert(list.find((f) => f.key === "102")!.type === "option" && list.find((f) => f.key === "101")!.type === "number", "traduz os tipos do Kommo");

const nf = await crm.createDealField("Sales Coach · Temperatura 2", "option", ["Fria", "Quente"]);
assert(calls.at(-1)!.body[0].type === "select" && calls.at(-1)!.body[0].enums[1].value === "Quente" && nf.key === "777" && nf.options!.length === 2, "cria campo de lista com as opções");

const deals = await crm.dealsForEmail("ana@x.com");
assert(calls.some((c) => c.url.includes("filter[id][]=50") && c.url.includes("filter[id][]=51") && !c.url.includes("=60")), "só usa contatos com o e-mail exato");
assert(deals[0].id === "51" && deals[0].status === "ongoing" && deals[1].status === "lost", "negócios do contato, abertos primeiro");
assert((await crm.searchDeals("Nada")).length === 0, "busca sem resultado (204) devolve lista vazia");
const deal = await crm.getDeal("51");
assert(deal.fields["103"] === "Ligar segunda" && deal.fields["101"] === undefined, "lê os campos do lead");

await crm.updateDealFields("51", { "102": "Muito quente", "101": 91, "104": "2026-10-17" });
const cfv = calls.at(-1)!.body.custom_fields_values;
assert(calls.at(-1)!.method === "PATCH" && cfv.find((f: any) => f.field_id === 102).values[0].enum_id === 502, "lista grava o enum_id");
assert(cfv.find((f: any) => f.field_id === 101).values[0].value === "91", "número vai como texto");
assert(cfv.find((f: any) => f.field_id === 104).values[0].value === Date.parse("2026-10-17T15:00:00Z") / 1000, "data vai em Unix timestamp, meio-dia de Brasília");
try { await crm.updateDealFields("51", { "102": "Morna" }); assert(false, "deveria falhar"); } catch (e) { assert(e instanceof CrmError && e.kind === "invalid", "opção inexistente é erro claro"); }

await crm.createNote("51", "Nota 91\nLinha 2");
assert(calls.at(-1)!.url.endsWith("/api/v4/leads/notes") && calls.at(-1)!.body[0].entity_id === 51 && calls.at(-1)!.body[0].params.text === "Nota 91\nLinha 2", "anotação comum no lead");
await crm.createTask("51", { name: "Ligar", description: "Levar proposta", dueDate: "2026-10-17" });
const task = calls.at(-1)!.body[0];
assert(task.entity_type === "leads" && task.complete_till === Date.parse("2026-10-17T21:00:00Z") / 1000 && task.text.startsWith("Ligar\n\nLevar"), "tarefa no lead, vencendo 18h de Brasília");

mode = "429";
try { await crm.getDeal("51"); assert(false, "deveria falhar"); } catch (e) { assert(e instanceof CrmError && e.kind === "rate", "429 vira espera"); }
mode = "ok";

// Envio completo pela fila, conectado por token de longa duração
const db: any = fakeDb({
  crm_connections: [{ id: "c1", org_id: "org1", provider: "kommo", status: "ativo", account_label: "Kommo · Acme Vendas", settings: {}, connected_at: "2026-10-01" }],
  crm_credentials: [{ connection_id: "c1", org_id: "org1", access_token_enc: await encryptToken("LONGO"), refresh_token_enc: null, expires_at: null, api_domain: BASE }],
  crm_field_mappings: [
    { org_id: "org1", provider: "kommo", source_key: "nota", target_field: "101", target_type: "number", mode: "se_vazio" },
    { org_id: "org1", provider: "kommo", source_key: "proximo_passo", target_field: "103", target_type: "text", mode: "se_vazio" },
    { org_id: "org1", provider: "kommo", source_key: "temperatura", target_field: "102", target_type: "option", target_options: ["Quente", "Muito quente"], mode: "sempre" },
  ],
  meetings: [{ id: "m1", org_id: "org1", title: "Diagnóstico", lead_email: "ana@x.com", meeting_date: "2026-10-13", status: "completo" }],
  analysis_results: [{ meeting_id: "m1", created_at: "2026-10-13", overall_score: 91, temperature: "quente",
    sales_coach: { next_steps: ["Enviar proposta"] }, raw_analysis: {} }],
  analysis_templates: [], crm_sync_jobs: [],
});
assert(await accessToken(db, db.tables.crm_connections[0]) === "LONGO", "token sem validade é usado sem tentar renovar");
calls.length = 0;
const jobId = await enqueueMeeting(db, "org1", "m1");
const r = await processJob(db, db.tables.crm_sync_jobs.find((j: any) => j.id === jobId));
const sent = calls.find((c) => c.method === "PATCH")!.body.custom_fields_values;
assert(r.status === "enviado", "envio pela fila com Kommo");
assert(sent.find((f: any) => f.field_id === 101).values[0].value === "91" && !sent.some((f: any) => f.field_id === 103)
  && sent.find((f: any) => f.field_id === 102).values[0].enum_id === 501, "respeita \"só se vazio\" e grava a temperatura pelo enum_id");
assert(calls.some((c) => c.url.endsWith("/leads/notes")) && calls.some((c) => c.url.endsWith("/api/v4/tasks")), "cria anotação e tarefa no Kommo");
assert(db.tables.meetings[0].crm_deal_id === "51" && db.tables.meetings[0].crm_provider === "kommo", "vincula a reunião ao lead do Kommo");

// Token revogado: sem refresh, a conexão fica marcada para reconectar
mode = "401";
db.tables.crm_sync_jobs.length = 0;
db.tables.meetings[0].crm_deal_id = null;
const job2 = await enqueueMeeting(db, "org1", "m1", { manual: true });
const r2 = await processJob(db, db.tables.crm_sync_jobs.find((j: any) => j.id === job2));
assert(r2.status === "erro" && db.tables.crm_connections[0].status === "erro", "token revogado marca a conexão para reconectar");
mode = "ok";
try { await connectorFor(db, { ...db.tables.crm_connections[0], status: "ativo" }); assert(true, "conector ainda monta com o token salvo"); }
catch { assert(false, "não deveria falhar"); }
console.log("TUDO OK");
