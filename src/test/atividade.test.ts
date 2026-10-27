import { describe, expect, it } from "vitest";
import { haQuanto, normalizaPessoa, saudePorEmpresa, type PessoaAtividade } from "@/lib/atividade";

// Painel de atividade da plataforma: saúde de cada empresa a partir do resumo por pessoa.

const agora = new Date("2026-10-23T15:00:00Z");
const dias = (d: number) => new Date(agora.getTime() - d * 86_400_000).toISOString();
const p = (org: string, user: string, ultima: number | null, extra: Partial<PessoaAtividade> = {}): PessoaAtividade => ({
  org_id: org, org_nome: org.toUpperCase(), user_id: user, email: `${user}@x.com`, nome: user, papel: "vendedor",
  ultimo_login: null, logins: 0, reunioes: 0, analises: 0, erros: 0, treinos: 0, assistente: 0, custo: 0,
  ultima_atividade: ultima === null ? null : dias(ultima), ...extra,
});

describe("Atividade da plataforma", () => {
  it("classifica as empresas e ordena da pior para a melhor", () => {
    const r = saudePorEmpresa([
      p("boa", "a", 1, { reunioes: 10, erros: 1, custo: 2.5 }), p("boa", "b", 3, { reunioes: 4, custo: 1 }),
      p("parada", "c", 40), p("parada", "d", null),
      p("erro", "e", 0, { reunioes: 5, erros: 2 }),
      p("fraca", "f", 2), p("fraca", "g", 20), p("fraca", "h", 25), p("fraca", "i", 31),
    ], agora);
    expect(r.map((e) => [e.org_id, e.saude])).toEqual([
      ["parada", "sem_uso"], ["erro", "atencao"], ["fraca", "atencao"], ["boa", "saudavel"],
    ]);
    const boa = r.find((e) => e.org_id === "boa")!;
    expect(boa).toMatchObject({ pessoas: 2, ativos7: 2, ativos30: 2, reunioes: 14, erros: 1, custo: 3.5, ultima: dias(1) });
    expect(r.find((e) => e.org_id === "erro")!.motivo).toBe("40% das reuniões com erro");
    expect(r.find((e) => e.org_id === "fraca")!).toMatchObject({ ativos7: 1, ativos30: 3, taxaErro: null, motivo: "Só 1 de 4 ativos na semana" });
  });

  it("normaliza números que o banco devolve como texto", () => {
    const n = normalizaPessoa(p("o", "u", 1, { reunioes: "3" as unknown as number, custo: "0.42" as unknown as number }));
    expect(n.reunioes).toBe(3);
    expect(n.custo).toBeCloseTo(0.42);
  });

  it("tempo relativo", () => {
    expect(haQuanto(null, agora)).toBe("nunca");
    expect(haQuanto(new Date(agora.getTime() - 5 * 60_000).toISOString(), agora)).toBe("há 5 min");
    expect(haQuanto(new Date(agora.getTime() - 3 * 3600_000).toISOString(), agora)).toBe("há 3 h");
    expect(haQuanto(dias(1), agora)).toBe("há 1 dia");
    expect(haQuanto(dias(9), agora)).toBe("há 9 dias");
  });
});
