// Volta do OAuth da agenda (Google ou Outlook).
//
// verify_jwt = false (config.toml): o navegador chega sem token do Supabase.
// Só aceita um "state" assinado pela meeting-bot, com validade de 15 minutos.
// Troca o código pelo refresh token, cria a agenda na Recall.ai e volta para o
// app. Daí em diante a Recall avisa (webhook) cada mudança na agenda.

import { adminClient } from "../_shared/tenant.ts";
import { verifyState } from "../_shared/crm/crypto.ts";
import { recall, RecallError } from "../_shared/recall.ts";
import { exchangeCode, providerOf } from "../_shared/calendar-oauth.ts";

function backTo(returnTo: string, params: Record<string, string>): Response {
  let u: URL;
  try { u = new URL(returnTo); } catch { u = new URL((Deno.env.get("APP_URL") ?? "https://localhost") + "/agendas"); }
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const state = await verifyState(url.searchParams.get("state") ?? "");
  if (!state) return new Response("Link de autorização inválido ou expirado. Volte ao Sales Coach e tente de novo.", { status: 400 });
  const code = url.searchParams.get("code");
  if (!code) return backTo(state.returnTo, { agenda: "erro", motivo: url.searchParams.get("error") ?? "autorizacao_negada" });

  const admin = adminClient();
  try {
    // Quem iniciou ainda pertence à mesma organização.
    const { data: profile } = await admin.from("profiles").select("org_id").eq("user_id", state.userId).maybeSingle();
    if (profile?.org_id !== state.orgId) return backTo(state.returnTo, { agenda: "erro", motivo: "sem_permissao" });

    const refreshToken = await exchangeCode(state.provider, code);
    const creds = providerOf(state.provider).creds();
    const cal = await recall("POST", "/api/v2/calendars/", {
      platform: state.provider,
      oauth_client_id: creds.clientId,
      oauth_client_secret: creds.clientSecret,
      oauth_refresh_token: refreshToken,
      metadata: { org_id: state.orgId, user_id: state.userId },
    });

    // Uma agenda por vendedor: a anterior sai (e os bots dela com ela).
    const { data: old } = await admin.from("calendar_connections").select("id, recall_calendar_id")
      .eq("user_id", state.userId).eq("status", "conectado");
    for (const o of old ?? []) {
      await recall("DELETE", `/api/v2/calendars/${o.recall_calendar_id}/`).catch(() => {});
      await admin.from("calendar_connections").update({ status: "desconectado", updated_at: new Date().toISOString() }).eq("id", o.id);
    }

    const { error } = await admin.from("calendar_connections").insert({
      org_id: state.orgId,
      user_id: state.userId,
      provider: state.provider,
      recall_calendar_id: String(cal.id),
      email: (cal.platform_email ?? cal.oauth_email ?? null) as string | null,
      status: "conectado",
    });
    if (error) throw new Error(error.message);
    await admin.from("audit_log").insert({
      org_id: state.orgId, actor_user_id: state.userId, action: "agenda_conectada", entity: "calendar_connections", metadata: { provider: state.provider },
    }).then(() => {}, () => {});
    return backTo(state.returnTo, { agenda: "conectada" });
  } catch (e) {
    console.error("calendar-oauth:", e);
    return backTo(state.returnTo, { agenda: "erro", motivo: e instanceof RecallError ? e.message : "falha_na_conexao" });
  }
});
