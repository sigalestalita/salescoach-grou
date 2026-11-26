// Verificação do conector do CRM do Lumi com um servidor simulado (sem rede).
// deno run --allow-env lumi_check.ts
import { lumiBase, lumiConnector, lumiDisponivel } from "../lumi.ts";
import { CrmError } from "../types.ts";

const ok = (c: unknown, m: string) => { if (!c) throw new Error("FALHOU: " + m); console.log("ok -", m); };

ok(lumiBase("https://crm.applumi.io/api/integracao") === "https://crm.applumi.io/api/integracao", "aceita o endereço do CRM");
ok(lumiBase("crm.applumi.io") === "https://crm.applumi.io/api/integracao", "completa o caminho");
ok(lumiBase("https://evil.example.com/api/integracao") === null, "recusa outro host (o token não sai do CRM do Lumi)");
ok(lumiBase("http://crm.applumi.io/api/integracao") === null, "recusa http");
ok(lumiDisponivel("bruna@applumi.io") && !lumiDisponivel("x@gmail.com"), "só aparece para a equipe do Lumi");

const chamadas: { action: string; auth: string | null; corpo: Record<string, unknown> }[] = [];
globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
  const corpo = JSON.parse(String(init?.body ?? "{}"));
  const auth = new Headers(init?.headers).get("Authorization");
  chamadas.push({ action: corpo.action, auth, corpo });
  if (auth !== "Bearer lumi_tokendeteste1234567890abc") return new Response(JSON.stringify({ error: "Token inválido ou revogado" }), { status: 401 });
  const r: Record<string, unknown> = {
    por_email: { negocios: [{ id: "conta:11111111-1111-1111-1111-111111111111", name: "Empresa: Acme (sem negócio aberto)", status: "ongoing", fields: {} }] },
    negocio: { negocio: { id: corpo.id, name: "Acme", status: "ongoing", fields: { nota: 7 } } },
    nota: { ok: true }, tarefa: { ok: true }, atualizar: { ok: true },
  };
  return new Response(JSON.stringify(r[corpo.action] ?? {}), { status: 200 });
}) as typeof fetch;

const crm = lumiConnector("lumi_tokendeteste1234567890abc", "https://crm.applumi.io/api/integracao");
const deals = await crm.dealsForEmail("ana@acme.com.br");
ok(deals.length === 1 && deals[0].id.startsWith("conta:") && deals[0].status === "ongoing", "sem negócio aberto, liga à empresa");
const d = await crm.getDeal(deals[0].id, ["nota"]);
ok(d.fields.nota === 7, "lê os campos atuais");
await crm.updateDealFields(d.id, { nota: 8 });
await crm.createNote(d.id, "Resumo da reunião");
await crm.createTask(d.id, { name: "Enviar proposta", description: "Combinado na reunião", dueDate: "2026-12-01" });
ok(chamadas.map((c) => c.action).join(",") === "por_email,negocio,atualizar,nota,tarefa", "chama as ações do contrato na ordem");
ok(chamadas.find((c) => c.action === "tarefa")?.corpo.vencimento === "2026-12-01", "manda o prazo da tarefa");

const ruim = lumiConnector("lumi_tokenerrado00000000000000", "https://crm.applumi.io/api/integracao");
try { await ruim.dealsForEmail("x@y.com"); ok(false, "deveria recusar"); } catch (e) { ok(e instanceof CrmError && e.kind === "auth", "token recusado vira erro de autenticação (pede reconexão)"); }
console.log("lumi_check: tudo certo");
