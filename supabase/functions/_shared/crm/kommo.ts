// Conector do Kommo (API v4). No Kommo, o negócio se chama "lead".
//
// Documentação: https://developers.kommo.com
// - Cada conta tem seu endereço (https://<subdominio>.kommo.com); toda chamada,
//   inclusive a troca de token, vai para ele. Na volta do OAuth, o Kommo manda
//   o endereço no parâmetro `referer`.
// - OAuth: access token de 24 h; o refresh token vale 3 meses sem uso e muda a
//   cada renovação. Uma integração só instala em várias contas depois de
//   aprovada na moderação do Kommo (integração pública, feita numa conta
//   técnica). Até lá, cada cliente pode criar uma integração privada na conta
//   dele e colar aqui um token de longa duração (de 1 dia a 5 anos, sem refresh).
// - Limite de 7 requisições por segundo; abuso repetido bloqueia o IP (403).
// - Lista grava o enum_id da opção; data grava Unix timestamp.

import { CrmConnector, CrmDeal, CrmError, CrmField, CrmOAuth, TokenSet } from "./types.ts";

const AUTH_URL = "https://www.kommo.com/oauth";

/** Status de sistema do Kommo: 142 = ganho, 143 = perdido. */
const WON = 142, LOST = 143;

/** Tipo de tarefa padrão do Kommo: 1 = "Follow-up". */
const TASK_FOLLOW_UP = 1;

/**
 * Endereço da conta a partir do que a pessoa digitou ou do `referer` do OAuth.
 * Só aceita *.kommo.com: a troca de token manda o client_secret para este endereço.
 */
export function kommoBase(input: string | null | undefined): string | null {
  let host = String(input ?? "").trim().toLowerCase();
  if (!host) return null;
  host = host.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  if (!host.includes(".")) host = `${host}.kommo.com`;
  return /^[a-z0-9][a-z0-9-]{0,62}\.kommo\.com$/.test(host) ? `https://${host}` : null;
}

function credentials() {
  const clientId = Deno.env.get("KOMMO_CLIENT_ID");
  const clientSecret = Deno.env.get("KOMMO_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new CrmError("Conexão do Kommo por autorização ainda não configurada na plataforma. Use o token de longa duração.", "invalid");
  }
  return { clientId, clientSecret };
}

async function tokenRequest(base: string, params: Record<string, string>): Promise<TokenSet> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(`${base}/oauth2/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const detail = body.hint || body.detail || body.title || `HTTP ${res.status}`;
    throw new CrmError(`O Kommo recusou a autorização: ${detail}`, "auth");
  }
  const seconds = Number(body.expires_in) || 86400;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
    apiDomain: base,
  };
}

export const kommoOAuth: CrmOAuth = {
  authorizeUrl(state) {
    const { clientId } = credentials();
    // post_message: a volta acontece na mesma janela que abriu a autorização.
    return `${AUTH_URL}?${new URLSearchParams({ client_id: clientId, state, mode: "post_message" })}`;
  },
  exchangeCode(code, redirectUri, callback) {
    const base = kommoBase(callback?.get("referer"));
    if (!base) throw new CrmError("O Kommo não informou o endereço da conta.", "auth");
    return tokenRequest(base, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
  },
  refresh(refreshToken, ctx) {
    const base = kommoBase(ctx?.apiDomain);
    if (!base) throw new CrmError("Conexão com o Kommo sem o endereço da conta. Reconecte o CRM.", "auth");
    return tokenRequest(base, { grant_type: "refresh_token", refresh_token: refreshToken, redirect_uri: ctx?.redirectUri ?? "" });
  },
};

/** Validade de um token de longa duração (JWT): o campo `exp`, se houver. */
export function tokenExpiry(token: string): string | null {
  try {
    const part = token.split(".")[1];
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof payload.exp === "number" ? new Date(payload.exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

type Json = Record<string, unknown>;

/** Tipo do Kommo no vocabulário do núcleo. Tipos sem equivalente ficam de fora. */
const TYPE: Record<string, string> = {
  text: "text",
  textarea: "text",
  numeric: "number",
  date: "date",
  date_time: "date",
  select: "option",
  radiobutton: "option",
  multiselect: "multiple_choice",
  url: "hyperlink",
};

/** Tipo do núcleo → tipo do Kommo na criação do campo. */
const CREATE_TYPE = { number: "numeric", text: "textarea", date: "date", option: "select", hyperlink: "url" } as const;

const STATUS = (l: Json) => (l.status_id === WON ? "won" : l.status_id === LOST ? "lost" : "ongoing");

/** Valor atual de um campo personalizado, achatado para a regra "só se vazio". */
function currentValues(lead: Json): Json {
  const out: Json = {};
  for (const cf of Array.isArray(lead.custom_fields_values) ? (lead.custom_fields_values as Json[]) : []) {
    const values = Array.isArray(cf.values) ? (cf.values as Json[]).map((v) => v.value).filter((v) => v !== null && v !== "") : [];
    out[String(cf.field_id)] = values.length > 1 ? values : values[0] ?? null;
  }
  return out;
}

/** Meio-dia em Brasília, em Unix timestamp: a data não muda com o fuso da conta. */
const noonUnix = (date: string) => Math.floor(Date.parse(`${date}T12:00:00-03:00`) / 1000);
/** Fim do expediente em Brasília, para o prazo da tarefa. */
const endOfDayUnix = (date: string) => Math.floor(Date.parse(`${date}T18:00:00-03:00`) / 1000);

export function kommoConnector(accessToken: string, apiDomain?: string | null): CrmConnector {
  const base = kommoBase(apiDomain);
  if (!base) throw new CrmError("Conexão com o Kommo sem o endereço da conta. Reconecte o CRM.", "auth");

  async function req(method: string, path: string, body?: unknown): Promise<Json> {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    // 204: busca sem resultado.
    if (res.status === 204) return {};
    const json = await res.json().catch(() => ({})) as Json;
    if (res.ok) return json;

    const detail = String(json.detail ?? json.title ?? "");
    if (res.status === 429) {
      const wait = Number(res.headers.get("Retry-After")) || 5;
      throw new CrmError("Limite de requisições do Kommo atingido.", "rate", wait);
    }
    if (res.status === 401) throw new CrmError("A conexão com o Kommo expirou. Reconecte nas Configurações.", "auth");
    if (res.status === 402) throw new CrmError("A assinatura do Kommo desta conta está suspensa.", "auth");
    if (res.status === 403) throw new CrmError(`O Kommo bloqueou o acesso${detail ? `: ${detail}` : "."}`, "auth");
    if (res.status === 404) throw new CrmError(`Não encontrado no Kommo${detail ? `: ${detail}` : "."}`, "not_found");
    if (res.status >= 500) throw new CrmError(`O Kommo está instável (HTTP ${res.status}).`, "server");
    throw new CrmError(`O Kommo recusou o envio${detail ? `: ${detail}` : ` (HTTP ${res.status})`}.`, "invalid");
  }

  // Definições dos campos do lead, lidas uma vez por conector (uma por envio).
  let fieldsCache: Json[] | null = null;
  async function definitions(): Promise<Json[]> {
    if (fieldsCache) return fieldsCache;
    const all: Json[] = [];
    for (let page = 1; page <= 20; page++) {
      const r = await req("GET", `/api/v4/leads/custom_fields?limit=250&page=${page}`);
      const list = ((r._embedded as Json)?.custom_fields ?? []) as Json[];
      all.push(...list);
      if (!((r._links as Json)?.next) || !list.length) break;
    }
    fieldsCache = all;
    return all;
  }

  const enums = (f: Json) => Array.isArray(f.enums) ? (f.enums as Json[]) : [];
  const toField = (f: Json): CrmField => {
    const opts = enums(f).map((e) => String(e.value));
    return { key: String(f.id), label: String(f.name ?? f.id), type: TYPE[String(f.type)] ?? "text", options: opts.length ? opts : null };
  };
  const toDeal = (l: Json): CrmDeal => ({ id: String(l.id), name: String(l.name ?? ""), status: STATUS(l), fields: currentValues(l) });

  /** Valor no formato do Kommo para o tipo do campo. */
  function encode(def: Json | undefined, value: string | number): Json[] {
    const type = String(def?.type ?? "text");
    const enumId = (label: string) => enums(def ?? {}).find((e) => String(e.value).toLowerCase() === label.trim().toLowerCase())?.id;
    if (type === "select" || type === "radiobutton") {
      const id = enumId(String(value));
      if (id === undefined) throw new CrmError(`"${value}" não é uma opção do campo ${def?.name}.`, "invalid");
      return [{ enum_id: id }];
    }
    if (type === "multiselect") {
      const ids = String(value).split(/[,;]/).map(enumId).filter((id) => id !== undefined);
      if (!ids.length) throw new CrmError(`"${value}" não é uma opção do campo ${def?.name}.`, "invalid");
      return ids.map((id) => ({ enum_id: id }));
    }
    if (type === "date" || type === "date_time") return [{ value: noonUnix(String(value).slice(0, 10)) }];
    // numeric também vai como texto (é o formato da documentação).
    return [{ value: String(value) }];
  }

  return {
    provider: "kommo",

    async listDealFields() {
      return (await definitions())
        .filter((f) => String(f.type) in TYPE && f.is_api_only !== true && f.is_computed !== true)
        .map(toField)
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    },

    async createDealField(label, type, opts) {
      const def: Json = { name: label, type: CREATE_TYPE[type] };
      if (type === "option") def.enums = (opts ?? []).map((o, i) => ({ value: o, sort: (i + 1) * 10 }));
      const r = await req("POST", "/api/v4/leads/custom_fields", [def]);
      fieldsCache = null;
      const created = (((r._embedded as Json)?.custom_fields ?? []) as Json[])[0];
      if (!created) throw new CrmError("O Kommo não devolveu o campo criado.", "server");
      return toField({ ...def, ...created });
    },

    async dealsForEmail(email) {
      const target = email.trim().toLowerCase();
      const r = await req("GET", `/api/v4/contacts?${new URLSearchParams({ query: target, with: "leads", limit: "10" })}`);
      const contacts = ((r._embedded as Json)?.contacts ?? []) as Json[];
      // A busca do Kommo é por texto: confere se o contato tem mesmo este e-mail.
      const hasEmail = (c: Json) => (Array.isArray(c.custom_fields_values) ? (c.custom_fields_values as Json[]) : [])
        .some((cf) => cf.field_code === "EMAIL" && (cf.values as Json[] ?? []).some((v) => String(v.value).trim().toLowerCase() === target));
      const ids = new Set<string>();
      for (const c of contacts.filter(hasEmail)) {
        for (const l of (((c._embedded as Json)?.leads ?? []) as Json[])) ids.add(String(l.id));
      }
      if (!ids.size) return [];
      const q = [...ids].slice(0, 50).map((id) => `filter[id][]=${encodeURIComponent(id)}`).join("&");
      const leads = await req("GET", `/api/v4/leads?${q}&limit=50`);
      return (((leads._embedded as Json)?.leads ?? []) as Json[])
        .map(toDeal)
        .sort((a, b) => Number(b.status === "ongoing") - Number(a.status === "ongoing"));
    },

    async searchDeals(term) {
      const r = await req("GET", `/api/v4/leads?${new URLSearchParams({ query: term.trim(), limit: "10" })}`);
      return (((r._embedded as Json)?.leads ?? []) as Json[]).map(toDeal);
    },

    async getDeal(id) {
      // O lead já vem com todos os campos personalizados.
      return toDeal(await req("GET", `/api/v4/leads/${encodeURIComponent(id)}`));
    },

    async updateDealFields(id, fields) {
      if (!Object.keys(fields).length) return;
      const defs = await definitions();
      const custom_fields_values = Object.entries(fields).map(([key, value]) => ({
        field_id: Number(key),
        values: encode(defs.find((f) => String(f.id) === key), value),
      }));
      await req("PATCH", `/api/v4/leads/${encodeURIComponent(id)}`, { custom_fields_values });
    },

    async createNote(dealId, text) {
      await req("POST", "/api/v4/leads/notes", [{ entity_id: Number(dealId), note_type: "common", params: { text } }]);
    },

    async createTask(dealId, task) {
      await req("POST", "/api/v4/tasks", [{
        task_type_id: TASK_FOLLOW_UP,
        // A tarefa do Kommo só tem texto: nome e descrição vão juntos.
        text: task.description ? `${task.name}\n\n${task.description}` : task.name,
        complete_till: endOfDayUnix(task.dueDate),
        entity_id: Number(dealId),
        entity_type: "leads",
      }]);
    },
  };
}

/** Confere um token colado pelo admin e devolve o nome da conta. */
export async function kommoAccountName(accessToken: string, apiDomain: string): Promise<string | null> {
  const base = kommoBase(apiDomain);
  if (!base) throw new CrmError("Endereço do Kommo inválido. Use o subdomínio da conta (ex.: suaempresa.kommo.com).", "invalid");
  const res = await fetch(`${base}/api/v4/account`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  if (res.status === 401 || res.status === 403) throw new CrmError("O Kommo não aceitou o token. Confira o subdomínio e gere o token de novo.", "auth");
  if (!res.ok) throw new CrmError(`Não foi possível falar com o Kommo (HTTP ${res.status}).`, "server");
  const body = await res.json().catch(() => ({}));
  return body.name ? String(body.name) : null;
}
