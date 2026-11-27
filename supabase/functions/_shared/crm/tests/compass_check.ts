// Verificação do conector do Compass com um servidor simulado (sem rede).
// deno run --allow-env compass_check.ts
import { compassBase, compassConnector, compassDisponivel } from "../compass.ts";
import { CrmError } from "../types.ts";

const ok = (c: unknown, m: string) => { if (!c) throw new Error("FALHOU: " + m); console.log("ok -", m); };

ok(compassBase("https://compass.grougp.com/api/public/integracao") === "https://compass.grougp.com/api/public/integracao", "aceita o endereço do Compass");
ok(compassBase("compass.grougp.com") === "https://compass.grougp.com/api/public/integracao", "completa o caminho");
ok(compassBase("https://compass.grougp.com/api/integracao") === null, "recusa outro caminho");
ok(compassBase("https://evil.example.com/api/public/integracao") === null, "recusa outro host (o token não sai do Compass)");
ok(compassBase("https://compass.grougp.com.evil.com/api/public/integracao") === null, "recusa host parecido");
ok(compassBase("http://compass.grougp.com/api/public/integracao") === null, "recusa http");
ok(compassBase("https://sdr-grou.lovable.app/api/public/integracao") === null, "recusa o endereço do Lovable (redireciona e perde o token)");
ok(compassDisponivel("ana@grougp.com.br") && !compassDisponivel("x@gmail.com") && !compassDisponivel("bruna@applumi.io"), "só aparece para a equipe da Grou");

const chamadas: { action: string; auth: string | null; corpo: Record<string, unknown> }[] = [];
globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
  const corpo = JSON.parse(String(init?.body ?? "{}"));
  const auth = new Headers(init?.headers).get("Authorization");
  chamadas.push({ action: corpo.action, auth, corpo });
  if (auth !== "Bearer compass_tokendeteste1234567890abc") return new Response(JSON.stringify({ error: "Token inválido ou revogado" }), { status: 401 });
  const r: Record<string, unknown> = {
    por_email: { negocios: [{ id: "conta:11111111-1111-1111-1111-111111111111", name: "Empresa: Acme (sem negócio aberto)", status: "ongoing", fields: {} }] },
    negocio: { negocio: { id: corpo.id, name: "Acme", status: "ongoing", fields: { nota: 7 } } },
    nota: { ok: true }, tarefa: { ok: true }, atualizar: { ok: true },
  };
  return new Response(JSON.stringify(r[corpo.action] ?? {}), { status: 200 });
}) as typeof fetch;

const crm = compassConnector("compass_tokendeteste1234567890abc", "https://compass.grougp.com/api/public/integracao");
const deals = await crm.dealsForEmail("ana@acme.com.br");
ok(deals.length === 1 && deals[0].id.startsWith("conta:") && deals[0].status === "ongoing", "sem negócio aberto, liga à empresa");
const d = await crm.getDeal(deals[0].id, ["nota"]);
ok(d.fields.nota === 7, "lê os campos atuais");
await crm.updateDealFields(d.id, { nota: 8 });
await crm.createNote(d.id, "Resumo da reunião");
await crm.createTask(d.id, { name: "Enviar proposta", description: "Combinado na reunião", dueDate: "2026-12-01" });
ok(chamadas.map((c) => c.action).join(",") === "por_email,negocio,atualizar,nota,tarefa", "chama as ações do contrato na ordem");
ok(chamadas.find((c) => c.action === "tarefa")?.corpo.vencimento === "2026-12-01", "manda o prazo da tarefa");

const ruim = compassConnector("compass_tokenerrado00000000000000", "https://compass.grougp.com/api/public/integracao");
try { await ruim.dealsForEmail("x@y.com"); ok(false, "deveria recusar"); } catch (e) { ok(e instanceof CrmError && e.kind === "auth", "token recusado vira erro de autenticação (pede reconexão)"); }
console.log("compass_check: tudo certo");
