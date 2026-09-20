// Formulário do site institucional. Público, sem login.
//
// Grava o lead em site_leads e, se houver RESEND_API_KEY, avisa por e-mail.
// Proteções: campo-isca (honeypot) que os robôs preenchem e as pessoas não
// veem, validação de tamanho, e no máximo 5 envios por IP por hora.
// Uma falha no aviso por e-mail não derruba o lead: ele já está gravado.

import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { corsHeaders, preflight } from "../_shared/cors.ts";

const SITE_HOSTS = ["salescoach.app.br", "www.salescoach.app.br"];
const NOTIFY_TO = Deno.env.get("SITE_LEAD_NOTIFY_TO") ?? "contato@salescoach.app.br";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Respostas sempre com o CORS do site, não só o da plataforma.
function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req, SITE_HOSTS), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const pf = preflight(req, SITE_HOSTS);
  if (pf) return pf;
  if (req.method !== "POST") return json(req, { error: "Método não permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "Corpo inválido" }, 400); }

  // Honeypot: responde sucesso para o robô não insistir, mas não grava.
  if (typeof body.site === "string" && body.site.trim()) return json(req, { ok: true });

  const email = String(body.email ?? "").trim().toLowerCase();
  const empresa = String(body.empresa ?? "").trim();
  if (!EMAIL_RE.test(email) || email.length > 160) return json(req, { error: "Informe um e-mail válido." }, 400);
  if (empresa.length < 2 || empresa.length > 120) return json(req, { error: "Informe a empresa." }, 400);

  const planos = ["essencial", "profissional", "enterprise"];
  const plano = planos.includes(String(body.plano)) ? String(body.plano) : null;
  const usuariosNum = Number(body.usuarios);
  const usuarios = Number.isInteger(usuariosNum) && usuariosNum > 0 && usuariosNum <= 10000 ? usuariosNum : null;
  const interesse = body.interesse === "analise-reuniao" ? "analise-reuniao" : "demonstracao";
  const mensagem = body.mensagem ? String(body.mensagem).slice(0, 2000) : null;
  const origem = body.origem ? String(body.origem).slice(0, 300) : null;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (ip) {
    const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("site_leads").select("id", { count: "exact", head: true })
      .eq("ip", ip).gte("created_at", desde);
    if ((count ?? 0) >= 5) return json(req, { error: "Muitos envios seguidos. Tente de novo em uma hora." }, 429);
  }

  const { error } = await supabase.from("site_leads").insert({
    email, empresa, plano, usuarios, interesse, mensagem, origem, user_agent: userAgent, ip,
  });
  if (error) {
    console.error("site-lead: insert", error);
    return json(req, { error: "Não foi possível registrar agora. Tente de novo em instantes." }, 500);
  }

  const resend = Deno.env.get("RESEND_API_KEY");
  if (resend) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: Deno.env.get("SITE_LEAD_FROM") ?? "Sales Coach <site@salescoach.app.br>",
          to: [NOTIFY_TO],
          reply_to: email,
          subject: `Novo lead do site: ${empresa}`,
          text: [
            `E-mail: ${email}`, `Empresa: ${empresa}`,
            `Interesse: ${interesse === "analise-reuniao" ? "ver uma reunião analisada" : "demonstração"}`,
            `Plano: ${plano ?? "não informado"}`, `Usuários: ${usuarios ?? "não informado"}`,
            `Origem: ${origem ?? "-"}`, "", mensagem ?? "",
          ].join("\n"),
        }),
      });
    } catch (e) {
      console.error("site-lead: aviso por e-mail", e);
    }
  }

  return json(req, { ok: true });
});
