import { describe, it, expect } from "vitest";
import { guessGender, splitSentences } from "@/lib/speech";

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
