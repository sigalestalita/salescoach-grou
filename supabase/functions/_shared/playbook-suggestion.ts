// Leitura da proposta de playbook devolvida pela IA (função suggest-playbook).
// Fica separada da função para ser testada sem subir o servidor.

const clean = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const slug = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

/** Pesos inteiros que somam 100, proporcionais ao que a IA sugeriu. */
export function pesos100(valores: number[]): number[] {
  const raw = valores.map((v) => (Number.isFinite(v) && v > 0 ? v : 1));
  const sum = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map((v) => (v / sum) * 100);
  const floors = scaled.map(Math.floor);
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const order = scaled.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (rest-- <= 0) break; floors[i]++; }
  return floors.map((v) => Math.max(1, v));
}

/** Chaves únicas: "etapa", "etapa_2"... */
function unicas<T extends { label: string }>(itens: T[]): (T & { key: string })[] {
  const vistas = new Set<string>();
  return itens.map((it) => {
    const base = slug(it.label) || "item";
    let key = base;
    for (let n = 2; vistas.has(key); n++) key = `${base.slice(0, 36)}_${n}`;
    vistas.add(key);
    return { ...it, key };
  });
}

/** Valida e limpa a resposta da IA. Lança se não der para aproveitar. */
export function parsePlaybookSuggestion(raw: string) {
  const s = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  type Tipo = "risco" | "oportunidade" | "atencao";
  const etapas: { label: string; description: string; max_score: number; required: boolean }[] = (Array.isArray(s.etapas) ? s.etapas : [])
    .map((e: Record<string, unknown>) => ({
      label: clean(e.label, 80), description: clean(e.description, 300),
      max_score: Number(e.max_score), required: e.required === true,
    }))
    .filter((e) => e.label)
    .slice(0, 12);
  if (etapas.length < 2) throw new Error("A IA não propôs etapas suficientes.");
  const w = pesos100(etapas.map((e) => e.max_score));
  const sinais: { label: string; description: string; tipo: Tipo }[] = (Array.isArray(s.sinais) ? s.sinais : [])
    .map((x: Record<string, unknown>) => ({
      label: clean(x.label, 80), description: clean(x.description, 300),
      tipo: (["risco", "oportunidade", "atencao"].includes(x.tipo as string) ? x.tipo : "atencao") as Tipo,
    }))
    .filter((x) => x.label)
    .slice(0, 15);
  const campos: { label: string; description: string }[] = (Array.isArray(s.campos) ? s.campos : [])
    .map((x: Record<string, unknown>) => ({ label: clean(x.label, 80), description: clean(x.description, 300) }))
    .filter((x) => x.label)
    .slice(0, 15);
  const niveis: { label: string; criteria: string }[] = (Array.isArray(s.temperature_levels) ? s.temperature_levels : [])
    .map((l: Record<string, unknown>) => ({ label: clean(l.label, 40), criteria: clean(l.criteria, 300) }))
    .filter((l) => l.label)
    .slice(0, 7);
  const lista = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => clean(x, 300)).filter(Boolean).slice(0, 15);
  return {
    nome: clean(s.nome, 60) || "Playbook de atendimento",
    persona: clean(s.persona, 600),
    rationale: clean(s.rationale, 1200),
    objetivo: clean(s.objetivo, 1200),
    etapas: unicas(etapas.map((e, i) => ({ ...e, max_score: w[i] }))),
    boas_praticas: lista(s.boas_praticas),
    evitar: lista(s.evitar),
    sinais: unicas(sinais),
    campos: unicas(campos),
    temperature_levels: unicas(niveis),
    extra_instructions: clean(s.extra_instructions, 2000),
  };
}
