import { describe, expect, it } from "vitest";
import { comPadroes, custoDaLinha, PRECOS_PADRAO, premissasAtuais, projetar, resumir, type Uso } from "@/lib/custos";

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
