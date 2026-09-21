import { describe, it, expect } from "vitest";
import { guessGender, splitSentences, trechosProntos } from "@/lib/speech";

describe("guessGender", () => {
  it("reconhece nomes comuns e a terminação", () => {
    expect(guessGender("Renata Mendes")).toBe("f");
    expect(guessGender("Patrícia Rocha · head de operações")).toBe("f");
    expect(guessGender("Ricardo Alves")).toBe("m");
    expect(guessGender("Simone Carvalho")).toBe("f");
    expect(guessGender("Rodrigo Teixeira")).toBe("m");
  });
  it("não chuta quando não dá para saber", () => {
    expect(guessGender("Ariel")).toBeNull();
    expect(guessGender("")).toBeNull();
    expect(guessGender(null)).toBeNull();
  });
});

describe("splitSentences", () => {
  it("quebra em frases mantendo a pontuação", () => {
    expect(splitSentences("Olá. Tudo bem? Podemos falar… Claro!")).toEqual(["Olá.", "Tudo bem?", "Podemos falar…", "Claro!"]);
  });
  it("quebra frase longa na vírgula, sem passar de 220 caracteres", () => {
    const longa = Array.from({ length: 12 }, (_, i) => `parte número ${i + 1} desta frase bem comprida`).join(", ") + ".";
    const partes = splitSentences(longa);
    expect(partes.length).toBeGreaterThan(1);
    expect(partes.every((p) => p.length <= 220)).toBe(true);
    expect(partes.join(" ").replace(/\s+/g, " ")).toBe(longa);
  });
  it("texto sem pontuação vira uma frase só", () => {
    expect(splitSentences("sem pontuação nenhuma")).toEqual(["sem pontuação nenhuma"]);
  });
});

describe("trechosProntos", () => {
  it("só entrega o que já dá para falar", () => {
    const { trechos, resto } = trechosProntos("Bom dia. A gente usa planil");
    expect(trechos).toEqual(["Bom dia."]);
    expect(resto).toBe("A gente usa planil");
  });

  it("junta frases curtas para a fala não picotar", () => {
    const { trechos } = trechosProntos("Oi. Tudo bem? Sim, a gente tem esse problema todo mês.");
    expect(trechos[0]).toBe("Oi. Tudo bem?");
    expect(trechos[1]).toBe("Sim, a gente tem esse problema todo mês.");
  });

  it("sem pontuação, segura o texto até a frase fechar", () => {
    const { trechos, resto } = trechosProntos("a gente ainda está falando");
    expect(trechos).toEqual([]);
    expect(resto).toBe("a gente ainda está falando");
  });
});
