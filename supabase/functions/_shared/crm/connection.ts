// Conexão de uma organização com um CRM: guarda e renova tokens e entrega o
// conector pronto para uso. Só roda com a service role.

import { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { decryptToken, encryptToken } from "./crypto.ts";
import { rdConnector, rdOAuth } from "./rdstation.ts";
import { CrmConnector, CrmError, CrmOAuth, CrmProvider, TokenSet } from "./types.ts";

export interface ConnectionRow {
  id: string;
  org_id: string;
  provider: CrmProvider;
  status: "ativo" | "erro" | "desconectado";
  account_label: string | null;
  settings: { criar_anotacao?: boolean; criar_tarefa?: boolean; envio_automatico?: boolean; dias_tarefa?: number };
}

const OAUTH: Partial<Record<CrmProvider, CrmOAuth>> = { rdstation: rdOAuth };
const CONNECTORS: Partial<Record<CrmProvider, (token: string) => CrmConnector>> = { rdstation: rdConnector };

export function oauthFor(provider: CrmProvider): CrmOAuth {
  const o = OAUTH[provider];
  if (!o) throw new CrmError(`O CRM ${provider} ainda não está disponível.`, "invalid");
  return o;
}

export async function getConnection(admin: SupabaseClient, orgId: string, provider: CrmProvider): Promise<ConnectionRow | null> {
  const { data } = await admin
    .from("crm_connections")
    .select("id, org_id, provider, status, account_label, settings")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .maybeSingle();
  return (data as ConnectionRow) ?? null;
}

/** Conexão ativa da organização (hoje, no máximo uma por organização é usada). */
export async function activeConnection(admin: SupabaseClient, orgId: string): Promise<ConnectionRow | null> {
  const { data } = await admin
    .from("crm_connections")
    .select("id, org_id, provider, status, account_label, settings")
    .eq("org_id", orgId)
    .neq("status", "desconectado")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ConnectionRow) ?? null;
}

/** Cria ou reativa a conexão e grava os tokens criptografados. */
export async function saveConnection(
  admin: SupabaseClient,
  orgId: string,
  provider: CrmProvider,
  userId: string,
  tokens: TokenSet,
  accountLabel: string | null,
): Promise<string> {
  const { data, error } = await admin
    .from("crm_connections")
    .upsert(
      {
        org_id: orgId,
        provider,
        status: "ativo",
        account_label: accountLabel,
        connected_by: userId,
        connected_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,provider" },
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(`Não foi possível salvar a conexão: ${error?.message}`);
  await storeTokens(admin, data.id, orgId, tokens);
  return data.id;
}

async function storeTokens(admin: SupabaseClient, connectionId: string, orgId: string, t: TokenSet) {
  const { error } = await admin.from("crm_credentials").upsert({
    connection_id: connectionId,
    org_id: orgId,
    access_token_enc: await encryptToken(t.accessToken),
    refresh_token_enc: t.refreshToken ? await encryptToken(t.refreshToken) : null,
    expires_at: t.expiresAt,
    refreshed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Não foi possível salvar os tokens: ${error.message}`);
}

export async function markConnectionError(admin: SupabaseClient, connectionId: string, message: string) {
  await admin.from("crm_connections")
    .update({ status: "erro", last_error: message, updated_at: new Date().toISOString() })
    .eq("id", connectionId);
}

/** Troca o refresh token por um par novo. O antigo deixa de valer no RD Station. */
export async function refreshConnection(admin: SupabaseClient, conn: ConnectionRow): Promise<string> {
  const { data: cred } = await admin
    .from("crm_credentials")
    .select("refresh_token_enc")
    .eq("connection_id", conn.id)
    .maybeSingle();
  if (!cred?.refresh_token_enc) throw new CrmError("Conexão sem refresh token. Reconecte o CRM.", "auth");
  try {
    const tokens = await oauthFor(conn.provider).refresh(await decryptToken(cred.refresh_token_enc));
    await storeTokens(admin, conn.id, conn.org_id, tokens);
    if (conn.status === "erro") {
      await admin.from("crm_connections").update({ status: "ativo", last_error: null }).eq("id", conn.id);
    }
    return tokens.accessToken;
  } catch (e) {
    if (e instanceof CrmError && e.kind === "auth") {
      await markConnectionError(admin, conn.id, "A autorização do CRM expirou. Um administrador precisa reconectar.");
    }
    throw e;
  }
}

/** Token válido, renovando quando faltam menos de 5 minutos. */
export async function accessToken(admin: SupabaseClient, conn: ConnectionRow): Promise<string> {
  const { data: cred } = await admin
    .from("crm_credentials")
    .select("access_token_enc, expires_at")
    .eq("connection_id", conn.id)
    .maybeSingle();
  if (!cred) throw new CrmError("Conexão sem credenciais. Reconecte o CRM.", "auth");
  const expires = cred.expires_at ? Date.parse(cred.expires_at) : 0;
  if (expires - Date.now() < 5 * 60 * 1000) return refreshConnection(admin, conn);
  return decryptToken(cred.access_token_enc);
}

export async function connectorFor(admin: SupabaseClient, conn: ConnectionRow): Promise<CrmConnector> {
  const make = CONNECTORS[conn.provider];
  if (!make) throw new CrmError(`O CRM ${conn.provider} ainda não está disponível.`, "invalid");
  if (conn.status === "desconectado") throw new CrmError("O CRM está desconectado.", "auth");
  return make(await accessToken(admin, conn));
}
