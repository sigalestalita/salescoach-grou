// E-mail de boas-vindas quando uma demonstração é liberada para uma empresa
// (tela Plataforma). Vai para o primeiro admin da empresa, com o link do
// convite (a pessoa cria a própria senha: senha provisória por e-mail fica
// guardada na caixa de entrada) e os primeiros passos. O comercial recebe
// cópia e é o "responder para".

import { esc, hslToHex, Marca } from "./novidades.ts";

const dataLonga = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });

export function renderDemoWelcome(p: {
  orgName: string;
  marca: Marca;
  adminName: string | null;
  inviteUrl: string;
  inviteExpiresAt: string | null;
  demoEndsAt: string | null;
  appUrl: string;
  comercialEmail: string | null;
}): { subject: string; html: string; text: string } {
  const cor = hslToHex(p.marca.primary_hsl);
  const produto = p.marca.product_name;
  const nome = (p.adminName ?? "").trim().split(/\s+/)[0] || null;
  const subject = `Sua demonstração do ${produto} está liberada`;
  const prazo = p.demoEndsAt ? ` até ${dataLonga(p.demoEndsAt)}` : "";
  const validade = p.inviteExpiresAt ? ` O link vale até ${dataLonga(p.inviteExpiresAt)}.` : "";
  const base = p.appUrl.replace(/\/$/, "");
  const passos = [
    ["Crie a sua senha", "pelo botão acima. Você entra como administrador da empresa."],
    ["Instale a extensão do Chrome", "na página Extensão do Chrome. Ela grava as reuniões do Google Meet e do Teams."],
    ["Conecte a sua agenda e grave uma reunião", "em Agendas. Ao entrar na chamada, clique em Gravar: a análise sai em alguns minutos."],
    ["Traga o time", "em Equipe, com um convite por link para cada pessoa."],
  ];
  const assuntoComercial = encodeURIComponent(`Demonstração do ${produto} – ${p.orgName}`);

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
      <tr><td style="padding:24px 28px;border-bottom:3px solid ${cor}">
        ${p.marca.logo_url
          ? `<img src="${esc(p.marca.logo_url)}" alt="${esc(produto)}" height="32" style="height:32px;max-width:200px;border:0">`
          : `<span style="font-size:18px;font-weight:700;color:${cor}">${esc(produto)}</span>`}
      </td></tr>
      <tr><td style="padding:28px 28px 8px">
        <p style="margin:0 0 6px;font-size:16px;color:#0f172a;font-weight:600">${nome ? `Olá, ${esc(nome)}!` : "Olá!"}</p>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155">
          Liberamos o ${esc(produto)} para a sua empresa, <b>${esc(p.orgName)}</b>, em demonstração${esc(prazo)}.
          O ${esc(produto)} grava e analisa as reuniões de vendas do seu time pela metodologia de vocês e mostra, a cada
          reunião, o que fazer melhor na próxima.
        </p>
        <p style="margin:22px 0 8px"><a href="${esc(p.inviteUrl)}" style="display:inline-block;background:${cor};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px">Criar minha senha e entrar</a></p>
        <p style="margin:0 0 24px;font-size:12px;color:#64748b">${esc(validade.trim())} Se o botão não abrir, copie este endereço: <span style="word-break:break-all">${esc(p.inviteUrl)}</span></p>
        <h2 style="margin:0 0 12px;font-size:16px;color:#0f172a">Primeiros passos</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${passos.map(([t, d], i) => `<tr><td valign="top" style="padding:0 12px 14px 0;width:28px"><span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:12px;background:${cor};color:#fff;font-size:13px;font-weight:700">${i + 1}</span></td>
          <td style="padding:0 0 14px;font-size:14px;line-height:1.55;color:#334155"><b style="color:#0f172a">${esc(t)}</b> ${
            i === 1 ? esc(d).replace("Extensão do Chrome", `<a href="${esc(base)}/extensao" style="color:${cor}">Extensão do Chrome</a>`) : esc(d)}</td></tr>`).join("")}
        </table>
      </td></tr>
      ${p.comercialEmail ? `<tr><td style="padding:4px 28px 24px">
        <div style="background:#f8fafc;border-radius:10px;padding:16px 18px;font-size:14px;line-height:1.55;color:#334155">
          Quer ajuda para configurar a metodologia e a base de conhecimento, ou tirar alguma dúvida?
          <a href="mailto:${esc(p.comercialEmail)}?subject=${assuntoComercial}" style="color:${cor};font-weight:600">Fale com o nosso time comercial</a> ou responda este e-mail.
        </div>
      </td></tr>` : ""}
      <tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b">
        Você recebeu este e-mail porque a empresa ${esc(p.orgName)} foi cadastrada para uma demonstração do ${esc(produto)}.
        Se não esperava por ele, pode ignorar: nada acontece sem você criar a senha.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = [
    nome ? `Olá, ${nome}!` : "Olá!",
    "",
    `Liberamos o ${produto} para a sua empresa, ${p.orgName}, em demonstração${prazo}.`,
    "",
    `Crie a sua senha e entre: ${p.inviteUrl}${validade}`,
    "",
    "Primeiros passos:",
    ...passos.map(([t, d], i) => `${i + 1}. ${t} ${d}`),
    "",
    p.comercialEmail ? `Dúvidas ou ajuda para configurar: ${p.comercialEmail} (ou responda este e-mail).` : "",
  ].join("\n");

  return { subject, html, text };
}
