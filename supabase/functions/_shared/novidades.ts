// Novidades da plataforma: o e-mail semanal, o rascunho pela IA e o link de
// descadastro. Funções puras (o envio e o banco ficam em product-updates).

export interface Novidade {
  id: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_path: string | null;
  audience: string[];
  published_at?: string | null;
}

export interface Marca {
  product_name: string;
  logo_url: string | null;
  primary_hsl: string | null;
  support_email: string | null;
}

/** Telas para onde uma novidade pode levar (o rascunho da IA só usa estas). */
export const CTA_PATHS = [
  "/", "/agendas", "/agendas?visao=agenda", "/visao-geral", "/conhecimento", "/argumentos", "/treino", "/extensao",
  "/configuracoes", "/equipe",
];

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** "214 74% 40%" (como a marca guarda) para #rrggbb, que todo cliente de e-mail entende. */
export function hslToHex(hsl: string | null | undefined, fallback = "#1d4ed8"): string {
  const m = (hsl ?? "").match(/^\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/);
  if (!m) return fallback;
  const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Novidades que valem para o papel da pessoa. */
export const paraPapel = (ns: Novidade[], role: string) => ns.filter((n) => !n.audience?.length || n.audience.includes(role));

/** Identificador do envio: o mesmo conjunto de novidades nunca vai duas vezes para a mesma pessoa. */
export function envioRef(ns: Novidade[]): string {
  return `novidades:${ns.map((n) => n.id).sort().join(",")}`.slice(0, 400);
}

export function assunto(ns: Novidade[], marca: Marca): string {
  return ns.length === 1
    ? `Novidade no ${marca.product_name}: ${ns[0].title}`
    : `${ns.length} novidades no ${marca.product_name} esta semana`;
}

export function renderEmail(p: {
  novidades: Novidade[];
  marca: Marca;
  appUrl: string;
  unsubscribeUrl: string;
  firstName: string | null;
  teste?: boolean;
}): { subject: string; html: string; text: string } {
  const cor = hslToHex(p.marca.primary_hsl);
  const base = p.appUrl.replace(/\/$/, "");
  const link = (path: string | null) => `${base}${path && path.startsWith("/") ? path : "/"}`;
  const subject = `${p.teste ? "[Teste] " : ""}${assunto(p.novidades, p.marca)}`;
  const ola = p.firstName ? `Olá, ${esc(p.firstName)}!` : "Olá!";
  const intro = p.novidades.length === 1
    ? `Tem novidade no ${esc(p.marca.product_name)}:`
    : `Separamos o que chegou de novo no ${esc(p.marca.product_name)}:`;

  const itens = p.novidades.map((n) => `
      <tr><td style="padding:0 0 28px">
        <h2 style="margin:0 0 8px;font-size:18px;line-height:1.3;color:#0f172a">${esc(n.title)}</h2>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155">${esc(n.body)}</p>
        ${n.cta_label ? `<a href="${esc(link(n.cta_path))}" style="display:inline-block;background:${cor};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">${esc(n.cta_label)}</a>` : ""}
      </td></tr>`).join("");

  const logo = p.marca.logo_url
    ? `<img src="${esc(p.marca.logo_url)}" alt="${esc(p.marca.product_name)}" height="32" style="height:32px;max-width:200px;border:0">`
    : `<span style="font-size:18px;font-weight:700;color:${cor}">${esc(p.marca.product_name)}</span>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
      <tr><td style="padding:24px 28px;border-bottom:3px solid ${cor}">${logo}</td></tr>
      <tr><td style="padding:28px 28px 4px">
        <p style="margin:0 0 6px;font-size:16px;color:#0f172a;font-weight:600">${ola}</p>
        <p style="margin:0 0 24px;font-size:15px;color:#475569">${intro}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itens}</table>
      </td></tr>
      <tr><td style="padding:18px 28px 26px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b">
        Você recebe este e-mail porque usa o ${esc(p.marca.product_name)}.${p.marca.support_email ? ` Dúvidas: <a href="mailto:${esc(p.marca.support_email)}" style="color:#64748b">${esc(p.marca.support_email)}</a>.` : ""}<br>
        <a href="${esc(p.unsubscribeUrl)}" style="color:#64748b">Não quero mais receber as novidades</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = [
    p.firstName ? `Olá, ${p.firstName}!` : "Olá!",
    "",
    p.novidades.length === 1 ? `Tem novidade no ${p.marca.product_name}:` : `O que chegou de novo no ${p.marca.product_name}:`,
    "",
    ...p.novidades.flatMap((n) => [n.title.toUpperCase(), n.body, n.cta_label ? `${n.cta_label}: ${link(n.cta_path)}` : "", ""]),
    `Não quer mais receber? ${p.unsubscribeUrl}`,
  ].join("\n");

  return { subject, html, text };
}

// ── Rascunho pela IA ──

export interface MudancaFonte {
  titulo: string;
  descricao: string;
}

export function draftPrompt(mudancas: MudancaFonte[], notas: string): { system: string; user: string } {
  const system = `Você escreve as novidades de uma plataforma de coaching de vendas (grava e analisa reuniões comerciais, dicas ao vivo, treino com cliente simulado, extensão do Chrome) para os usuários finais: vendedores, gestores comerciais e administradores das empresas clientes.

REGRAS:
- Só o que muda para quem usa. Ignore mudanças internas (refatoração, testes, banco, deploy, correções invisíveis).
- Junte mudanças relacionadas numa novidade só. No máximo 4 novidades.
- Português do Brasil, direto, falando com "você". Benefício primeiro, depois como usar.
- Não use o nome do produto: a plataforma tem a marca de cada cliente. Diga "a plataforma" quando precisar.
- Não invente nada além do que está nas mudanças.
- Título até 60 caracteres. Texto com 2 ou 3 frases.
- cta_path deve ser um destes: ${CTA_PATHS.join(", ")}.
- publico: os papéis a quem interessa, entre "admin", "gestor" e "vendedor".
- Responda só com o JSON pedido.`;
  const user = `MUDANÇAS DA SEMANA:
${mudancas.length ? mudancas.map((m, i) => `${i + 1}. ${m.titulo}\n${m.descricao}`).join("\n\n") : "(nenhuma listada)"}
${notas.trim() ? `\nANOTAÇÕES DA EQUIPE:\n${notas.trim()}` : ""}

Responda neste JSON:
{ "novidades": [ { "titulo": "...", "texto": "...", "cta_label": "texto do botão, curto", "cta_path": "/...", "publico": ["admin","gestor","vendedor"] } ] }
Se nada interessar aos usuários, responda { "novidades": [] }.`;
  return { system, user };
}

export function parseDrafts(content: string): Omit<Novidade, "id">[] {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return [];
  let raw: { novidades?: unknown };
  try { raw = JSON.parse(m[0]); } catch { return []; }
  if (!Array.isArray(raw.novidades)) return [];
  const papeis = new Set(["admin", "gestor", "vendedor"]);
  const out: Omit<Novidade, "id">[] = [];
  for (const n of raw.novidades.slice(0, 4) as Record<string, unknown>[]) {
    const title = typeof n.titulo === "string" ? n.titulo.trim().slice(0, 90) : "";
    const body = typeof n.texto === "string" ? n.texto.trim().slice(0, 900) : "";
    if (!title || !body) continue;
    const path = typeof n.cta_path === "string" && CTA_PATHS.includes(n.cta_path) ? n.cta_path : null;
    const label = typeof n.cta_label === "string" && n.cta_label.trim() ? n.cta_label.trim().slice(0, 40) : null;
    const publico = Array.isArray(n.publico) ? (n.publico as unknown[]).filter((r): r is string => typeof r === "string" && papeis.has(r)) : [];
    out.push({
      title, body,
      cta_path: path, cta_label: path ? label ?? "Ver na plataforma" : null,
      audience: publico.length ? publico : ["admin", "gestor", "vendedor"],
    });
  }
  return out;
}

// ── Link de descadastro ──

const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function chave(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`email:${secret}`));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

/** Token sem validade (o link do rodapé precisa funcionar meses depois): userId + assinatura. */
export async function unsubscribeToken(userId: string, secret: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await chave(secret), enc.encode(userId)));
  return `${userId}.${b64url(sig).slice(0, 32)}`;
}

export async function verifyUnsubscribe(token: string, secret: string): Promise<string | null> {
  const [userId] = token.split(".");
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const esperado = await unsubscribeToken(userId, secret);
  if (esperado.length !== token.length) return null;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= esperado.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0 ? userId : null;
}
