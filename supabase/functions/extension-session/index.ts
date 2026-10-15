// Login automático da extensão do Chrome.
//
// O site do Sales Coach, com o usuário logado, chama esta função e recebe um
// código de uso único (o hash de um magic link, que não é enviado por e-mail).
// O site entrega o código à extensão, que o troca por uma sessão própria em
// /auth/v1/verify. Assim a extensão não reaproveita a sessão do site: duas
// cópias do mesmo refresh token se derrubariam ao renovar.
//
// Só quem já tem uma sessão válida consegue o código, e ele vale para o próprio
// usuário. O CORS limita a chamada às origens do Sales Coach.

import { json, preflight } from "../_shared/cors.ts";
import { adminClient, ANON_KEY, SUPABASE_URL } from "../_shared/tenant.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "Não autorizado" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.email) return json(req, { error: "Sessão inválida" }, 401);

    const { data, error } = await adminClient().auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
    });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
      console.error("extension-session: generateLink falhou", error);
      return json(req, { error: "Não foi possível conectar a extensão" }, 500);
    }

    return json(req, { token_hash: tokenHash, user_id: user.id });
  } catch (err) {
    console.error("extension-session:", err);
    return json(req, { error: "Erro inesperado" }, 500);
  }
});
