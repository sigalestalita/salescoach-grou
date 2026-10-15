// Verificação do conector RD Station com fetch simulado. Rodar a partir de supabase/functions:
//   CRM_TOKEN_KEY=<32+ caracteres> deno run --allow-env _shared/crm/tests/rdstation_check.ts
import { decryptToken, encryptToken, signState, verifyState } from "../crypto.ts";
import { rdConnector, rdOAuth } from "../rdstation.ts";
import { CrmError } from "../types.ts";
const assert = (c: unknown, m: string) => { if (!c) throw new Error("FALHOU: " + m); console.log("ok -", m); };

const sealed = await encryptToken("tok-123");
assert(sealed.startsWith("v1.") && !sealed.includes("tok-123"), "token criptografado não contém o texto");
assert(await decryptToken(sealed) === "tok-123", "descriptografa");
const st = await signState({ orgId: "o1", userId: "u1", provider: "rdstation", returnTo: "https://x", issuedAt: Date.now() });
assert((await verifyState(st))?.orgId === "o1", "state válido");
const [b, s] = st.split(".");
const forjado = btoa(JSON.stringify({ orgId: "OUTRA", userId: "u1", provider: "rdstation", returnTo: "", issuedAt: Date.now() })).replace(/=+$/, "") + "." + s;
assert(await verifyState(forjado) === null, "state adulterado é recusado");
const velho = await signState({ orgId: "o1", userId: "u1", provider: "rdstation", returnTo: "", issuedAt: Date.now() - 20 * 60000 });
assert(await verifyState(velho) === null, "state expirado é recusado");

// RD com fetch simulado
const calls: { url: string; method: string; body?: string }[] = [];
let mode = "ok";
globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
  const url = String(input); calls.push({ url, method: init?.method ?? "GET", body: init?.body as string });
  if (mode === "429") return new Response("{}", { status: 429, headers: { "Retry-After": "30" } });
  if (url.includes("/oauth2/token")) return Response.json({ access_token: "A", refresh_token: "R", expires_in: 7200 });
  if (url.includes("/contacts?")) return Response.json({ data: [{ id: "c1" }] });
  if (url.includes("/deals?")) return Response.json({ data: [{ id: "d2", name: "Perdido", status: "lost" }, { id: "d1", name: "Aliança", status: "ongoing", custom_fields: { nota: null } }] });
  if (url.includes("/custom_fields?")) return Response.json({ data: [{ id: "f1", slug: "temp", name: "Temperatura", type: "option", options: ["Frio", "Quente"] }] });
  if (url.match(/\/deals\/d1$/) && (init?.method ?? "GET") === "GET") return Response.json({ data: { id: "d1", name: "Aliança", owner_id: "u77", custom_fields: { temp: "Frio" } } });
  if (url.match(/\/deals\/d9$/)) return Response.json({ data: { id: "d9", name: "Sem dono" } });
  if (url.includes("/users?")) return Response.json({ data: [{ id: "u1" }] });
  return Response.json({ data: {} }, { status: init?.method === "POST" ? 201 : 200 });
}) as typeof fetch;
Deno.env.set("RDSTATION_CRM_CLIENT_ID", "cid"); Deno.env.set("RDSTATION_CRM_CLIENT_SECRET", "sec");
const tk = await rdOAuth.exchangeCode("code1", "https://cb");
assert(tk.accessToken === "A" && tk.refreshToken === "R" && !!tk.expiresAt, "troca o código por tokens");
assert(calls.at(-1)!.body!.toString().includes("grant_type=authorization_code"), "token: grant authorization_code");
assert(rdOAuth.authorizeUrl("st", "https://cb").startsWith("https://accounts.rdstation.com/oauth/authorize?response_type=code&client_id=cid"), "URL de autorização");
const crm = rdConnector("A");
const deals = await crm.dealsForEmail('ana@x.com');
assert(deals[0].id === "d1", "negócio aberto vem primeiro");
assert(decodeURIComponent(calls.find((c) => c.url.includes("/contacts?"))!.url).includes('filter=email:"ana@x.com"'), "filtro RDQL do e-mail");
const f = await crm.listDealFields();
assert(f[0].key === "temp" && f[0].options![1] === "Quente", "campos pelo slug, com opções");
const d = await crm.getDeal("d1");
assert(d.fields.temp === "Frio", "lê os campos atuais do negócio");
await crm.updateDealFields("d1", { temp: "Quente", nota: 91 });
assert(JSON.parse(calls.at(-1)!.body!).data.custom_fields.nota === 91 && calls.at(-1)!.method === "PUT", "PUT com custom_fields");
await crm.createNote("d1", "Resumo");
assert(calls.at(-1)!.url.endsWith("/deals/d1/notes") && JSON.parse(calls.at(-1)!.body!).data.description === "Resumo", "anotação no negócio");
await crm.createTask("d1", { name: "Ligar", description: "x", dueDate: "2026-10-17" });
const tb = JSON.parse(calls.at(-1)!.body!).data;
assert(tb.deal_id === "d1" && tb.due_date === "2026-10-17T09:00:00-03:00" && tb.type === "task", "tarefa com prazo e negócio");
assert(tb.created_by_id === "u77" && tb.owner_ids[0] === "u77", "tarefa criada em nome do responsável pelo negócio");
await crm.createTask("d9", { name: "Ligar", description: "x", dueDate: "2026-10-17" });
assert(JSON.parse(calls.at(-1)!.body!).data.created_by_id === "u1", "negócio sem responsável: primeiro usuário da conta");
mode = "429";
try { await crm.getDeal("d1"); assert(false, "deveria falhar"); } catch (e) { assert(e instanceof CrmError && e.kind === "rate" && e.retryAfterSeconds === 30, "429 vira espera com Retry-After"); }
console.log("TUDO OK");
