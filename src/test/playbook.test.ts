import { describe, expect, it } from "vitest";
import {
  buildAnalysisPrompt, DEFAULT_TEMPLATE, methodologySnapshot, normalizePlaybook, type AnalysisTemplate,
} from "../../supabase/functions/_shared/analysis-template";
import { parsePlaybookSuggestion, pesos100 } from "../../supabase/functions/_shared/playbook-suggestion";
import { HEALTH_LEVELS, PLAYBOOK_PRESETS } from "@/lib/playbook";
import { isAtRisk, meetingArea } from "@/lib/methodology";
import { FALLBACK_CONFIG } from "@/hooks/useOrgConfig";

// Coach de atendimento: a mesma tabela de templates, com mode = 'playbook'.
// Estes testes garantem que o prompt muda de régua (playbook, não qualificação
// de venda), que a análise guarda o que a tela precisa e que os modelos
// prontos são consistentes.

const preset = PLAYBOOK_PRESETS.find((p) => p.id === "onboarding")!;
const playbookTemplate: AnalysisTemplate = {
  ...DEFAULT_TEMPLATE,
  id: "tpl-1",
  name: "Playbook · Onboarding",
  persona: "Você é um especialista em Customer Success B2B.",
  methodology_key: "PLAYBOOK_ONBOARDING",
  methodology_label: "Onboarding",
  qualification_criteria: preset.steps,
  temperature_levels: HEALTH_LEVELS,
  frameworks: { meddic: false, spin: false, talk_ratio: true },
  mode: "playbook",
  playbook: normalizePlaybook(preset.body),
};

const input = (template: AnalysisTemplate) => ({
  template, transcript: "Atendente: Bom dia! Cliente: Bom dia.", meetingTitle: "Kickoff", meetingTypeLabel: "Onboarding",
  meetingTypeContext: "", leadName: "Ana", leadCompany: "Acme", knowledgeContext: "", meetingDate: "2026-10-22",
});

describe("análise por playbook", () => {
  it("monta o prompt pelo playbook, sem metodologia de vendas", () => {
    const prompt = buildAnalysisPrompt(input(playbookTemplate));
    expect(prompt).toContain('PLAYBOOK "Onboarding"');
    expect(prompt).toContain("objetivos (peso 20, obrigatória)");
    expect(prompt).toContain('"playbook": {');
    expect(prompt).toContain("critico|em_risco|atencao|saudavel|promotor");
    expect(prompt).not.toContain("meddic_score");
    expect(prompt).not.toContain("spin_score");
    expect(prompt).not.toContain("CLASSIFICAÇÃO DE TEMPERATURA");
  });

  it("a metodologia de vendas continua com o prompt de sempre", () => {
    const prompt = buildAnalysisPrompt(input(DEFAULT_TEMPLATE));
    expect(prompt).toContain("CLASSIFICAÇÃO DE TEMPERATURA");
    expect(prompt).toContain("meddic_score");
    expect(prompt).not.toContain('"playbook": {');
  });

  it("o resumo guardado na análise traz o modo, as etapas obrigatórias e as faixas de saúde", () => {
    const snap = methodologySnapshot(playbookTemplate);
    expect(snap.mode).toBe("playbook");
    expect(snap.frameworks.meddic).toBe(false);
    expect(snap.frameworks.spin).toBe(false);
    expect(snap.criteria.find((c) => c.key === "objetivos")).toMatchObject({ required: true, max_score: 20 });
    expect(snap.levels.map((l) => l.key)).toEqual(HEALTH_LEVELS.map((l) => l.key));
  });

  it("descarta sinais e campos tortos do JSON guardado", () => {
    const p = normalizePlaybook({ sinais: [{ key: "x", label: "X", tipo: "qualquer" }, { label: "sem chave" }], campos: "não é lista" });
    expect(p.sinais).toEqual([{ key: "x", label: "X", description: "", tipo: "atencao" }]);
    expect(p.campos).toEqual([]);
  });
});

describe("modelos de playbook", () => {
  it.each(PLAYBOOK_PRESETS.map((p) => [p.label, p] as const))("%s: pesos somam 100 e chaves são únicas", (_, p) => {
    expect(p.steps.reduce((s, e) => s + (e.max_score ?? 0), 0)).toBe(100);
    expect(new Set(p.steps.map((e) => e.key)).size).toBe(p.steps.length);
    expect(p.steps.some((e) => e.required)).toBe(true);
  });
});

describe("sugestão de playbook pela IA", () => {
  it("lê o JSON, gera chaves únicas e normaliza os pesos", () => {
    const s = parsePlaybookSuggestion("```json\n" + JSON.stringify({
      nome: "Check-in mensal",
      etapas: [{ label: "Retomar combinados", max_score: 30 }, { label: "Retomar combinados", max_score: 30, required: true }, { label: "", max_score: 10 }, { label: "Plano", max_score: 30 }],
      sinais: [{ label: "Fala em cancelar", tipo: "risco" }, { label: "Elogio", tipo: "outro" }],
      temperature_levels: [{ label: "Crítico", criteria: "a" }],
    }) + "\n```");
    expect(s.nome).toBe("Check-in mensal");
    expect(s.etapas.map((e) => e.key)).toEqual(["retomar_combinados", "retomar_combinados_2", "plano"]);
    expect(s.etapas.reduce((a, e) => a + e.max_score, 0)).toBe(100);
    expect(s.etapas[1].required).toBe(true);
    expect(s.sinais.map((x) => x.tipo)).toEqual(["risco", "atencao"]);
  });

  it("recusa proposta com menos de duas etapas", () => {
    expect(() => parsePlaybookSuggestion('{"etapas":[{"label":"só uma"}]}')).toThrow();
  });

  it("pesos inválidos viram divisão igual", () => {
    expect(pesos100([0, -1, Number.NaN, 5]).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("painel por área", () => {
  const typeArea = new Map([["onboarding", "atendimento" as const], ["demo", "vendas" as const]]);
  it("a área vem da análise; sem análise, do tipo de reunião", () => {
    const playbookAnalysis = { methodology: { label: "Onboarding", mode: "playbook", criteria: [{ key: "a", label: "A" }] } };
    const salesAnalysis = { methodology: { label: "BANT", criteria: [{ key: "budget", label: "Budget" }] } };
    expect(meetingArea(playbookAnalysis, "demo", typeArea, FALLBACK_CONFIG)).toBe("atendimento");
    expect(meetingArea(salesAnalysis, "onboarding", typeArea, FALLBACK_CONFIG)).toBe("vendas");
    expect(meetingArea(null, "onboarding", typeArea, FALLBACK_CONFIG)).toBe("atendimento");
    expect(meetingArea(null, null, typeArea, FALLBACK_CONFIG)).toBe("vendas");
    // Análise antiga, sem o resumo da metodologia: conta como vendas.
    expect(meetingArea({ methodology: null }, "onboarding", typeArea, FALLBACK_CONFIG)).toBe("vendas");
  });
  it("cliente em risco = metade pior das faixas de saúde", () => {
    expect(HEALTH_LEVELS.filter((l) => isAtRisk(HEALTH_LEVELS, l.key)).map((l) => l.key)).toEqual(["critico", "em_risco"]);
    expect(isAtRisk(HEALTH_LEVELS, "inexistente")).toBe(false);
  });
});
