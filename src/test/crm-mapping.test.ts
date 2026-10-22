import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  buildFieldUpdate,
  buildNote,
  buildTask,
  convertValue,
  healthOptions,
  sourceCatalog,
  sourceValues,
  type SourceContext,
} from "../../supabase/functions/_shared/crm/mapping";

// O que vai para o CRM sai daqui. Se este módulo errar, o vendedor vê no CRM
// um número errado ou perde o que tinha digitado — por isso os testes cobrem a
// conversão de tipo e a regra "só se vazio".

const criteria = [
  { key: "budget", label: "Budget", max_score: 25 },
  { key: "authority", label: "Authority", max_score: 25 },
];

const ctx: SourceContext = {
  analysis: {
    overall_score: 91,
    temperature: "muito_quente",
    bant_score: {
      budget: { score: 22, reason: "Verba aprovada." },
      authority: { score: 20, reason: "Sócio presente." },
    },
    talk_ratio: { seller: 46, lead: 54 },
    sales_coach: {
      next_steps: ["Enviar proposta com ROI", "Agendar com o financeiro"],
      next_step_date: "2026-10-17",
    },
    insights: { positives: ["Conduziu pelas dores"], improvements: ["Não quantificou a dor"] },
    raw_analysis: {
      overall_score_reason: "Demo guiada pelas dores.",
      temperature_reason: "4 de 4 critérios.",
      meeting_summary: { identified_pains: ["Gestor não acompanha reuniões", "CRM de memória"] },
    },
  },
  meeting: { title: "Diagnóstico · Aliança", meeting_date: "2026-10-13T14:00:00Z" },
  criteria,
  temperatureLevels: [
    { key: "quente", label: "Quente" },
    { key: "muito_quente", label: "Muito quente" },
  ],
  analysisUrl: "https://app.exemplo.com/agendas/1",
};

describe("catálogo e valores", () => {
  it("inclui um item por critério da metodologia", () => {
    const keys = sourceCatalog(criteria).map((s) => s.key);
    expect(keys).toContain("criterio:budget");
    expect(keys).toContain("criterio:authority");
    expect(keys).toContain("nota");
  });

  it("extrai os valores da análise", () => {
    const v = sourceValues(ctx);
    expect(v.nota).toBe(91);
    expect(v.temperatura).toBe("Muito quente");
    expect(v["criterio:budget"]).toBe(22);
    expect(v.dores).toBe("Gestor não acompanha reuniões; CRM de memória");
    expect(v.proximo_passo).toBe("Enviar proposta com ROI");
    expect(v.data_proximo_passo).toBe("2026-10-17");
    expect(v.data_reuniao).toBe("2026-10-13");
    expect(v.fala_vendedor).toBe(46);
  });

  it("devolve null quando o dado não existe", () => {
    const v = sourceValues({ ...ctx, analysis: { overall_score: null } });
    expect(v.nota).toBeNull();
    expect(v.temperatura).toBeNull();
    expect(v["criterio:budget"]).toBeNull();
    expect(v.data_proximo_passo).toBeNull();
  });
});

describe("conversão para o campo do CRM", () => {
  it("número, data e link", () => {
    expect(convertValue("91", "number")).toEqual({ ok: true, value: 91 });
    expect(convertValue("abc", "number").ok).toBe(false);
    expect(convertValue("2026-10-17T10:00:00Z", "date")).toEqual({ ok: true, value: "2026-10-17" });
    expect(convertValue("sem-http", "hyperlink").ok).toBe(false);
  });

  it("lista de opções ignora maiúsculas e acentos, e recusa o que não existe", () => {
    expect(convertValue("muito quente", "option", ["Frio", "Morno", "Quente", "Muito Quente"]))
      .toEqual({ ok: true, value: "Muito Quente" });
    expect(convertValue("Gelado", "option", ["Frio", "Quente"]).ok).toBe(false);
  });
});

describe("campos do negócio", () => {
  const mappings = [
    { source_key: "nota", target_field: "nota_sc", target_type: "number", mode: "sempre" as const },
    { source_key: "temperatura", target_field: "temp", target_type: "option", target_options: ["Frio", "Quente", "Muito quente"], mode: "sempre" as const },
    { source_key: "proximo_passo", target_field: "prox", target_type: "text", mode: "se_vazio" as const },
    { source_key: "criterio:authority", target_field: "auth", target_type: "number", mode: "sempre" as const },
  ];

  it("grava o que tem valor e respeita o \"só se vazio\"", () => {
    const r = buildFieldUpdate(mappings, sourceValues(ctx), { prox: "Ligar segunda", nota_sc: 50 });
    expect(r.fields).toEqual({ nota_sc: 91, temp: "Muito quente", auth: 20 });
    expect(r.skipped.map((s) => s.reason)).toEqual(["já preenchido no CRM"]);
  });

  it("preenche o campo vazio", () => {
    const r = buildFieldUpdate(mappings, sourceValues(ctx), { prox: "  " });
    expect(r.fields.prox).toBe("Enviar proposta com ROI");
  });

  it("não grava valor que o campo não aceita", () => {
    const r = buildFieldUpdate(
      [{ source_key: "temperatura", target_field: "temp", target_type: "option", target_options: ["A", "B"], mode: "sempre" }],
      sourceValues(ctx),
      {},
    );
    expect(r.fields).toEqual({});
    expect(r.skipped[0].reason).toContain("não é uma das opções");
  });
});

describe("anotação e tarefa", () => {
  it("anotação traz nota, critérios, passos e link", () => {
    const note = buildNote({ ...ctx, methodologyLabel: "BANT" });
    expect(note).toContain("Nota 91/100");
    expect(note).toContain("Temperatura: Muito quente");
    expect(note).toContain("- Budget: 22/25 — Verba aprovada.");
    expect(note).toContain("- Agendar com o financeiro");
    expect(note).toContain("https://app.exemplo.com/agendas/1");
  });

  it("tarefa usa a data combinada", () => {
    const t = buildTask(ctx, "2026-10-13");
    expect(t?.dueDate).toBe("2026-10-17");
    expect(t?.name).toBe("Enviar proposta com ROI");
  });

  it("sem data combinada, vence em dois dias úteis", () => {
    const semData = { ...ctx, analysis: { ...ctx.analysis, sales_coach: { next_steps: ["Ligar"] } } };
    // 16/10/2026 é sexta: dois dias úteis depois cai na terça, 20/10.
    const t = buildTask({ ...semData, meeting: { title: "x", meeting_date: "2026-10-16" } }, "2026-10-16");
    expect(t?.dueDate).toBe("2026-10-20");
  });

  it("sem próximo passo, não há tarefa", () => {
    expect(buildTask({ ...ctx, analysis: { overall_score: 50 } }, "2026-10-13")).toBeNull();
  });

  it("dias úteis pulam o fim de semana", () => {
    expect(addBusinessDays("2026-10-16", 1)).toBe("2026-10-19");
  });
});

describe("conversas de atendimento (playbook)", () => {
  const playbooks = [
    { label: "Onboarding", levels: [{ key: "em_risco", label: "Em risco" }, { key: "saudavel", label: "Saudável" }],
      campos: [{ key: "data_go_live", label: "Data de go-live" }, { key: "responsavel_cliente", label: "Responsável no cliente" }] },
    { label: "Check-in", levels: [{ key: "saudavel", label: "Saudável" }, { key: "promotor", label: "Promotor" }],
      campos: [{ key: "responsavel_cliente", label: "Responsável no cliente" }] },
  ];
  const etapas = [{ key: "objetivos", label: "Objetivos", max_score: 50 }, { key: "plano", label: "Plano", max_score: 50 }];
  const atd: SourceContext = {
    analysis: {
      overall_score: 72,
      temperature: "em_risco",
      bant_score: { objetivos: { score: 50, reason: "Metas claras." }, plano: { score: 20, reason: "Sem datas." } },
      talk_ratio: { seller: 40, lead: 60 },
      sales_coach: { next_steps: ["Enviar plano com datas"], next_step_date: "2026-10-30" },
      raw_analysis: { overall_score_reason: "Faltou fechar o plano.", meeting_summary: { identified_pains: ["Atraso na integração"] } },
      playbook_result: {
        etapas: [{ key: "objetivos", status: "cumprida" }, { key: "plano", status: "parcial" }],
        sinais: [
          { key: "cancelamento", label: "Fala em cancelar", tipo: "risco", detectado: true, evidencia: "vamos rever o contrato" },
          { key: "expansao", label: "Expansão", tipo: "oportunidade", detectado: false },
        ],
        campos: { data_go_live: "2026-11-15", responsavel_cliente: "Carla (RH)", outro: null },
        compromissos: [{ quem: "time", o_que: "Enviar plano", prazo: "2026-10-30" }],
        pendencias: ["Acesso ao sistema"],
        sentimento_cliente: "Saiu preocupada com prazos.",
      },
    },
    meeting: { title: "Kickoff · Acme", meeting_date: "2026-10-22T14:00:00Z" },
    criteria: etapas,
    temperatureLevels: playbooks[0].levels,
    analysisUrl: "https://app.exemplo.com/agendas/2",
    mode: "playbook",
    playbookLabel: "Onboarding",
  };

  it("o catálogo ganha os dados de atendimento e uma informação por chave", () => {
    const cat = sourceCatalog(criteria, playbooks);
    const keys = cat.map((s) => s.key);
    expect(keys).toContain("atd:saude");
    expect(keys.filter((k) => k === "atd:campo:responsavel_cliente")).toHaveLength(1);
    expect(cat.find((s) => s.key === "atd:aderencia")?.area).toBe("atendimento");
    expect(cat.find((s) => s.key === "nota")?.area).toBe("vendas");
    expect(cat.find((s) => s.key === "proximo_passo")?.area).toBe("ambos");
    expect(sourceCatalog(criteria).some((s) => s.key.startsWith("atd:"))).toBe(false);
    expect(healthOptions(playbooks)).toEqual(["Em risco", "Saudável", "Promotor"]);
  });

  it("conversa de atendimento manda os dados de atendimento, não os de venda", () => {
    const v = sourceValues(atd);
    expect(v.nota).toBeNull();
    expect(v.temperatura).toBeNull();
    expect(v.dores).toBeNull();
    expect(v["criterio:objetivos"]).toBeUndefined();
    expect(v["atd:aderencia"]).toBe(72);
    expect(v["atd:saude"]).toBe("Em risco");
    expect(v["atd:playbook"]).toBe("Onboarding");
    expect(v["atd:sinais_risco"]).toBe("Fala em cancelar: vamos rever o contrato");
    expect(v["atd:sinais_oportunidade"]).toBeNull();
    expect(v["atd:etapas_pendentes"]).toBe("Plano (parcial)");
    expect(v["atd:compromissos"]).toBe("Enviar plano (time, 30/10/2026)");
    expect(v["atd:campo:data_go_live"]).toBe("2026-11-15");
    expect(v["atd:campo:outro"]).toBeNull();
    // Os comuns saem das duas.
    expect(v.proximo_passo).toBe("Enviar plano com datas");
    expect(v.fala_vendedor).toBe(40);
  });

  it("reunião de venda não manda dados de atendimento", () => {
    const v = sourceValues(ctx);
    expect(Object.keys(v).some((k) => k.startsWith("atd:"))).toBe(false);
  });

  it("a anotação e a tarefa também saem nas conversas de atendimento", () => {
    const note = buildNote({ ...atd, methodologyLabel: "Onboarding" });
    expect(note).toContain("Aderência ao playbook 72/100 · Saúde do cliente: Em risco");
    expect(note).toContain("Etapas do playbook (Onboarding):");
    expect(note).toContain("Sinais de risco: Fala em cancelar");
    expect(note).toContain("Compromissos: Enviar plano");
    expect(note).not.toContain("Temperatura");
    expect(buildTask(atd, "2026-10-22")).toMatchObject({ name: "Enviar plano com datas", dueDate: "2026-10-30" });
  });
});
