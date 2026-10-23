// Verificação da dica do dia (sem IA).
/* eslint-disable @typescript-eslint/no-explicit-any */
// deno run _shared/tests/daily_tip_check.ts
import { buildTipPrompt, criterionAverages, parseTip, recentSuggestions, tipDay } from "../daily-tip.ts";

let fails = 0;
const ok = (cond: unknown, msg: string) => { console.log(`${cond ? "ok " : "FALHOU"} ${msg}`); if (!cond) fails++; };

const bant = { key: "budget", label: "Orçamento", max_score: 25 };
const need = { key: "need", label: "Necessidade", max_score: 25 };
const analyses: any[] = [
  { overall_score: 60, bant_score: { budget: 5, need: { score: 20 } }, methodology: { label: "BANT", criteria: [bant, need] }, sales_coach: { suggestions: ["Pergunte o orçamento cedo"] } },
  { overall_score: 70, bant_score: { budget: 10, need: 25 }, methodology: null, sales_coach: { suggestions: ["Confirme o decisor", 3] } },
  { overall_score: 90, bant_score: { aderencia: 90 }, methodology: { mode: "playbook", criteria: [] }, sales_coach: null },
];

const avg = criterionAverages(analyses, [bant, need]);
ok(avg[0].label === "Orçamento" && avg[0].pct === 30 && avg[0].n === 2, "critério mais fraco primeiro, na escala de 0 a 100");
ok(avg[1].label === "Necessidade" && avg[1].pct === 90, "nota em objeto { score } também conta");
ok(avg.every((c) => c.label !== "aderencia"), "conversa de playbook fica fora dos critérios de venda");
ok(JSON.stringify(recentSuggestions(analyses)) === JSON.stringify(["Pergunte o orçamento cedo", "Confirme o decisor"]), "sugestões recentes, só texto");

const pr = buildTipPrompt({ orgName: "Viral", persona: "Você é coach.", methodologyLabel: "BANT", tipo: "vendedor", firstName: "Estefany",
  analyses, criteria: avg, suggestions: ["x"], knowledge: "[produto] Plano Pro: CRM", weekday: "sexta-feira" });
ok(pr.user.includes("Orçamento: 30% (2 reuniões)") && pr.user.includes("Score médio: 73"), "prompt leva o ponto fraco e a média");
ok(pr.system.includes("Plano Pro") && pr.system.includes("Não invente oferta"), "prompt leva a base de conhecimento e proíbe inventar oferta");
const gestao = buildTipPrompt({ orgName: "Viral", persona: "", methodologyLabel: "BANT", tipo: "gestao", firstName: null, analyses: [], criteria: [], suggestions: [], knowledge: "", weekday: "segunda-feira" });
ok(gestao.system.includes("GESTÃO") && gestao.user.includes("sem reuniões analisadas"), "gestor sem reuniões recebe dica de gestão");

const t = parseTip('Aqui está:\n```json\n{"titulo":"Fale de orçamento cedo","dica":"Pergunte o investimento nos 10 primeiros minutos.","porque":"Orçamento ficou em 30%.","frase_pronta":"null","foco":"Orçamento"}\n```', "vendedor");
ok(t?.titulo === "Fale de orçamento cedo" && t?.frase_pronta === null && t?.foco === "Orçamento", "resposta da IA conferida, \"null\" em texto vira null");
ok(parseTip('{"titulo":"x"}', "vendedor") === null && parseTip("sem json", "vendedor") === null, "sem dica, resposta descartada");

const agora = new Date("2026-10-23T15:00:00Z");
ok(tipDay("2026-10-23", agora) === "2026-10-23", "dia do navegador aceito");
ok(tipDay("2026-10-30", agora) === "2026-10-23" && tipDay("lixo", agora) === "2026-10-23", "dia implausível vira o de Brasília");
ok(tipDay(undefined, new Date("2026-10-24T01:00:00Z")) === "2026-10-23", "sem dia do navegador: data de Brasília (UTC-3)");

console.log(fails ? `\n${fails} falha(s)` : "\nTudo certo.");
if (fails) Deno.exit(1);
