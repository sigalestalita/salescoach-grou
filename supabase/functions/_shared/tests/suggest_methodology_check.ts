// deno run --allow-env --allow-read _shared/tests/suggest_methodology_check.ts
// (só as funções puras; o import do index não sobe o servidor porque
// Deno.serve é substituído abaixo)
// deno-lint-ignore no-explicit-any
(Deno as any).serve = () => {};
const { normalizeWeights, parseSuggestion } = await import("../../suggest-methodology/index.ts");
let fails = 0;
const ok = (c: unknown, m: string) => { console.log(`${c ? "ok " : "FALHOU"} ${m}`); if (!c) fails++; };

const w = normalizeWeights([{ label: "a", description: "", max_score: 30 }, { label: "b", description: "", max_score: 30 }, { label: "c", description: "", max_score: 30 }]);
ok(w.reduce((s, c) => s + c.max_score, 0) === 100 && w.map((c) => c.max_score).join() === "34,33,33", "pesos 30/30/30 viram 100 (34,33,33)");
const z = normalizeWeights([{ label: "a", description: "", max_score: 0 }, { label: "b", description: "", max_score: -5 }]);
ok(z.reduce((s, c) => s + c.max_score, 0) === 100, "pesos inválidos viram divisão igual");

const s = parseSuggestion("```json\n" + JSON.stringify({
  methodology_label: "Rocket Fit", persona: "Você é o head comercial.", rationale: "Porque sim.",
  criteria: [{ label: "Dor operacional", description: "x", max_score: 40 }, { label: "Decisor", description: "y", max_score: 40 }, { label: "", max_score: 10 }],
  temperature_levels: [{ label: "Frio", criteria: "a" }, { label: "Quente", criteria: "b" }],
  extra_instructions: "Regras", sources: ["Apresentação"],
}) + "\n```");
ok(s.methodology_label === "Rocket Fit" && s.criteria.length === 2, "lê o JSON mesmo dentro de ```json e descarta critério sem nome");
ok(s.criteria[0].key === "dor_operacional" && s.criteria.reduce((a, c) => a + c.max_score, 0) === 100, "gera a chave e normaliza pesos");
let threw = false; try { parseSuggestion('{"criteria":[{"label":"só um"}]}'); } catch { threw = true; }
ok(threw, "menos de 2 critérios é recusado");
console.log(fails ? `\n${fails} falha(s)` : "\nTudo certo.");
if (fails) Deno.exit(1);
