import { describe, expect, it } from "vitest";
import { buildAnalysisPrompt, DEFAULT_TEMPLATE, meetingTypeRules } from "../../supabase/functions/_shared/analysis-template";

// As instruções do tipo de reunião passam por cima da base de conhecimento:
// um serviço fora do escopo do tipo não pode virar cross-sell, oportunidade
// perdida nem "o que faltou" na análise.

const base = {
  template: DEFAULT_TEMPLATE, transcript: "Vendedor: Olá. Lead: Olá.", meetingTitle: "Reunião", meetingTypeLabel: "Parceria",
  leadName: "Ana", leadCompany: "Acme", meetingDate: "2026-11-17",
  knowledgeContext: "### Produto X\nServiço de recrutamento.",
  meetingTypeContext: "Não ofereça nem avalie o Produto X neste tipo de reunião.",
};

describe("regras do tipo de reunião", () => {
  it("vêm depois da base de conhecimento e com prioridade sobre ela", () => {
    const prompt = buildAnalysisPrompt(base);
    const kb = prompt.indexOf("INSTRUÇÕES ADICIONAIS SOBRE A BASE DE CONHECIMENTO");
    const regras = prompt.indexOf("REGRAS DESTE TIPO DE REUNIÃO");
    expect(kb).toBeGreaterThan(-1);
    expect(regras).toBeGreaterThan(kb);
    expect(prompt).toContain("Não ofereça nem avalie o Produto X");
    expect(prompt).toContain("não o conte como oportunidade perdida");
  });

  it("sem instruções no tipo, não acrescenta nada", () => {
    expect(meetingTypeRules("  ")).toBe("");
    expect(buildAnalysisPrompt({ ...base, meetingTypeContext: "" })).not.toContain("REGRAS DESTE TIPO DE REUNIÃO");
  });
});
