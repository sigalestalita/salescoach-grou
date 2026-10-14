// Conector do Pipedrive (API v2; anotações ainda na v1).
//
// Documentação: https://developers.pipedrive.com/docs/api/v1
// - OAuth: o token é pedido com Basic auth (client_id:client_secret). A
//   resposta traz o `api_domain` da empresa (ex.: https://acme.pipedrive.com),
//   que é a base de todas as chamadas. Access token de 60 min; o refresh token
//   vale 60 dias sem uso e a renovação devolve o mesmo.
// - Os escopos ficam no cadastro do app, não na URL de autorização.
// - Campos personalizados têm chave hash (field_code). Lista grava o id da
//   opção, não o rótulo: este conector traduz o rótulo que o núcleo manda.
// - Limite por token (janela de 2 s) e orçamento diário por empresa; o 429
//   informa quando tentar de novo.

import { CrmConnector, CrmDeal, CrmError, CrmField, CrmOAuth, TokenSet } from "./types.ts";

const AUTH_URL = "https://oauth.pipedrive.com/oauth/authorize";
const TOKEN_URL = Deno.env.get("PIPEDRIVE_TOKEN_URL") ?? "https://oauth.pipedrive.com/oauth/token";

function credentials() {
  const clientId = Deno.env.get("PIPEDRIVE_CLIENT_ID");
  const clientSecret = Deno.env.get("PIPEDRIVE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new CrmError("Integração com o Pipedrive não configurada na plataforma.", "invalid");
  }
  return { clientId, clientSecret };
}

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const detail = body.error_description || body.message || body.error || `HTTP ${res.status}`;
    throw new CrmError(`O Pipedrive recusou a autorização: ${detail}`, "auth");
  }
  const seconds = Number(body.expires_in) || 3600;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? params.refresh_token ?? null,
    expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
    apiDomain: body.api_domain ?? null,
  };
}

export const pipedriveOAuth: CrmOAuth = {
  authorizeUrl(state, redirectUri) {
    const { clientId } = credentials();
    return `${AUTH_URL}?${new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state })}`;
  },
  exchangeCode: (code, redirectUri) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  refresh: (refreshToken) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }),
};

type Json = Record<string, unknown>;

/** Tipo do Pipedrive no vocabulário do núcleo. Tipos sem equivalente ficam de fora. */
const TYPE: Record<string, string> = {
  double: "number",
  int: "number",
  date: "date",
  enum: "option",
  set: "multiple_choice",
  text: "text",
  varchar: "text",
  varchar_auto: "text",
};

/** Tipo do núcleo → tipo do Pipedrive na criação do campo. */
const CREATE_TYPE = { number: "double", text: "text", date: "date", option: "enum", hyperlink: "varchar" } as const;

/** O Pipedrive diz "open"; o núcleo trata negócio aberto como "ongoing". */
const STATUS: Record<string, string> = { open: "ongoing", won: "won", lost: "lost", deleted: "deleted" };

/** Valor atual de um campo personalizado, achatado para a regra "só se vazio". */
function plain(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v) && "value" in (v as Json)) return (v as Json).value;
  return v;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const html = (s: string) => escapeHtml(s).replace(/\n/g, "<br>");

export function pipedriveConnector(accessToken: string, apiDomain?: string | null): CrmConnector {
  if (!apiDomain) throw new CrmError("Conexão com o Pipedrive sem o endereço da empresa. Reconecte o CRM.", "auth");
  const base = apiDomain.replace(/\/$/, "");

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
    const json = await res.json().catch(() => ({})) as Json;
    if (res.ok && json.success !== false) return json;

    const detail = String(json.error ?? json.message ?? "");
    if (res.status === 429) {
      const wait = Number(res.headers.get("x-ratelimit-reset")) || Number(res.headers.get("Retry-After")) || 10;
      throw new CrmError("Limite de requisições do Pipedrive atingido.", "rate", wait);
    }
    if (res.status === 401) throw new CrmError("A conexão com o Pipedrive expirou. Reconecte nas Configurações.", "auth");
    if (res.status === 402) throw new CrmError("A assinatura do Pipedrive desta empresa não permite este acesso.", "auth");
    if (res.status === 403) throw new CrmError(`Sem permissão no Pipedrive${detail ? `: ${detail}` : "."}`, "auth");
    if (res.status === 404 || res.status === 410) throw new CrmError(`Não encontrado no Pipedrive${detail ? `: ${detail}` : "."}`, "not_found");
    if (res.status >= 500) throw new CrmError(`O Pipedrive está instável (HTTP ${res.status}).`, "server");
    throw new CrmError(`O Pipedrive recusou o envio${detail ? `: ${detail}` : ` (HTTP ${res.status})`}.`, "invalid");
  }

  // Definições dos campos do negócio, lidas uma vez por conector (uma por envio).
  let fieldsCache: Json[] | null = null;
  async function definitions(): Promise<Json[]> {
    if (fieldsCache) return fieldsCache;
    const all: Json[] = [];
    let cursor: string | null = null;
    do {
      const q = new URLSearchParams({ limit: "500", ...(cursor ? { cursor } : {}) });
      const r = await req("GET", `/api/v2/dealFields?${q}`);
      if (Array.isArray(r.data)) all.push(...(r.data as Json[]));
      cursor = ((r.additional_data as Json)?.next_cursor as string) ?? null;
    } while (cursor);
    fieldsCache = all;
    return all;
  }

  const options = (f: Json) => Array.isArray(f.options) ? (f.options as Json[]).map((o) => String(o.label)) : null;
  const toField = (f: Json): CrmField => {
    const opts = options(f);
    return { key: String(f.field_code), label: String(f.field_name ?? f.field_code), type: TYPE[String(f.field_type)] ?? "text", options: opts?.length ? opts : null };
  };

  const toDeal = (d: Json): CrmDeal => {
    const custom = (d.custom_fields ?? {}) as Json;
    const fields: Json = {};
    for (const [k, v] of Object.entries(custom)) fields[k] = plain(v);
    return { id: String(d.id), name: String(d.title ?? ""), status: STATUS[String(d.status)] ?? String(d.status ?? ""), fields };
  };

  /** Rótulo → id da opção (lista) ou lista de ids (múltipla escolha). */
  function encode(def: Json | undefined, value: string | number): unknown {
    const type = String(def?.field_type ?? "");
    const opts = Array.isArray(def?.options) ? (def!.options as Json[]) : [];
    const idOf = (label: string) => opts.find((o) => String(o.label).toLowerCase() === label.trim().toLowerCase())?.id;
    if (type === "enum") {
      const id = idOf(String(value));
      if (id === undefined) throw new CrmError(`"${value}" não é uma opção do campo ${def?.field_name}.`, "invalid");
      return id;
    }
    if (type === "set") {
      const ids = String(value).split(/[,;]/).map(idOf).filter((id) => id !== undefined);
      if (!ids.length) throw new CrmError(`"${value}" não é uma opção do campo ${def?.field_name}.`, "invalid");
      return ids;
    }
    if (type === "double" || type === "int") return typeof value === "number" ? value : Number(value);
    if (type === "varchar" || type === "varchar_auto") return String(value).slice(0, 255);
    return value;
  }

  return {
    provider: "pipedrive",

    async listDealFields() {
      return (await definitions())
        .filter((f) => f.is_custom_field === true && String(f.field_type) in TYPE)
        .map(toField)
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    },

    async createDealField(label, type, opts) {
      const body: Json = { field_name: label, field_type: CREATE_TYPE[type] };
      if (type === "option") body.options = (opts ?? []).map((o) => ({ label: o }));
      const r = await req("POST", "/api/v2/dealFields", body);
      fieldsCache = null;
      return toField((r.data ?? {}) as Json);
    },

    async dealsForEmail(email) {
      const q = new URLSearchParams({ term: email, fields: "email", exact_match: "true", limit: "5" });
      const r = await req("GET", `/api/v2/persons/search?${q}`);
      const items = Array.isArray((r.data as Json)?.items) ? ((r.data as Json).items as Json[]) : [];
      const deals: CrmDeal[] = [];
      for (const it of items) {
        const id = (it.item as Json)?.id;
        if (id === undefined) continue;
        const d = await req("GET", `/api/v2/deals?${new URLSearchParams({ person_id: String(id), limit: "50" })}`);
        for (const deal of Array.isArray(d.data) ? (d.data as Json[]) : []) {
          if (!deals.some((x) => x.id === String(deal.id))) deals.push(toDeal(deal));
        }
      }
      return deals
        .filter((d) => d.status !== "deleted")
        .sort((a, b) => Number(b.status === "ongoing") - Number(a.status === "ongoing"));
    },

    async searchDeals(term) {
      const t = term.trim();
      if (t.length < 2) return [];
      const r = await req("GET", `/api/v2/deals/search?${new URLSearchParams({ term: t, fields: "title", limit: "10" })}`);
      const items = Array.isArray((r.data as Json)?.items) ? ((r.data as Json).items as Json[]) : [];
      return items.map((i) => toDeal((i.item ?? {}) as Json));
    },

    async getDeal(id) {
      // O negócio já vem com todos os campos personalizados.
      const r = await req("GET", `/api/v2/deals/${encodeURIComponent(id)}`);
      return toDeal((r.data ?? {}) as Json);
    },

    async updateDealFields(id, fields) {
      if (!Object.keys(fields).length) return;
      const defs = await definitions();
      const custom: Json = {};
      for (const [key, value] of Object.entries(fields)) {
        custom[key] = encode(defs.find((f) => f.field_code === key), value);
      }
      await req("PATCH", `/api/v2/deals/${encodeURIComponent(id)}`, { custom_fields: custom });
    },

    async createNote(dealId, text) {
      await req("POST", "/api/v1/notes", { content: html(text), deal_id: Number(dealId), pinned_to_deal_flag: true });
    },

    async createTask(dealId, task) {
      await req("POST", "/api/v2/activities", {
        subject: task.name,
        type: "task",
        due_date: task.dueDate,
        deal_id: Number(dealId),
        note: html(task.description),
      });
    },
  };
}
