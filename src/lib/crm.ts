// Cliente da integração com CRM. Tudo passa pela edge function crm-api, que
// valida papel e organização; o app não lê as tabelas de CRM direto.
import { supabase } from "@/integrations/supabase/client";

export type CrmProvider = "rdstation" | "hubspot" | "pipedrive" | "kommo";

export const CRM_NAME: Record<CrmProvider, string> = {
  rdstation: "RD Station CRM",
  hubspot: "HubSpot",
  pipedrive: "Pipedrive",
  kommo: "Kommo",
};

export interface CrmSettings {
  criar_anotacao?: boolean;
  criar_tarefa?: boolean;
  envio_automatico?: boolean;
  dias_tarefa?: number;
}

export interface CrmConnection {
  id: string;
  provider: CrmProvider;
  status: "ativo" | "erro" | "desconectado";
  account_label: string | null;
  connected_at: string;
  last_error: string | null;
  settings: CrmSettings;
}

export interface CrmSource {
  key: string;
  label: string;
  type: "number" | "text" | "date" | "option" | "url";
  description: string;
}

export interface CrmMapping {
  source_key: string;
  target_field: string;
  target_label: string | null;
  target_type: string | null;
  mode: "sempre" | "se_vazio";
}

export interface CrmField {
  key: string;
  label: string;
  type: string;
  options: string[] | null;
}

export interface CrmDealRef {
  id: string;
  name: string;
  status?: string | null;
}

export interface CrmJob {
  id: string;
  status: "pendente" | "enviando" | "enviado" | "erro" | "aguardando_vinculo";
  attempts: number;
  deal_id: string | null;
  last_error: string | null;
  sent: {
    deal?: CrmDealRef;
    campos?: Record<string, string | number>;
    ignorados?: { field: string; source: string; reason: string }[];
    tarefa?: { nome: string; vencimento: string };
    etapas?: string[];
  } | null;
  created_at: string;
  updated_at: string;
}

export interface JobResult {
  status: CrmJob["status"];
  message?: string;
}

async function call<T>(name: "crm-api" | "crm-oauth", body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx?.status === 401) {
      // Login expirado no servidor: sai e volta para a tela de login.
      await supabase.auth.signOut().catch(() => {});
      throw new Error("Sua sessão expirou. Entre novamente.");
    }
    if (ctx && typeof ctx.json === "function") {
      const payload = await ctx.json().catch(() => null);
      if (payload?.error) message = payload.error;
    }
    throw new Error(message);
  }
  return data as T;
}

export const crmApi = {
  status: () => call<{ connection: CrmConnection | null; mappings: CrmMapping[]; catalog: CrmSource[] }>("crm-api", { action: "status" }),
  connect: (provider: CrmProvider) =>
    call<{ url: string }>("crm-oauth", { provider, returnTo: `${window.location.origin}/configuracoes` }),
  fields: () => call<{ fields: CrmField[] }>("crm-api", { action: "fields" }),
  createFields: (sources: string[]) => call<{ created: string[] }>("crm-api", { action: "create_fields", sources }),
  saveMapping: (source_key: string, target_field: string | null, mode: "sempre" | "se_vazio") =>
    call<{ ok: true }>("crm-api", { action: "save_mapping", source_key, target_field, mode }),
  saveSettings: (settings: CrmSettings) => call<{ settings: CrmSettings }>("crm-api", { action: "settings", settings }),
  disconnect: () => call<{ ok: true }>("crm-api", { action: "disconnect" }),
  /** Kommo com token de longa duração (integração privada na conta do cliente). */
  connectToken: (provider: CrmProvider, subdomain: string, token: string) =>
    call<{ ok: true }>("crm-api", { action: "connect_token", provider, subdomain, token }),
  meeting: (meetingId: string) =>
    call<{
      connection: { provider: CrmProvider; status: string; account_label: string | null } | null;
      link: { provider: CrmProvider; id: string; name: string | null; at: string | null } | null;
      lead_email: string | null;
      jobs: CrmJob[];
    }>("crm-api", { action: "meeting", meetingId }),
  searchDeals: (term: string) => call<{ deals: CrmDealRef[] }>("crm-api", { action: "search_deals", term }),
  suggestDeals: (meetingId: string) => call<{ deals: CrmDealRef[] }>("crm-api", { action: "suggest_deals", meetingId }),
  linkDeal: (meetingId: string, dealId: string) =>
    call<{ deal: CrmDealRef; result: JobResult | null }>("crm-api", { action: "link_deal", meetingId, dealId }),
  unlinkDeal: (meetingId: string) => call<{ ok: true }>("crm-api", { action: "unlink_deal", meetingId }),
  send: (meetingId: string) => call<{ result: JobResult }>("crm-api", { action: "send", meetingId }),
};

/** Tipos de campo do CRM que aceitam cada tipo de dado do Sales Coach. */
export function compatible(source: CrmSource["type"], fieldType: string): boolean {
  const t = fieldType.toLowerCase();
  if (["text", "textarea", "varchar", "string"].includes(t)) return true; // texto aceita tudo
  if (source === "number") return ["number", "numeric", "double", "integer"].includes(t);
  if (source === "date") return ["date", "date_time", "datetime"].includes(t);
  if (source === "option") return ["option", "select", "enum", "radiobutton"].includes(t);
  if (source === "url") return ["hyperlink", "url"].includes(t);
  return false;
}

export const JOB_LABEL: Record<CrmJob["status"], string> = {
  pendente: "Na fila",
  enviando: "Enviando",
  enviado: "Enviado",
  erro: "Erro",
  aguardando_vinculo: "Escolha o negócio",
};
