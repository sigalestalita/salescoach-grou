import { describe, expect, it } from "vitest";
import {
  buildAnalysisPrompt, DEFAULT_TEMPLATE, docMatchesArea, fetchKnowledgeContext, knowledgeAreaFor, normalizePlaybook,
  type AnalysisTemplate,
} from "../../supabase/functions/_shared/analysis-template";
import { HEALTH_LEVELS, PLAYBOOK_PRESETS } from "@/lib/playbook";

// Base de conhecimento por área: cada documento é de Vendas, de Atendimento ou
// de ambos. A análise usa só a área da reunião, e o playbook com expansão
// comercial (CS que faz upsell e cross-sell) usa as duas.

const playbook = (id: string): AnalysisTemplate => {
  const p = PLAYBOOK_PRESETS.find((x) => x.id === id)!;
  return {
    ...DEFAULT_TEMPLATE, id: `tpl-${id}`, methodology_label: p.label, qualification_criteria: p.steps,
    temperature_levels: HEALTH_LEVELS, mode: "playbook", playbook: normalizePlaybook(p.body),
  };
};

describe("área da base de conhecimento", () => {
  it("venda usa Vendas; atendimento usa Atendimento; expansão usa tudo", () => {
    expect(knowledgeAreaFor(DEFAULT_TEMPLATE)).toBe("vendas");
    expect(knowledgeAreaFor(null)).toBe("vendas");
    expect(knowledgeAreaFor(playbook("onboarding"))).toBe("atendimento");
    expect(knowledgeAreaFor(playbook("expansao"))).toBeNull();
  });

  it("documento entra se for da área, de ambos ou sem área (antes da migração)", () => {
    expect(docMatchesArea("vendas", "vendas")).toBe(true);
    expect(docMatchesArea("ambos", "atendimento")).toBe(true);
    expect(docMatchesArea(undefined, "atendimento")).toBe(true);
    expect(docMatchesArea("vendas", "atendimento")).toBe(false);
    expect(docMatchesArea("atendimento", "vendas")).toBe(false);
    expect(docMatchesArea("atendimento", null)).toBe(true);
  });

  it("manda a área para a prévia do banco", async () => {
    const calls: unknown[] = [];
    const admin = {
      rpc: async (_fn: string, args: unknown) => { calls.push(args); return { data: [{ title: "Preços", category: null, preview: "Plano Pro R$ 99" }], error: null }; },
      from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }),
    };
    const ctx = await fetchKnowledgeContext(admin as unknown as Parameters<typeof fetchKnowledgeContext>[0], "org-1", "atendimento");
    expect(calls).toEqual([{ _org_id: "org-1", _chars: 2000, _area: "atendimento" }]);
    expect(ctx).toContain("Plano Pro R$ 99");
  });
});

describe("playbook com expansão comercial", () => {
  it("guarda a opção ao normalizar", () => {
    expect(normalizePlaybook({ expansao_comercial: true }).expansao_comercial).toBe(true);
    expect(normalizePlaybook({ expansao_comercial: "sim" }).expansao_comercial).toBe(false);
  });

  it("o prompt avalia a oferta em vez de dizer que não é venda", () => {
    const input = (t: AnalysisTemplate) => buildAnalysisPrompt({
      template: t, transcript: "Atendente: Oi. Cliente: Oi.", meetingTitle: "Conversa", meetingTypeLabel: "", meetingTypeContext: "",
      leadName: "Ana", leadCompany: "Acme", knowledgeContext: "", meetingDate: "2026-10-22",
    });
    expect(input(playbook("expansao"))).toContain("upsell e cross-sell");
    expect(input(playbook("expansao"))).not.toContain("Não é uma reunião de venda");
    expect(input(playbook("onboarding"))).toContain("Não é uma reunião de venda");
  });
});
