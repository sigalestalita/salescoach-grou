import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// O catálogo de cenários existe duas vezes: na edge function, que monta a
// persona e avalia, e na página, que só deixa escolher. Se as duas listas
// saírem de sincronia, a pessoa escolhe uma fase e treina outra — sem erro
// nenhum aparecendo. Este teste compara as chaves das duas.
const chaves = (arquivo: string, padrao: RegExp) => {
  const texto = readFileSync(arquivo, "utf8");
  return [...texto.matchAll(padrao)].map((m) => m[1]);
};

describe("cenários do modo de treino", () => {
  const noServidor = chaves("supabase/functions/_shared/roleplay-scenarios.ts", /^\s{4}key: "([a-z_]+)",$/gm);
  const naTela = chaves("src/pages/Roleplay.tsx", /\{ key: "([a-z_]+)", label:/g);

  it("o servidor tem os cinco momentos da relação", () => {
    expect(noServidor).toEqual([
      "primeira_agenda",
      "pos_proposta",
      "cliente_cs",
      "expansao",
      "reativacao",
    ]);
  });

  it("a tela oferece exatamente o que o servidor sabe simular", () => {
    expect(naTela).toEqual(noServidor);
  });

  it("todo cenário diz ao avaliador o que cobrar", () => {
    const texto = readFileSync("supabase/functions/_shared/roleplay-scenarios.ts", "utf8");
    const avaliacoes = [...texto.matchAll(/avaliacao:\s*\n?\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(avaliacoes).toHaveLength(noServidor.length);
    for (const a of avaliacoes) expect(a.length).toBeGreaterThan(60);
  });
});
