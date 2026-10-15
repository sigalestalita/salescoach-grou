// Conector do RD Station CRM (API v2).
//
// Documentação: https://developers.rdstation.com/reference/crm-v2-introduction
// - OAuth: app no App Publisher da RD; access token de 2 h; refresh token
//   rotativo que expira com 14 dias sem uso (a crm-sync renova antes disso).
// - Corpo e resposta em { "data": ... }; erros em { "errors": [{ "detail" }] }.
// - Limite: 120 requisições por minuto; acima disso, 429 com Retry-After.
// - Campos personalizados gravados pelo slug: custom_fields: { "<slug>": valor }.

import { CrmConnector, CrmDeal, CrmError, CrmField, CrmOAuth, TokenSet } from "./types.ts";

const AUTH_URL = "https://accounts.rdstation.com/oauth/authorize";
const TOKEN_URL = "https://api.rd.services/oauth2/token";
const API = Deno.env.get("RDSTATION_CRM_API") ?? "https://api.rd.services/crm/v2";

function credentials() {
  const clientId = Deno.env.get("RDSTATION_CRM_CLIENT_ID");
  const clientSecret = Deno.env.get("RDSTATION_CRM_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new CrmError("Integração com o RD Station CRM não configurada na plataforma.", "invalid");
  }
  return { clientId, clientSecret };
}

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const detail = body.error_description || body.error || `HTTP ${res.status}`;
    throw new CrmError(`O RD Station recusou a autorização: ${detail}`, "auth");
  }
  const seconds = Number(body.expires_in) || 7200;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
  };
}

export const rdOAuth: CrmOAuth = {
  authorizeUrl(state, redirectUri) {
    const { clientId } = credentials();
    const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, state });
    return `${AUTH_URL}?${q}`;
  },
  exchangeCode: (code, redirectUri) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  refresh: (refreshToken) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }),
};

/** Valor de texto em RDQL: entre aspas, sem aspas internas. */
const rdql = (v: string) => `"${v.replace(/["\\]/g, " ").trim()}"`;

type Json = Record<string, unknown>;

function toDeal(d: Json): CrmDeal {
  return {
    id: String(d.id),
    name: String(d.name ?? ""),
    status: (d.status as string) ?? null,
    fields: (d.custom_fields as Record<string, unknown>) ?? {},
  };
}

function toField(f: Json): CrmField {
  const options = Array.isArray(f.options)
    ? (f.options as unknown[]).map((o) => (typeof o === "string" ? o : String((o as Json)?.label ?? (o as Json)?.name ?? ""))).filter(Boolean)
    : null;
  return { key: String(f.slug ?? f.id), label: String(f.name ?? f.slug), type: String(f.type ?? "text"), options };
}

export function rdConnector(accessToken: string): CrmConnector {
  async function req(method: string, path: string, body?: unknown): Promise<Json> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return {};
    const json = await res.json().catch(() => ({})) as Json;
    if (res.ok) return json;

    const detail = Array.isArray(json.errors)
      ? (json.errors as Json[]).map((e) => e.detail).filter(Boolean).join("; ")
      : "";
    if (res.status === 429) {
      const wait = Number(res.headers.get("Retry-After")) || 60;
      throw new CrmError("Limite de requisições do RD Station atingido.", "rate", wait);
    }
    if (res.status === 401) throw new CrmError("A conexão com o RD Station expirou. Reconecte nas Configurações.", "auth");
    if (res.status === 403) throw new CrmError(`Sem permissão no RD Station${detail ? `: ${detail}` : "."}`, "auth");
    if (res.status === 404) throw new CrmError(`Não encontrado no RD Station${detail ? `: ${detail}` : "."}`, "not_found");
    if (res.status >= 500) throw new CrmError(`O RD Station está instável (HTTP ${res.status}).`, "server");
    throw new CrmError(`O RD Station recusou o envio${detail ? `: ${detail}` : ` (HTTP ${res.status})`}.`, "invalid");
  }

  const list = (r: Json) => (Array.isArray(r.data) ? (r.data as Json[]) : []);

  async function dealsWhere(filter: string, size = 25): Promise<CrmDeal[]> {
    const q = new URLSearchParams({ filter, "page[size]": String(size) });
    return list(await req("GET", `/deals?${q}`)).map(toDeal);
  }

  return {
    provider: "rdstation",

    async listDealFields() {
      const out: CrmField[] = [];
      for (let page = 1; page <= 10; page++) {
        const q = new URLSearchParams({ filter: "entity:deal", "page[number]": String(page), "page[size]": "100" });
        const items = list(await req("GET", `/custom_fields?${q}`));
        out.push(...items.map(toField));
        if (items.length < 100) break;
      }
      return out;
    },

    async createDealField(label, type, options) {
      const data: Json = { name: label, entity: "deal", type };
      if (type === "option") data.options = options ?? [];
      const r = await req("POST", "/custom_fields", { data });
      return toField((r.data ?? {}) as Json);
    },

    async dealsForEmail(email) {
      const q = new URLSearchParams({ filter: `email:${rdql(email)}`, "page[size]": "5" });
      const contacts = list(await req("GET", `/contacts?${q}`));
      if (!contacts.length) return [];
      const ids = contacts.map((c) => String(c.id));
      const deals = await dealsWhere(ids.length === 1 ? `contact_id:${ids[0]}` : `contact_id:(${ids.join(",")})`);
      // Abertos primeiro: é neles que a reunião costuma entrar.
      return deals.sort((a, b) => Number(b.status === "ongoing") - Number(a.status === "ongoing"));
    },

    searchDeals: (term) => dealsWhere(`name:~${rdql(term)}`, 10),

    async getDeal(id) {
      const r = await req("GET", `/deals/${encodeURIComponent(id)}`);
      return toDeal((r.data ?? {}) as Json);
    },

    async updateDealFields(id, fields) {
      if (!Object.keys(fields).length) return;
      await req("PUT", `/deals/${encodeURIComponent(id)}`, { data: { custom_fields: fields } });
    },

    async createNote(dealId, text) {
      await req("POST", `/deals/${encodeURIComponent(dealId)}/notes`, { data: { description: text } });
    },

    async createTask(dealId, task) {
      // O RD Station exige quem criou a tarefa ("Created by is required when
      // creating a task"). A integração não tem usuário próprio no CRM: a
      // tarefa sai em nome do responsável pelo negócio, que também fica como
      // dono dela. Sem responsável no negócio, usa o primeiro usuário da conta.
      const deal = await req("GET", `/deals/${encodeURIComponent(dealId)}`);
      let userId = (deal.data as Json | undefined)?.owner_id as string | number | undefined;
      if (!userId) {
        const users = list(await req("GET", `/users?${new URLSearchParams({ "page[size]": "1" })}`).catch(() => ({})));
        userId = users[0]?.id as string | number | undefined;
      }
      await req("POST", "/tasks", {
        data: {
          name: task.name,
          description: task.description,
          type: "task",
          // Meio da manhã no horário de Brasília, para não virar o dia anterior.
          due_date: `${task.dueDate}T09:00:00-03:00`,
          deal_id: dealId,
          ...(userId ? { created_by_id: String(userId), owner_ids: [String(userId)] } : {}),
        },
      });
    },
  };
}
