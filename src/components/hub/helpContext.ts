import { ARTICLES, FAQ, HelpArticle, JOURNEY, TOURS } from "./content";

/**
 * Trecho da central de ajuda que vai junto com a pergunta ao assistente.
 *
 * O assistente busca dados reais das reuniões por ferramentas, mas não
 * conhecia o produto: a "como configuro o atendimento de CS?" respondia que
 * não tinha acesso. A ajuda já existe aqui (artigos, primeiros passos, tours
 * e FAQ); este módulo escolhe as partes que têm a ver com a pergunta e manda
 * como guia. Uma fonte só: o que muda na ajuda muda no assistente.
 */

const MAX_CHARS = 9000;
const STOP = new Set(("a o os as de da do das dos e é em no na nos nas um uma uns umas para pra por com sem que se " +
  "como onde qual quais quando quem eu meu minha meus minhas seu sua isso essa esse esta este tem ter faço fazer " +
  "consigo posso pode ao à às mais menos já não sim também tb vc você vocês").split(" "));

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palavras que contam para a busca (sem acento, sem as muito comuns). */
export function termos(texto: string): Set<string> {
  return new Set(norm(texto).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)));
}

/** Variações comuns de como as pessoas chamam as coisas no produto. */
const SINONIMOS: Record<string, string[]> = {
  cs: ["atendimento", "playbook", "playbooks", "suporte", "onboarding"],
  "customer": ["atendimento", "playbook"],
  sucesso: ["atendimento", "playbook"],
  pos: ["atendimento"],
  playbook: ["atendimento"],
  upsell: ["expansao", "playbook", "vende"],
  "cross": ["expansao", "playbook", "vende"],
  expansao: ["playbook", "vende"],
  base: ["conhecimento"],
  material: ["conhecimento", "area"],
  materiais: ["conhecimento", "area"],
  campo: ["crm"],
  campos: ["crm"],
  hubspot: ["crm"],
  pipedrive: ["crm"],
  rd: ["crm"],
  kommo: ["crm"],
  metodologia: ["configuracoes", "criterios"],
  bant: ["metodologia", "configuracoes"],
  gravar: ["extensao", "gravacao"],
  gravacao: ["extensao"],
  convidar: ["equipe", "usuarios"],
  dashboard: ["visao", "geral"],
  painel: ["visao", "geral"],
};

function expandir(t: Set<string>): Set<string> {
  const out = new Set(t);
  for (const w of t) for (const s of SINONIMOS[w] ?? []) out.add(s);
  return out;
}

const texto = (a: HelpArticle) => [a.title, a.summary, ...a.sections.flatMap((s) => [s.title, ...s.items])].join(" ");

function pontos(q: Set<string>, alvo: string, pesoTitulo = "") {
  const t = termos(alvo);
  const tt = termos(pesoTitulo);
  let n = 0;
  for (const w of q) {
    if (tt.has(w)) n += 3;
    else if (t.has(w)) n += 1;
  }
  return n;
}

function artigoMd(a: HelpArticle): string {
  const tour = a.tour && TOURS[a.tour] ? `\n(Tour na Ajuda: "${TOURS[a.tour].title}")` : "";
  return `### ${a.title}${a.route ? ` — tela ${a.route}` : ""}${tour}\n` +
    a.sections.map((s) => `${s.title}:\n${s.items.map((i) => `- ${i}`).join("\n")}`).join("\n");
}

/**
 * Guia para a pergunta: os artigos e perguntas frequentes mais ligados a ela,
 * mais a lista de todos os artigos (para o assistente indicar onde ler mais).
 */
export function helpContextFor(pergunta: string, role: string | null): string {
  const q = expandir(termos(pergunta));
  const visiveis = ARTICLES.filter((a) => !a.roles || (role && a.roles.includes(role)));
  const artigos = visiveis
    .map((a) => ({ a, n: pontos(q, texto(a), a.title) }))
    .filter((x) => x.n > 0)
    .sort((x, y) => y.n - x.n)
    .slice(0, 3)
    .map((x) => x.a);
  const faq = FAQ
    .map((f) => ({ f, n: pontos(q, `${f.q} ${f.a}`, f.q) }))
    .filter((x) => x.n > 0)
    .sort((x, y) => y.n - x.n)
    .slice(0, 4)
    .map((x) => x.f);
  const passos = JOURNEY.filter((j) => !role || j.roles.includes(role))
    .map((j) => ({ j, n: pontos(q, `${j.title} ${j.description}`, j.title) }))
    .filter((x) => x.n > 1)
    .slice(0, 2)
    .map((x) => x.j);

  const partes = [
    `Papel de quem pergunta: ${role ?? "desconhecido"}.`,
    `Artigos da Ajuda: ${visiveis.map((a) => a.title).join("; ")}.`,
    ...artigos.map(artigoMd),
    ...passos.map((j) => `### Primeiros passos: ${j.title}\n${j.description}`),
    faq.length ? `### Perguntas frequentes\n${faq.map((f) => `- ${f.q} ${f.a}`).join("\n")}` : "",
  ].filter(Boolean);
  return partes.join("\n\n").slice(0, MAX_CHARS);
}
