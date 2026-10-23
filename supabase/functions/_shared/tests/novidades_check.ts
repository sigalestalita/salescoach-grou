// Verificação das novidades e do e-mail semanal (sem envio).
// deno run _shared/tests/novidades_check.ts
import { assunto, draftPrompt, envioRef, hslToHex, paraPapel, parseDrafts, renderEmail, unsubscribeToken, verifyUnsubscribe } from "../novidades.ts";

let fails = 0;
const ok = (cond: unknown, msg: string) => { console.log(`${cond ? "ok " : "FALHOU"} ${msg}`); if (!cond) fails++; };

const n = (id: string, audience = ["admin", "gestor", "vendedor"], extra = {}) => ({ id, title: `Título ${id}`, body: `Texto ${id}`, cta_label: "Abrir", cta_path: "/agendas", audience, ...extra });
const marca = { product_name: "Viral Coach", logo_url: "https://cdn.x/logo.png", primary_hsl: "214 74% 40%", support_email: "suporte@viral.com" };

ok(hslToHex("214 74% 40%") === "#1b5cb1", "cor da marca vira hexadecimal");
ok(hslToHex("lixo") === "#1d4ed8", "cor inválida usa a padrão");
ok(paraPapel([n("a"), n("b", ["admin", "gestor"])], "vendedor").map((x) => x.id).join() === "a", "vendedor não recebe novidade só de gestão");
ok(envioRef([n("b"), n("a")]) === envioRef([n("a"), n("b")]), "mesmo conjunto, mesmo envio (ordem não importa)");
ok(envioRef([n("a")]) !== envioRef([n("a"), n("b")]), "novidade nova, envio novo");
ok(assunto([n("a")], marca) === "Novidade no Viral Coach: Título a" && assunto([n("a"), n("b")], marca) === "2 novidades no Viral Coach esta semana", "assunto com a marca da empresa");

const e = renderEmail({ novidades: [n("a", undefined, { title: "<script>x</script>" })], marca, appUrl: "https://app.viral.com/", unsubscribeUrl: "https://f/unsub?t=1", firstName: "Ana", teste: true });
ok(e.subject.startsWith("[Teste] Novidade no Viral Coach"), "e-mail de teste marcado no assunto");
ok(!e.html.includes("<script>") && e.html.includes("&lt;script&gt;"), "texto da novidade escapado no HTML");
ok(e.html.includes('href="https://app.viral.com/agendas"') && e.html.includes("#1b5cb1") && e.html.includes("logo.png"), "botão, cor e logo da empresa");
ok(e.html.includes("https://f/unsub?t=1") && e.text.includes("https://f/unsub?t=1"), "link de descadastro no HTML e no texto");
ok(e.html.includes("Olá, Ana!") && e.html.includes("suporte@viral.com"), "nome da pessoa e suporte da empresa");

const p = draftPrompt([{ titulo: "Minha agenda", descricao: "Aba nova" }], "lembrar do Início");
ok(p.user.includes("Minha agenda") && p.user.includes("lembrar do Início") && p.system.includes("Não use o nome do produto"), "prompt leva as mudanças, as notas e as regras");
const d = parseDrafts('```json\n{"novidades":[{"titulo":"A","texto":"B","cta_label":"Ver","cta_path":"/agendas","publico":["gestor","dono"]},{"titulo":"","texto":"x"},{"titulo":"C","texto":"D","cta_path":"/inventado"}]}\n```');
ok(d.length === 2 && d[0].audience.join() === "gestor" && d[0].cta_path === "/agendas", "rascunho conferido: papel válido, tela válida");
ok(d[1].cta_path === null && d[1].cta_label === null && d[1].audience.length === 3, "tela inventada pela IA cai fora; sem público, vai para todos");
ok(parseDrafts("nada").length === 0, "resposta sem JSON: nenhum rascunho");

const uid = "0b1f6d1e-1111-4a2b-9c3d-123456789abc";
const t = await unsubscribeToken(uid, "segredo");
ok(await verifyUnsubscribe(t, "segredo") === uid, "token de descadastro confere");
ok(await verifyUnsubscribe(t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"), "segredo") === null, "token alterado é recusado");
ok(await verifyUnsubscribe(t, "outro") === null && await verifyUnsubscribe("lixo", "segredo") === null, "outro segredo ou lixo: recusado");

console.log(fails ? `\n${fails} falha(s)` : "\nTudo certo.");
if (fails) Deno.exit(1);
