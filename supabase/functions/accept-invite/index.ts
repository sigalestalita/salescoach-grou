// Aceite de convite: vincula o usuário autenticado à organização que o
// convidou. O e-mail do convite precisa ser o mesmo da conta.

import { json, preflight } from "../_shared/cors.ts";
import { adminClient, ANON_KEY, SUPABASE_URL } from "../_shared/tenant.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(req, { error: "Faça login para aceitar o convite." }, 401);
    }

    const { token } = await req.json();
    if (!token) return json(req, { error: "Token do convite é obrigatório" }, 400);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user?.email) {
      return json(req, { error: "Sessão inválida" }, 401);
    }

    const admin = adminClient();
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
