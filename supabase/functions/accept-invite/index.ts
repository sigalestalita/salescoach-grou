// Convites.
//   { token, acao: "status" }  → situação do convite (válido, vencido, cancelado, já usado),
//                                o e-mail convidado e se já existe conta com ele. Sem login:
//                                quem tem o link (o token) pode ver.
//   { acao: "pendentes" }      → convites válidos para o e-mail do usuário logado (tela
//                                "Acesso pendente").
//   { token }                  → aceite: vincula o usuário logado à organização que o
//                                convidou. O e-mail do convite precisa ser o mesmo da conta.

import { json, preflight } from "../_shared/cors.ts";
import { adminClient, ANON_KEY, SUPABASE_URL } from "../_shared/tenant.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const { token, acao } = await req.json();
    const admin = adminClient();

    if (acao === "status") {
      if (!token || !UUID.test(token)) return json(req, { status: "invalido" });
      const { data, error } = await admin.rpc("invite_status", { _token: token });
      if (error) throw error;
      return json(req, data);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(req, { error: "Faça login para aceitar o convite." }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user?.email) {
      return json(req, { error: "Sessão inválida" }, 401);
    }

    if (acao === "pendentes") {
      const { data, error } = await admin.rpc("pending_invites_for_email", { _email: user.email });
      if (error) throw error;
      return json(req, { convites: data ?? [] });
    }

    if (!token) return json(req, { error: "Token do convite é obrigatório" }, 400);
    const { data, error } = await admin.rpc("accept_invite", {
      _token: token,
      _user_id: user.id,
      _email: user.email,
    });

    if (error) {
      // As mensagens vêm da função do banco e já são legíveis.
      return json(req, { error: error.message }, 400);
    }

    return json(req, { success: true, org_id: data });
  } catch (e) {
    console.error("accept-invite error", e);
    return json(req, { error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
