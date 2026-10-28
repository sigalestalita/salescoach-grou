import { describe, expect, it } from "vitest";
import { compararVersao, desatualizada } from "@/lib/extensaoVersao";

describe("versão da extensão", () => {
  it("compara número a número, não como texto", () => {
    expect(compararVersao("1.9.0", "1.13.0")).toBeLessThan(0);
    expect(compararVersao("1.13.1", "1.13")).toBeGreaterThan(0);
    expect(compararVersao("1.13", "1.13.0")).toBe(0);
    expect(compararVersao("2.0", "1.99.9")).toBeGreaterThan(0);
  });

  it("só avisa quando as duas versões existem e a instalada é mais antiga", () => {
    expect(desatualizada("1.12.1", "1.13.1")).toBe(true);
    expect(desatualizada("1.13.1", "1.13.1")).toBe(false);
    expect(desatualizada("1.14.0", "1.13.1")).toBe(false); // instalação manual mais nova que a loja
    expect(desatualizada(null, "1.13.1")).toBe(false);
    expect(desatualizada("1.12.1", null)).toBe(false); // versão atual não definida na Plataforma
  });
});
