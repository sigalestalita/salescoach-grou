// Descadastro do e-mail de novidades (link no rodapé e cabeçalho
// List-Unsubscribe).
//
// GET ?t=TOKEN    página com o botão de confirmar (só abrir o link não muda
//                 nada: filtros de e-mail das empresas "clicam" nos links)
// POST ?t=TOKEN   descadastra: o botão da página (acao=sair) ou o descadastro
//                 em um clique do Gmail e do Outlook (List-Unsubscribe=One-Click);
//                 com acao=reativar, liga de novo.
//
// verify_jwt = false (config.toml): quem clica não está logado; o token
// assinado (novidades.ts) identifica a pessoa.

import { adminClient } from "../_shared/tenant.ts";
import { verifyUnsubscribe } from "../_shared/novidades.ts";

const secret = () => Deno.env.get("EMAIL_TOKEN_SECRET") || Deno.env.get("CRM_TOKEN_KEY") || "";

const BOTAO = "background:#1d4ed8;color:#fff;border:0;border-radius:8px;padding:11px 20px;font-size:15px;font-weight:600;cursor:pointer";

function pagina(titulo: string, texto: string, form?: { action: string; acao: string; label: string; secundario?: boolean }) {
  const botao = form
    ? `<form method="post" action="${form.action}" style="margin:22px 0 0"><input type="hidden" name="acao" value="${form.acao}">
<button type="submit" style="${form.secundario ? "background:none;border:0;color:#1d4ed8;font-size:14px;text-decoration:underline;cursor:pointer" : BOTAO}">${form.label}</button></form>`
    : "";
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${titulo}</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;color:#0f172a">
<main style="max-width:480px;margin:12vh auto;background:#fff;border-radius:14px;padding:32px 28px;text-align:center">
<h1 style="font-size:20px;margin:0 0 12px">${titulo}</h1><p style="font-size:15px;line-height:1.6;color:#475569;margin:0">${texto}</p>${botao}
</main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  const userId = token ? await verifyUnsubscribe(token, secret()) : null;
  if (!userId) return pagina("Link inválido", "Este link de descadastro não é válido. Use o link do e-mail mais recente.");
  const aqui = `${url.pathname}?t=${encodeURIComponent(token)}`;

  if (req.method === "GET") {
    return pagina("Parar de receber as novidades?", "Você deixa de receber o e-mail semanal com as novidades da plataforma. Dá para voltar quando quiser.", {
      action: aqui, acao: "sair", label: "Sim, não quero mais receber",
    });
  }
  if (req.method !== "POST") return new Response("Método não permitido", { status: 405 });

  const form = await req.formData().catch(() => null);
  const acao = String(form?.get("acao") ?? "sair");
  const umClique = form?.get("List-Unsubscribe") === "One-Click";
  const reativar = acao === "reativar";

  const { error } = await adminClient().from("email_preferences")
    .upsert({ user_id: userId, novidades: reativar, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) {
    console.error("email-preferences:", error);
    if (umClique) return new Response("erro", { status: 500 });
    return pagina("Não deu certo", "Não foi possível salvar agora. Tente de novo em alguns minutos.");
  }
  if (umClique) return new Response("ok");
  return reativar
    ? pagina("Pronto, você volta a receber", "Você vai receber de novo o e-mail com as novidades da plataforma.")
    : pagina("Pronto, descadastrado", "Você não vai mais receber o e-mail com as novidades da plataforma.", {
      action: aqui, acao: "reativar", label: "Mudei de ideia: quero receber", secundario: true,
    });
});
