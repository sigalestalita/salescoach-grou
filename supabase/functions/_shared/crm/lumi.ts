// Conector do CRM do Lumi (crm.applumi.io, CRM comercial do Lumi).
//
// O CRM expõe POST /api/integracao (repositório lumi-crm, api/integracao.ts), com o mesmo contrato do conector
// do NEXA CRM. A conexão é por token: no CRM, Configurações → Integração com o Sales Coach → "Gerar token";
// cola-se aqui o endereço e o token. Não há OAuth nem renovação; revogado, reconecta.
//
// - Negócio = oportunidade do funil de vendas. Quem não tem negócio aberto aparece como a empresa
//   ("conta:<id>"), o contato ("contato:<id>") ou o lead ("lead:<id>"): toda reunião fica ligada a alguém.
// - A nota vira uma atividade "reunião" na linha do tempo do negócio/empresa/contato; a tarefa vira tarefa
//   do dono, com a data do próximo passo. Os campos ficam guardados no negócio (ou na empresa).

import { CrmConnector, CrmDeal, CrmError, CrmField } from "./types.ts";

/**
 * O CRM do Lumi é o CRM interno do Lumi: a opção só aparece para quem entra com e-mail do Lumi
 * (ou dos domínios em LUMI_CRM_DOMINIOS, separados por vírgula).
 */
export function lumiDisponivel(email: string | null | undefined): boolean {
  const dominios = (Deno.env.get("LUMI_CRM_DOMINIOS") ?? "applumi.io").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  const dom = String(email ?? "").toLowerCase().split("@")[1] ?? "";
  return !!dom && dominios.includes(dom);
}

/** Só aceita o endereço /api/integracao do CRM do Lumi (o token vai para este endereço). */
export function lumiBase(input: string | null | undefined): string | null {
  const hosts = (Deno.env.get("LUMI_CRM_HOSTS") ?? "crm.applumi.io").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const s = String(input ?? "").trim().replace(/\/+$/, "");
  try {
    const u = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" || !hosts.includes(u.hostname)) return null;
    const caminho = u.pathname.replace(/\/+$/, "");
    if (caminho !== "" && caminho !== "/api/integracao") return null;
    return `https://${u.hostname}/api/integracao`;
  } catch {
    return null;
  }
}

type Json = Record<string, unknown>;

const toDeal = (d: Json): CrmDeal => ({
  id: String(d.id),
  name: String(d.name ?? ""),
  status: (d.status as string) ?? null,
  fields: (d.fields as Record<string, unknown>) ?? {},
});

async function call(base: string, token: string, action: string, payload: Json = {}): Promise<Json> {
  let res: Response;
  try {
    res = await fetch(base, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new CrmError("Não foi possível falar com o CRM do Lumi.", "server");
  }
  const json = await res.json().catch(() => ({})) as Json;
  if (res.ok) return json;
  const msg = typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
  if (res.status === 401) throw new CrmError(`O CRM do Lumi recusou o token: ${msg}`, "auth");
  if (res.status === 404) throw new CrmError(msg, "not_found");
  if (res.status === 429) throw new CrmError("Limite de requisições do CRM do Lumi atingido.", "rate", 60);
  if (res.status >= 500) throw new CrmError(`O CRM do Lumi está instável: ${msg}`, "server");
  throw new CrmError(`O CRM do Lumi recusou o envio: ${msg}`, "invalid");
}

/** Confere endereço e token na hora de conectar. Devolve o nome da conta. */
export async function lumiAccountName(token: string, base: string): Promise<string | null> {
  const r = await call(base, token, "info");
  return typeof r.conta === "string" ? r.conta : null;
}

export function lumiConnector(token: string, apiDomain: string | null): CrmConnector {
  const base = lumiBase(apiDomain);
  if (!base) throw new CrmError("Conexão com o CRM do Lumi sem endereço válido. Reconecte o CRM.", "auth");
  const go = (action: string, payload?: Json) => call(base, token, action, payload);
  const list = (r: Json) => (Array.isArray(r.negocios) ? (r.negocios as Json[]) : []).map(toDeal);

  return {
    provider: "lumi",

    async listDealFields() {
      const r = await go("campos");
      return (Array.isArray(r.campos) ? r.campos as Json[] : []).map((f): CrmField => ({
        key: String(f.key),
        label: String(f.label ?? f.key),
        type: String(f.type ?? "text"),
        options: Array.isArray(f.options) ? (f.options as unknown[]).map(String) : null,
      }));
    },

    async createDealField(label, type, options) {
      const r = await go("criar_campo", { label, type, options: options ?? null });
      const f = (r.campo ?? {}) as Json;
      return { key: String(f.key), label: String(f.label ?? label), type: String(f.type ?? type), options: (f.options as string[]) ?? null };
    },

    dealsForEmail: async (email) => list(await go("por_email", { email })),
    searchDeals: async (term) => list(await go("buscar", { termo: term })),

    async getDeal(id, fieldKeys) {
      const r = await go("negocio", { id, campos: fieldKeys ?? [] });
      return toDeal((r.negocio ?? {}) as Json);
    },

    async updateDealFields(id, fields) {
      if (!Object.keys(fields).length) return;
      await go("atualizar", { id, valores: fields });
    },

    async createNote(dealId, text) {
      await go("nota", { id: dealId, texto: text });
    },

    async createTask(dealId, task) {
      await go("tarefa", { id: dealId, nome: task.name, descricao: task.description, vencimento: task.dueDate });
    },
  };
}
