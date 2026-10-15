// Conexão de um CRM por OAuth.
//
// POST { provider, returnTo } com o token do usuário (admin da organização):
//   devolve o endereço de autorização do CRM, com um "state" assinado.
// GET ?code&state: o CRM devolve o navegador para cá depois da autorização.
//   Troca o código por tokens, guarda criptografado e volta para o app.
//
// verify_jwt = false (config.toml): o GET vem do navegador, sem token do
// Supabase; a autenticidade vem do "state" assinado.

import { json, preflight } from "../_shared/cors.ts";
import { getCaller, HttpError, adminClient, requireRole } from "../_shared/tenant.ts";
import { signState, verifyState } from "../_shared/crm/crypto.ts";
import { accountLabel, AVAILABLE_PROVIDERS, oauthFor, oauthRedirectUri, saveConnection } from "../_shared/crm/connection.ts";
import { CrmError, CrmProvider } from "../_shared/crm/types.ts";
import { backTo, safeReturn } from "../_shared/redirect.ts";

const PROVIDERS: CrmProvider[] = AVAILABLE_PROVIDERS;
const redirectUri = oauthRedirectUri;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  // ── Volta do CRM ──
  if (req.method === "GET") {
    const url = new URL(req.url);
    const state = await verifyState(url.searchParams.get("state") ?? "");
    if (!state) return new Response("Link de autorização inválido ou expirado. Volte ao Sales Coach e tente de novo.", { status: 400 });
    const returnTo = safeReturn(state.returnTo);
    const code = url.searchParams.get("code");
    if (!code) return backTo(returnTo, { crm: "erro", motivo: url.searchParams.get("error") ?? "autorizacao_negada" });

    try {
      const provider = state.provider as CrmProvider;
      const tokens = await oauthFor(provider).exchangeCode(code, redirectUri(), url.searchParams);
      const admin = adminClient();
      // Quem iniciou ainda precisa ser admin da mesma organização.
      const { data: role } = await admin.from("user_roles").select("role")
        .eq("user_id", state.userId).eq("org_id", state.orgId).maybeSingle();
      if (role?.role !== "admin") return backTo(returnTo, { crm: "erro", motivo: "sem_permissao" });

      await saveConnection(admin, state.orgId, provider, state.userId, tokens, accountLabel(provider, tokens.apiDomain));
      await admin.from("audit_log").insert({
        org_id: state.orgId, actor_user_id: state.userId, action: "crm_conectado", entity: "crm_connections", metadata: { provider },
      }).then(() => {}, () => {});
      return backTo(returnTo, { crm: "conectado" });
    } catch (e) {
      console.error("crm-oauth callback:", e);
      const motivo = e instanceof CrmError ? e.message : "falha_na_conexao";
      return backTo(returnTo, { crm: "erro", motivo });
    }
  }

  // ── Início da conexão ──
  try {
    const ctx = await getCaller(req);
    requireRole(ctx, "admin");
    const body = await req.json().catch(() => ({}));
    const provider = String(body.provider ?? "rdstation") as CrmProvider;
    if (!PROVIDERS.includes(provider)) throw new HttpError(400, "CRM ainda não disponível.");
    const state = await signState({
      orgId: ctx.orgId, userId: ctx.userId, provider, returnTo: safeReturn(body.returnTo), issuedAt: Date.now(),
    });
    return json(req, { url: oauthFor(provider).authorizeUrl(state, redirectUri()) });
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message }, e.status);
    if (e instanceof CrmError) return json(req, { error: e.message }, 400);
    console.error("crm-oauth:", e);
    return json(req, { error: "Não foi possível iniciar a conexão." }, 500);
  }
});
