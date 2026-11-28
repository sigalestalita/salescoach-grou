import { describe, expect, it } from "vitest";
import { comPadroes, custoDaLinha, intervaloDoPeriodo, PRECOS_PADRAO, premissasAtuais, projetar, resumir, type Uso } from "@/lib/custos";

const p = PRECOS_PADRAO;
const linha = (o: Partial<Uso["uso"][number]>) => ({
  org_id: "a", provedor: null, operacao: "x", modelo: null, chamadas: 1, tokens_entrada: 0, tokens_saida: 0, quantidade: 0, unidade: null, ...o,
});

describe("custos de API", () => {
  it("precifica cada API pela unidade certa", () => {
    // 60 min depois da reunião = 1 h a 0,17
    expect(custoDaLinha(linha({ provedor: "assemblyai", operacao: "transcricao", modelo: "universal-2", quantidade: 60 }), p).usd).toBeCloseTo(0.17);
    // 120 min ao vivo = 2 h a 0,45
    expect(custoDaLinha(linha({ provedor: "assemblyai", operacao: "live_transcricao", quantidade: 120 }), p)).toEqual({ api: "assembly_ao_vivo", usd: 0.9 });
    // 1 M de entrada + 1 M de saída no Flash = 0,30 + 2,50
    expect(custoDaLinha(linha({ provedor: "lovable-gateway", modelo: "google/gemini-2.5-flash", tokens_entrada: 1e6, tokens_saida: 1e6 }), p).usd).toBeCloseTo(2.8);
    expect(custoDaLinha(linha({ provedor: "lovable-gateway", modelo: "google/gemini-2.5-flash-lite", tokens_entrada: 1e6, tokens_saida: 1e6 }), p).usd).toBeCloseTo(0.5);
    expect(custoDaLinha(linha({ provedor: "hubspot" }), p).api).toBeNull();
    // Voz pelo gateway não é Gemini de texto.
    expect(custoDaLinha(linha({ provedor: "lovable-gateway", modelo: "openai/gpt-4o-mini-tts", tokens_entrada: 1e6 }), p).api).toBeNull();
  });

  it("resume o período e mede a base da projeção", () => {
    const uso: Uso = {
      desde: "2026-10-29T00:00:00Z",
      empresas: [{
        org_id: "a", nome: "A", usuarios: 12, usuarios_ativos: 10, reunioes: 100, minutos: 4000,
        reunioes_robo: 50, minutos_robo: 2000, reunioes_ao_vivo: 40, minutos_ao_vivo: 1600,
      }],
      uso: [
        linha({ provedor: "assemblyai", operacao: "transcricao", modelo: "universal-2", quantidade: 2400 }),
        linha({ provedor: "assemblyai", operacao: "live_transcricao", quantidade: 3200 }),
        linha({ provedor: "lovable-gateway", operacao: "analise", modelo: "google/gemini-2.5-flash", tokens_entrada: 4e6, tokens_saida: 4e5 }),
        linha({ provedor: "lovable-gateway", operacao: "assistant_chat", modelo: "google/gemini-2.5-flash", tokens_entrada: 1e6, tokens_saida: 1e5 }),
        linha({ provedor: "hubspot", operacao: "crm", chamadas: 7 }),
      ],
    };
    const r = resumir(uso, p, 30);
    expect(r.porApi.recall).toBeCloseTo((2000 / 60) * 0.25);
    expect(r.outrosChamadas).toBe(7);
    expect(r.base.reunioesPorUsuarioMes).toBeCloseTo(10);
    expect(r.base.minutosPorReuniao).toBeCloseTo(40);
    expect(r.base.pctRobo).toBeCloseTo(0.5);
    expect(r.base.pctAoVivo).toBeCloseTo(0.4);
    expect(r.base.trilhasAoVivo).toBeCloseTo(2);
    expect(r.base.gravacaoPorMinuto).toBeCloseTo(1);
    expect(r.base.estimada).toBe(false);
    expect(r.porEmpresa[0].usd).toBeCloseTo(r.totalUsd);

    // Projeção com as premissas atuais reproduz o gasto do mês.
    const proj = projetar(premissasAtuais(r.base), r.base, p);
    expect(proj.totalUsd).toBeCloseTo(r.totalUsd, 1);
    // O dobro de usuários com o mesmo uso, o dobro do custo.
    const dobro = projetar({ ...premissasAtuais(r.base), usuarios: 20 }, r.base, p);
    expect(dobro.totalUsd).toBeCloseTo(proj.totalUsd * 2, 6);
  });

  it("sem dados, usa estimativas e avisa", () => {
    const r = resumir({ desde: "", empresas: [], uso: [] }, p, 30);
    expect(r.base.estimada).toBe(true);
    expect(projetar({ usuarios: 10, reunioesPorUsuarioMes: 20, minutosPorReuniao: 40, pctRobo: 0.5, pctAoVivo: 0.5 }, r.base, p).totalUsd).toBeGreaterThan(0);
  });

  it("preço salvo inválido volta ao padrão", () => {
    expect(comPadroes({ cambio: 5.1, recall_hora: -1, gemini_flash_saida: "abc" })).toMatchObject({ cambio: 5.1, recall_hora: 0.25, gemini_flash_saida: 2.5 });
    expect(comPadroes(null)).toEqual(PRECOS_PADRAO);
  });
});

describe("período", () => {
  const agora = new Date(2026, 10, 28, 15, 0); // 28/11/2026 15h, fuso local
  it("últimos N dias terminam agora", () => {
    const r = intervaloDoPeriodo("30", "", "", agora)!;
    expect(r.ate).toEqual(agora);
    expect(r.dias).toBeCloseTo(30);
  });
  it("este mês e mês passado", () => {
    const m = intervaloDoPeriodo("mes", "", "", agora)!;
    expect(m.desde).toEqual(new Date(2026, 10, 1));
    expect(m.ate).toEqual(agora);
    const p = intervaloDoPeriodo("mes_passado", "", "", agora)!;
    expect(p.desde).toEqual(new Date(2026, 9, 1));
    expect(p.ate).toEqual(new Date(2026, 10, 1));
    expect(p.dias).toBeCloseTo(31, 0);
    // Janeiro: mês passado é dezembro do ano anterior.
    expect(intervaloDoPeriodo("mes_passado", "", "", new Date(2027, 0, 10))!.desde).toEqual(new Date(2026, 11, 1));
  });
  it("personalizado inclui o último dia e não passa de agora", () => {
    const r = intervaloDoPeriodo("personalizado", "2026-11-01", "2026-11-15", agora)!;
    expect(r.desde).toEqual(new Date(2026, 10, 1));
    expect(r.ate).toEqual(new Date(2026, 10, 16));
    expect(r.dias).toBeCloseTo(15);
    expect(intervaloDoPeriodo("personalizado", "2026-11-20", "2026-12-31", agora)!.ate).toEqual(agora);
  });
  it("recusa datas inválidas, invertidas ou longas demais", () => {
    expect(intervaloDoPeriodo("personalizado", "", "2026-11-15", agora)).toBeNull();
    expect(intervaloDoPeriodo("personalizado", "2026-11-15", "2026-11-01", agora)).toBeNull();
    expect(intervaloDoPeriodo("personalizado", "2024-01-01", "2026-11-01", agora)).toBeNull();
    expect(intervaloDoPeriodo("personalizado", "2026-12-01", "2026-12-05", agora)).toBeNull();
  });
});

describe("Recall e usuários", () => {
  const empresa = (o: Partial<Uso["empresas"][number]>) => ({
    org_id: "a", nome: "A", usuarios: 5, usuarios_ativos: 4, reunioes: 10, minutos: 400,
    reunioes_robo: 2, minutos_robo: 80, reunioes_ao_vivo: 0, minutos_ao_vivo: 0, ...o,
  });
  const uso: Uso = {
    desde: "", uso: [],
    empresas: [empresa({ org_id: "a", robos: 3, minutos_robos: 90 }), empresa({ org_id: "b", nome: "B", robos: 1, minutos_robos: 30 })],
    usuarios_total: 7, usuarios_ativos_total: 6,
  };
  it("usa as horas da conta na Recall e divide pelo tempo dos robôs", () => {
    const r = resumir(uso, p, 30, 4 * 3600); // 4 h na conta, a 0,25
    expect(r.recallFonte).toBe("conta");
    expect(r.porApi.recall).toBeCloseTo(1);
    expect(r.usoPorApi.recall).toBe(240);
    expect(r.porEmpresa.find((e) => e.org_id === "a")!.porApi.recall).toBeCloseTo(0.75);
    expect(r.porEmpresa.find((e) => e.org_id === "b")!.porApi.recall).toBeCloseTo(0.25);
  });
  it("sem a conta, soma o tempo registrado dos robôs", () => {
    const r = resumir(uso, p, 30);
    expect(r.recallFonte).toBe("registro");
    expect(r.porApi.recall).toBeCloseTo(0.5); // 120 min
  });
  it("conta cada pessoa uma vez, mesmo em duas empresas", () => {
    const r = resumir(uso, p, 30);
    expect(r.base.usuariosAtivos).toBe(6);
    expect(r.base.usuarios).toBe(7);
  });
});

describe("planos mensais", () => {
  const p2 = comPadroes({ lovable_mes: 25, lovable_cloud_mes: 10, resend_mes: 20, elevenlabs_mes: 5 });
  const uso: Uso = {
    desde: "", empresas: [], emails_enviados: 27,
    uso: [
      { org_id: "a", provedor: "elevenlabs", operacao: "tts", modelo: "elevenlabs", chamadas: 3, tokens_entrada: 0, tokens_saida: 0, quantidade: 1200, unidade: "caracteres" },
      { org_id: "a", provedor: "lovable-gateway", operacao: "tts", modelo: "openai/gpt-4o-mini-tts", chamadas: 1, tokens_entrada: 0, tokens_saida: 0, quantidade: 300, unidade: "caracteres" },
    ],
  };
  it("leva os planos ao período e soma no total", () => {
    const r = resumir(uso, p2, 15);
    expect(r.planosUsd).toBeCloseTo(30); // 60 por mês, meio mês
    expect(r.totalComPlanosUsd).toBeCloseTo(r.totalUsd + 30);
    expect(r.voz).toEqual({ elevenlabs: 1200, outras: 300 });
    expect(r.emails).toBe(27);
  });
  it("a projeção soma os planos sem multiplicar por usuário", () => {
    const r = resumir(uso, p2, 30);
    const pr = { usuarios: 10, reunioesPorUsuarioMes: 20, minutosPorReuniao: 40, pctRobo: 0.5, pctAoVivo: 0.5 };
    const a = projetar(pr, r.base, p2);
    const b = projetar({ ...pr, usuarios: 20 }, r.base, p2);
    expect(a.planosUsd).toBe(60);
    expect(b.planosUsd).toBe(60);
    expect(a.totalComPlanosUsd).toBeCloseTo(a.totalUsd + 60);
  });
});
