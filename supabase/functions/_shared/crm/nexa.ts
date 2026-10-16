// Conector do NEXA CRM (CRM comercial da NEXA, em Supabase próprio).
//
// O CRM expõe a função "integracao" (comercial/supabase/functions/integracao no
// repositório do site da NEXA). A conexão é por token: um admin gera o token em
// Ajustes → Integração com o Sales Coach, no CRM, e cola aqui junto com o
// endereço da função. Não há OAuth nem renovação; revogado, reconecta.
//
// - Negócio = oportunidade. Uma conta-alvo sem oportunidade aparece como
//   "conta:<id>"; ao ser lida (getDeal), vira oportunidade no CRM.
// - Campos do Sales Coach ficam na oportunidade em "salesCoach"; a tarefa vira
//   o próximo passo da oportunidade, com data.

import { CrmConnector, CrmDeal, CrmError, CrmField } from "./types.ts";

/**
 * O NEXA CRM é o CRM interno da NEXA: a opção só aparece para quem entra com
 * e-mail da NEXA (ou dos domínios em NEXA_CRM_DOMINIOS, separados por vírgula).
 */
export function nexaDisponivel(email: string | null | undefined): boolean {
  const dominios = (Deno.env.get("NEXA_CRM_DOMINIOS") ?? "nexatech.ia.br").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  const dom = String(email ?? "").toLowerCase().split("@")[1] ?? "";
  return !!dom && dominios.includes(dom);
}

/** Só aceita a função "integracao" de um projeto Supabase, por HTTPS: o token vai para este endereço. */
export function nexaBase(input: string | null | undefined): string | null {
  const s = String(input ?? "").trim().replace(/\/+$/, "");
  try {
    const u = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" || !/^[a-z0-9]{20}\.supabase\.co$/.test(u.hostname)) return null;
    if (u.pathname.replace(/\/+$/, "") !== "/functions/v1/integracao") return null;
    return `https://${u.hostname}/functions/v1/integracao`;
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
    throw new CrmError("Não foi possível falar com o NEXA CRM.", "server");
  }
  const json = await res.json().catch(() => ({})) as Json;
  if (res.ok) return json;
  const msg = typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
  if (res.status === 401) throw new CrmError(`O NEXA CRM recusou o token: ${msg}`, "auth");
  if (res.status === 404) throw new CrmError(msg, "not_found");
  if (res.status === 429) throw new CrmError("Limite de requisições do NEXA CRM atingido.", "rate", 60);
  if (res.status >= 500) throw new CrmError(`O NEXA CRM está instável: ${msg}`, "server");
  throw new CrmError(`O NEXA CRM recusou o envio: ${msg}`, "invalid");
}

/** Confere endereço e token na hora de conectar. Devolve o nome da conta. */
export async function nexaAccountName(token: string, base: string): Promise<string | null> {
  const r = await call(base, token, "info");
  return typeof r.conta === "string" ? r.conta : null;
}

export function nexaConnector(token: string, apiDomain: string | null): CrmConnector {
  const base = nexaBase(apiDomain);
  if (!base) throw new CrmError("Conexão com o NEXA CRM sem endereço válido. Reconecte o CRM.", "auth");
  const go = (action: string, payload?: Json) => call(base, token, action, payload);
  const list = (r: Json) => (Array.isArray(r.negocios) ? (r.negocios as Json[]) : []).map(toDeal);

  return {
    provider: "nexa",

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
