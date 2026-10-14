/* eslint-disable @typescript-eslint/no-explicit-any */
// Verificação do conector HubSpot e de um envio completo pela fila, com HubSpot e banco simulados.
// Rodar a partir de supabase/functions:
//   CRM_TOKEN_KEY=<32+ caracteres> deno run --allow-env --allow-net --allow-read _shared/crm/tests/hubspot_check.ts
import { fakeDb } from "./fakedb.ts";
import { encryptToken } from "../crypto.ts";
import { hubspotConnector, hubspotOAuth, propertyName } from "../hubspot.ts";
import { enqueueMeeting, processJob } from "../sync.ts";
import { CrmError } from "../types.ts";
const assert = (c: unknown, m: string) => { if (!c) throw new Error("FALHOU: " + m); console.log("ok -", m); };
Deno.env.set("HUBSPOT_CLIENT_ID", "hid"); Deno.env.set("HUBSPOT_CLIENT_SECRET", "hsec"); Deno.env.set("APP_URL", "https://app.x.com");

const calls: { url: string; method: string; body: any }[] = [];
let mode = "ok";
const props = [
  { name: "dealname", label: "Deal Name", type: "string", fieldType: "text", hubspotDefined: true },
  { name: "hs_next_step", label: "Next step", type: "string", fieldType: "textarea", hubspotDefined: true },
  { name: "hs_is_closed", label: "Is closed", type: "bool", fieldType: "booleancheckbox", hubspotDefined: true, modificationMetadata: { readOnlyValue: true } },
  { name: "sales_coach_temperatura", label: "Sales Coach · Temperatura", type: "enumeration", fieldType: "select", options: [{ label: "Quente", value: "quente" }, { label: "Muito quente", value: "muito_quente" }] },
  { name: "sales_coach_nota", label: "Sales Coach · Nota", type: "number", fieldType: "number" },
  { name: "calc_x", label: "Calculado", type: "number", fieldType: "calculation_equation", calculated: true },
];
globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
  const url = String(input), method = init?.method ?? "GET";
  const raw = init?.body?.toString();
  const body = raw && raw.startsWith("{") ? JSON.parse(raw) : raw;
  calls.push({ url, method, body });
  if (url.includes("/oauth/")) return Response.json(String(body).includes("refresh_token=") ? { access_token: "A2", expires_in: 1800 } : { access_token: "A", refresh_token: "R", expires_in: 1800 });
  if (mode === "429") return new Response("{}", { status: 429 });
  if (url.endsWith("/crm/v3/properties/deals") && method === "GET") return Response.json({ results: props });
  if (url.endsWith("/crm/v3/properties/deals/groups")) return Response.json({ message: "already exists" }, { status: 409 });
  if (url.endsWith("/crm/v3/properties/deals") && method === "POST") return Response.json({ ...body }, { status: 201 });
  if (url.endsWith("/contacts/search")) return Response.json({ results: [{ id: "101" }] });
  if (url.includes("/contacts/101?associations=deals")) return Response.json({ id: "101", associations: { deals: { results: [{ id: "900" }, { id: "901" }] } } });
  if (url.endsWith("/deals/batch/read")) return Response.json({ results: [
    { id: "900", properties: { dealname: "Antigo", hs_is_closed: "true", hs_is_closed_won: "false" } },
    { id: "901", properties: { dealname: "Aliança", hs_is_closed: "false" } }] });
  if (url.endsWith("/deals/search")) return Response.json({ results: [{ id: "901", properties: { dealname: "Aliança" } }] });
  if (url.includes("/crm/v3/objects/deals/901?")) return Response.json({ id: "901", properties: { dealname: "Aliança", hs_next_step: "Ligar segunda", sales_coach_nota: "" } });
  return Response.json({ id: "x" }, { status: method === "POST" ? 201 : 200 });
}) as typeof fetch;

// OAuth
const authUrl = new URL(hubspotOAuth.authorizeUrl("st", "https://cb"));
assert(authUrl.origin + authUrl.pathname === "https://app.hubspot.com/oauth/authorize", "autorização no app.hubspot.com");
assert(authUrl.searchParams.get("scope")!.includes("crm.objects.deals.write") && authUrl.searchParams.get("scope")!.includes("crm.schemas.deals.write"), "pede os escopos de negócio e propriedades");
const tk = await hubspotOAuth.exchangeCode("c", "https://cb");
assert(calls.at(-1)!.url === "https://api.hubapi.com/oauth/2026-03/token" && tk.refreshToken === "R", "troca o código no endpoint 2026-03");
const rf = await hubspotOAuth.refresh("R");
assert(rf.accessToken === "A2" && rf.refreshToken === "R", "renovação mantém o refresh token quando o HubSpot não manda outro");

const crm = hubspotConnector("A");
const fields = await crm.listDealFields();
const keys = fields.map((f) => f.key);
assert(keys.includes("hs_next_step") && !keys.includes("dealname") && !keys.includes("hs_is_closed") && !keys.includes("calc_x"), "lista só campos graváveis (personalizados + próximo passo nativo)");
assert(fields.find((f) => f.key === "sales_coach_temperatura")!.type === "option" && fields.find((f) => f.key === "sales_coach_nota")!.type === "number", "traduz os tipos do HubSpot");

calls.length = 0;
const nf = await crm.createDealField("Sales Coach · Data do próximo passo", "date");
assert(calls[0].url.endsWith("/groups") && calls[1].body.groupName === "sales_coach" && calls[1].body.type === "date", "cria no grupo Sales Coach (grupo já existente não é erro)");
assert(nf.key === propertyName("Sales Coach · Data do próximo passo") && /^sales_coach_[a-z0-9_]+$/.test(nf.key), "nome interno válido para o HubSpot");

const deals = await crm.dealsForEmail("ana@x.com");
assert(deals[0].id === "901" && deals[0].status === "ongoing" && deals[1].status === "lost", "acha os negócios do contato, abertos primeiro");
await crm.searchDeals("Ali");
assert(calls.at(-1)!.body.filterGroups[0].filters[0].operator === "CONTAINS_TOKEN" && calls.at(-1)!.body.filterGroups[0].filters[0].value === "*Ali*", "busca por nome com curinga");
await crm.getDeal("901", ["sales_coach_nota"]);
assert(decodeURIComponent(calls.at(-1)!.url).includes("properties=dealname,hs_is_closed,hs_is_closed_won,sales_coach_nota"), "lê os campos mapeados do negócio");
await crm.updateDealFields("901", { sales_coach_temperatura: "Muito quente", sales_coach_nota: 91 });
const patch = calls.at(-1)!;
assert(patch.method === "PATCH" && patch.body.properties.sales_coach_temperatura === "muito_quente" && patch.body.properties.sales_coach_nota === 91, "lista grava o value da opção, não o rótulo");
await crm.createNote("901", "Nota 91 <b>\nLinha 2");
const note = calls.at(-1)!.body;
assert(note.associations[0].types[0].associationTypeId === 214 && note.properties.hs_note_body === "Nota 91 &lt;b&gt;<br>Linha 2", "nota associada ao negócio, com HTML escapado");
await crm.createTask("901", { name: "Ligar", description: "x", dueDate: "2026-10-17" });
const task = calls.at(-1)!.body;
assert(task.associations[0].types[0].associationTypeId === 216 && task.properties.hs_timestamp === "2026-10-17T12:00:00.000Z", "tarefa associada, vencendo 9h de Brasília");
mode = "429";
try { await crm.getDeal("901"); assert(false, "deveria falhar"); } catch (e) { assert(e instanceof CrmError && e.kind === "rate", "429 vira espera"); }
mode = "ok";

// Envio completo pela fila, com o HubSpot conectado
const db: any = fakeDb({
  crm_connections: [{ id: "c1", org_id: "org1", provider: "hubspot", status: "ativo", account_label: "HubSpot", settings: {}, connected_at: "2026-10-01" }],
  crm_credentials: [{ connection_id: "c1", org_id: "org1", access_token_enc: await encryptToken("A"), refresh_token_enc: await encryptToken("R"), expires_at: new Date(Date.now() + 3600e3).toISOString() }],
  crm_field_mappings: [
    { org_id: "org1", provider: "hubspot", source_key: "nota", target_field: "sales_coach_nota", target_type: "number", mode: "se_vazio" },
    { org_id: "org1", provider: "hubspot", source_key: "proximo_passo", target_field: "hs_next_step", target_type: "text", mode: "se_vazio" },
    { org_id: "org1", provider: "hubspot", source_key: "temperatura", target_field: "sales_coach_temperatura", target_type: "option", target_options: ["Quente", "Muito quente"], mode: "sempre" },
  ],
  meetings: [{ id: "m1", org_id: "org1", title: "Diagnóstico", lead_email: "ana@x.com", meeting_date: "2026-10-13", status: "completo" }],
  analysis_results: [{ meeting_id: "m1", created_at: "2026-10-13", overall_score: 91, temperature: "quente",
    sales_coach: { next_steps: ["Enviar proposta"] }, raw_analysis: {} }],
  analysis_templates: [], crm_sync_jobs: [],
});
calls.length = 0;
const jobId = await enqueueMeeting(db, "org1", "m1");
const r = await processJob(db, db.tables.crm_sync_jobs.find((j: any) => j.id === jobId));
const sent = calls.find((c) => c.method === "PATCH")!.body.properties;
assert(r.status === "enviado", "envio pela fila com HubSpot");
assert(sent.sales_coach_nota === 91 && !("hs_next_step" in sent) && sent.sales_coach_temperatura === "quente", "respeita \"só se vazio\" e traduz a temperatura");
assert(calls.some((c) => c.url.endsWith("/objects/notes")) && calls.some((c) => c.url.endsWith("/objects/tasks")), "cria nota e tarefa no HubSpot");
assert(db.tables.meetings[0].crm_deal_id === "901" && db.tables.meetings[0].crm_provider === "hubspot", "vincula a reunião ao negócio do HubSpot");
console.log("TUDO OK");
