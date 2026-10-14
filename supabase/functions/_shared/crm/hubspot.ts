// Conector do HubSpot (CRM API v3).
//
// Documentação: https://developers.hubspot.com/docs
// - OAuth de app público (vários clientes). Token pelo endpoint 2026-03, que
//   substitui o /oauth/v1/token (descontinuado em 16/02/2027). Access token de
//   ~30 min; o refresh token não expira enquanto o app estiver instalado.
// - Antes da revisão do Marketplace, o app aceita até 25 contas instaladas.
// - Limite: 110 requisições a cada 10 s por conta; a busca, 5 por segundo.
// - Propriedades de lista gravam o "value" da opção, não o rótulo: este
//   conector traduz o rótulo que o núcleo manda.

import { CrmConnector, CrmDeal, CrmError, CrmField, CrmOAuth, TokenSet } from "./types.ts";

const AUTH_URL = "https://app.hubspot.com/oauth/authorize";
const TOKEN_URL = "https://api.hubapi.com/oauth/2026-03/token";
const API = Deno.env.get("HUBSPOT_API") ?? "https://api.hubapi.com";

/** Escopos mínimos: negócios, contatos (achar o negócio pelo e-mail) e propriedades. */
export const HUBSPOT_SCOPES = [
  "oauth",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.schemas.deals.read",
  "crm.schemas.deals.write",
];

/** Propriedades nativas do negócio que fazem sentido receber dado do Sales Coach. */
const NATIVE_WRITABLE = ["hs_next_step", "description"];

/** Associação padrão (HUBSPOT_DEFINED): nota → negócio e tarefa → negócio. */
const NOTE_TO_DEAL = 214;
const TASK_TO_DEAL = 216;

function credentials() {
  const clientId = Deno.env.get("HUBSPOT_CLIENT_ID");
  const clientSecret = Deno.env.get("HUBSPOT_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new CrmError("Integração com o HubSpot não configurada na plataforma.", "invalid");
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
    const detail = body.error_description || body.message || body.error || `HTTP ${res.status}`;
    throw new CrmError(`O HubSpot recusou a autorização: ${detail}`, "auth");
  }
  const seconds = Number(body.expires_in) || 1800;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? params.refresh_token ?? null,
    expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
  };
}

export const hubspotOAuth: CrmOAuth = {
  authorizeUrl(state, redirectUri) {
    const { clientId } = credentials();
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: HUBSPOT_SCOPES.join(" "), state });
    return `${AUTH_URL}?${q}`;
  },
  exchangeCode: (code, redirectUri) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  refresh: (refreshToken) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }),
};

type Json = Record<string, unknown>;

/** Tipo do HubSpot no vocabulário do núcleo (o mesmo do RD Station). */
function fieldType(p: Json): string {
  const t = String(p.type ?? ""), ft = String(p.fieldType ?? "");
  if (t === "number") return "number";
  if (t === "date" || t === "datetime") return "date";
  if (t === "enumeration" && ["select", "radio"].includes(ft)) return "option";
  if (t === "enumeration") return "multiple_choice";
  if (t === "bool") return "boolean";
  return "text";
}

const STATUS = (props: Json): string =>
  String(props.hs_is_closed) === "true" ? (String(props.hs_is_closed_won) === "true" ? "won" : "lost") : "ongoing";

const DEAL_PROPS = ["dealname", "hs_is_closed", "hs_is_closed_won"];

/** Nome interno de propriedade: minúsculas, números e "_" (regra do HubSpot). */
export function propertyName(label: string): string {
  const base = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `sales_coach_${base.replace(/^sales_coach_/, "")}`.slice(0, 90);
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function hubspotConnector(accessToken: string): CrmConnector {
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

    const detail = String(json.message ?? "");
    if (res.status === 429) {
      const wait = Number(res.headers.get("Retry-After")) || 10;
      throw new CrmError("Limite de requisições do HubSpot atingido.", "rate", wait);
    }
    if (res.status === 401) throw new CrmError("A conexão com o HubSpot expirou. Reconecte nas Configurações.", "auth");
    if (res.status === 403) throw new CrmError(`Sem permissão no HubSpot${detail ? `: ${detail}` : "."}`, "auth");
    if (res.status === 404) throw new CrmError(`Não encontrado no HubSpot${detail ? `: ${detail}` : "."}`, "not_found");
    if (res.status === 409) throw new CrmError(detail || "Já existe no HubSpot.", "invalid");
    if (res.status >= 500) throw new CrmError(`O HubSpot está instável (HTTP ${res.status}).`, "server");
    throw new CrmError(`O HubSpot recusou o envio${detail ? `: ${detail}` : ` (HTTP ${res.status})`}.`, "invalid");
  }

  // Definições das propriedades, lidas uma vez por conector (uma por envio).
  let propsCache: Json[] | null = null;
  async function properties(): Promise<Json[]> {
    if (!propsCache) {
      const r = await req("GET", "/crm/v3/properties/deals");
      propsCache = Array.isArray(r.results) ? (r.results as Json[]) : [];
    }
    return propsCache;
  }

  const toDeal = (d: Json): CrmDeal => {
    const props = (d.properties ?? {}) as Json;
    return { id: String(d.id), name: String(props.dealname ?? ""), status: STATUS(props), fields: props };
  };

  async function readDeals(ids: string[]): Promise<CrmDeal[]> {
    if (!ids.length) return [];
    const r = await req("POST", "/crm/v3/objects/deals/batch/read", {
      properties: DEAL_PROPS, inputs: ids.slice(0, 50).map((id) => ({ id })),
    });
    return (Array.isArray(r.results) ? (r.results as Json[]) : []).map(toDeal);
  }

  return {
    provider: "hubspot",

    async listDealFields() {
      const out: CrmField[] = [];
      for (const p of await properties()) {
        const meta = (p.modificationMetadata ?? {}) as Json;
        const native = p.hubspotDefined === true;
        if (meta.readOnlyValue === true || p.calculated === true || p.hidden === true) continue;
        if (native && !NATIVE_WRITABLE.includes(String(p.name))) continue;
        const options = Array.isArray(p.options) ? (p.options as Json[]).filter((o) => !o.hidden).map((o) => String(o.label)) : null;
        out.push({ key: String(p.name), label: String(p.label ?? p.name), type: fieldType(p), options: options?.length ? options : null });
      }
      return out.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    },

    async createDealField(label, type, options) {
      // Grupo próprio, para os campos aparecerem juntos no negócio.
      await req("POST", "/crm/v3/properties/deals/groups", { name: "sales_coach", label: "Sales Coach", displayOrder: -1 })
        .catch((e) => { if (!(e instanceof CrmError && e.kind === "invalid")) throw e; });
      const def: Record<string, unknown> = { name: propertyName(label), label, groupName: "sales_coach" };
      if (type === "number") Object.assign(def, { type: "number", fieldType: "number" });
      else if (type === "date") Object.assign(def, { type: "date", fieldType: "date" });
      else if (type === "option") {
        Object.assign(def, {
          type: "enumeration", fieldType: "select",
          options: (options ?? []).map((o, i) => ({ label: o, value: propertyName(o).replace(/^sales_coach_/, ""), displayOrder: i })),
        });
      } else if (type === "hyperlink") Object.assign(def, { type: "string", fieldType: "text" });
      else Object.assign(def, { type: "string", fieldType: "textarea" });
      const r = await req("POST", "/crm/v3/properties/deals", def);
      propsCache = null;
      return {
        key: String(r.name),
        label: String(r.label ?? label),
        type: fieldType(r),
        options: Array.isArray(r.options) ? (r.options as Json[]).map((o) => String(o.label)) : null,
      };
    },

    async dealsForEmail(email) {
      const r = await req("POST", "/crm/v3/objects/contacts/search", {
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
        properties: ["email"], limit: 5,
      });
      const contacts = Array.isArray(r.results) ? (r.results as Json[]) : [];
      const ids = new Set<string>();
      for (const c of contacts) {
        const full = await req("GET", `/crm/v3/objects/contacts/${encodeURIComponent(String(c.id))}?associations=deals`);
        const assoc = ((full.associations as Json)?.deals as Json)?.results;
        for (const a of Array.isArray(assoc) ? (assoc as Json[]) : []) ids.add(String(a.id));
      }
      const deals = await readDeals([...ids]);
      return deals.sort((a, b) => Number(b.status === "ongoing") - Number(a.status === "ongoing"));
    },

    async searchDeals(term) {
      const r = await req("POST", "/crm/v3/objects/deals/search", {
        filterGroups: [{ filters: [{ propertyName: "dealname", operator: "CONTAINS_TOKEN", value: `*${term.trim()}*` }] }],
        properties: DEAL_PROPS, limit: 10,
      });
      return (Array.isArray(r.results) ? (r.results as Json[]) : []).map(toDeal);
    },

    async getDeal(id, fieldKeys = []) {
      const props = [...new Set([...DEAL_PROPS, ...fieldKeys])].join(",");
      return toDeal(await req("GET", `/crm/v3/objects/deals/${encodeURIComponent(id)}?properties=${encodeURIComponent(props)}`));
    },

    async updateDealFields(id, fields) {
      if (!Object.keys(fields).length) return;
      // Lista: o núcleo manda o rótulo; o HubSpot grava o value da opção.
      const defs = await properties();
      const out: Record<string, string | number> = {};
      for (const [key, value] of Object.entries(fields)) {
        const def = defs.find((p) => p.name === key);
        if (def?.type === "enumeration" && Array.isArray(def.options)) {
          const opt = (def.options as Json[]).find((o) => String(o.label).toLowerCase() === String(value).toLowerCase());
          out[key] = opt ? String(opt.value) : value;
        } else {
          out[key] = value;
        }
      }
      await req("PATCH", `/crm/v3/objects/deals/${encodeURIComponent(id)}`, { properties: out });
    },

    async createNote(dealId, text) {
      await req("POST", "/crm/v3/objects/notes", {
        properties: { hs_timestamp: new Date().toISOString(), hs_note_body: escapeHtml(text).replace(/\n/g, "<br>") },
        associations: [{ to: { id: dealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTE_TO_DEAL }] }],
      });
    },

    async createTask(dealId, task) {
      await req("POST", "/crm/v3/objects/tasks", {
        properties: {
          // Meio da manhã no horário de Brasília, para não virar o dia anterior.
          hs_timestamp: new Date(`${task.dueDate}T09:00:00-03:00`).toISOString(),
          hs_task_subject: task.name,
          hs_task_body: task.description,
          hs_task_status: "NOT_STARTED",
          hs_task_type: "TODO",
        },
        associations: [{ to: { id: dealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: TASK_TO_DEAL }] }],
      });
    },
  };
}
