// Verificação do e-mail de boas-vindas da demonstração.
// deno run _shared/tests/demo_email_check.ts
import { renderDemoWelcome } from "../demo-email.ts";

let fails = 0;
const ok = (cond: unknown, msg: string) => { console.log(`${cond ? "ok " : "FALHOU"} ${msg}`); if (!cond) fails++; };

const base = {
  orgName: "Viral <Marketing>", adminName: "Ana Paula Souza",
  marca: { product_name: "Sales Coach", logo_url: null, primary_hsl: "214 74% 40%", support_email: null },
  inviteUrl: "https://salescoach.grougp.com.br/convite/tok123", inviteExpiresAt: "2026-10-30T15:00:00Z",
  demoEndsAt: "2026-11-06T02:59:59Z", appUrl: "https://salescoach.grougp.com.br", comercialEmail: "comercial@grougp.com.br",
};
const e = renderDemoWelcome(base);
ok(e.subject === "Sua demonstração do Sales Coach está liberada", "assunto com o nome do produto");
ok(e.html.includes("Olá, Ana!") && e.html.includes("Viral &lt;Marketing&gt;"), "primeiro nome e nome da empresa escapado");
ok(e.html.includes('href="https://salescoach.grougp.com.br/convite/tok123"') && e.text.includes("/convite/tok123"), "link do convite no botão e no texto");
ok(e.html.includes("até 5 de novembro"), "prazo da demo no fuso de Brasília");
ok(e.html.includes("30 de outubro"), "validade do convite");
ok(e.html.includes("mailto:comercial@grougp.com.br?subject=") && e.text.includes("comercial@grougp.com.br"), "contato do comercial");
ok(!e.html.toLowerCase().includes("senha provisória"), "nunca leva senha");
const sem = renderDemoWelcome({ ...base, demoEndsAt: null, comercialEmail: null, adminName: null });
ok(e.html.includes('href="https://salescoach.grougp.com.br/extensao"'), "link para a página da extensão");
ok(!sem.html.includes("em demonstração até") && !sem.html.includes("mailto:") && sem.html.includes("Olá!"), "sem prazo, sem comercial e sem nome: some do texto");

console.log(fails ? `\n${fails} falha(s)` : "\nTudo certo.");
if (fails) Deno.exit(1);
