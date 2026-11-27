// Conector do Compass (CRM da Grou: compass.grougp.com, repositório sdr-grou-9605613b).
//
// O Compass expõe POST /api/public/integracao (src/lib/integracao-sales-coach.server.ts), com o mesmo contrato do
// conector do CRM do Lumi e do NEXA CRM. A conexão é por token: no Compass, Configurações → Integração com o
// Sales Coach → "Gerar token" (só a gestão); cola-se aqui o endereço e o token. Não há OAuth nem renovação;
// revogado, reconecta.
//
// - Negócio = negócio do Compass. Quem não tem negócio aberto aparece como a empresa ("conta:<id>"), o contato
//   ("contato:<id>") ou o lead ("lead:<id>"): toda reunião fica ligada a alguém.
// - A nota vira uma atividade "reunião" na linha do tempo do negócio (ou da empresa, ou do lead); a tarefa vira o
//   próximo passo do negócio (ou do lead), com aviso no sino para o dono. Os campos ficam guardados no negócio
//   (ou na empresa).

import { CrmConnector, CrmDeal, CrmError, CrmField } from "./types.ts";

/**
 * O Compass é o CRM interno da Grou: a opção só aparece para quem entra com e-mail da Grou
 * (ou dos domínios em COMPASS_CRM_DOMINIOS, separados por vírgula).
 */
export function compassDisponivel(email: string | null | undefined): boolean {
  const dominios = (Deno.env.get("COMPASS_CRM_DOMINIOS") ?? "grougp.com.br,grougp.com").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  const dom = String(email ?? "").toLowerCase().split("@")[1] ?? "";
  return !!dom && dominios.includes(dom);
}

/** Só aceita o endereço /api/public/integracao do Compass (o token vai para este endereço). */
export function compassBase(input: string | null | undefined): string | null {
  const hosts = (Deno.env.get("COMPASS_CRM_HOSTS") ?? "compass.grougp.com,sdr-grou.lovable.app").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const s = String(input ?? "").trim().replace(/\/+$/, "");
  try {
    const u = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" || !hosts.includes(u.hostname)) return null;
    const caminho = u.pathname.replace(/\/+$/, "");
    if (caminho !== "" && caminho !== "/api/public/integracao") return null;
    return `https://${u.hostname}/api/public/integracao`;
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
    throw new CrmError("Não foi possível falar com o Compass.", "server");
  }
  const json = await res.json().catch(() => ({})) as Json;
  if (res.ok) return json;
  const msg = typeof json.error === "string" ? json.error : `HTTP ${res.status}`;
  if (res.status === 401) throw new CrmError(`O Compass recusou o token: ${msg}`, "auth");
  if (res.status === 404) throw new CrmError(msg, "not_found");
  if (res.status === 429) throw new CrmError("Limite de requisições do Compass atingido.", "rate", 60);
  if (res.status >= 500) throw new CrmError(`O Compass está instável: ${msg}`, "server");
  throw new CrmError(`O Compass recusou o envio: ${msg}`, "invalid");
}

/** Confere endereço e token na hora de conectar. Devolve o nome da conta. */
export async function compassAccountName(token: string, base: string): Promise<string | null> {
  const r = await call(base, token, "info");
  return typeof r.conta === "string" ? r.conta : null;
}

export function compassConnector(token: string, apiDomain: string | null): CrmConnector {
  const base = compassBase(apiDomain);
  if (!base) throw new CrmError("Conexão com o Compass sem endereço válido. Reconecte o CRM.", "auth");
  const go = (action: string, payload?: Json) => call(base, token, action, payload);
  const list = (r: Json) => (Array.isArray(r.negocios) ? (r.negocios as Json[]) : []).map(toDeal);

  return {
    provider: "compass",

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
