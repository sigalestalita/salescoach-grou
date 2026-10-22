import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { compararVersoes, desatualizada, EXTENSAO_ATUAL, VERSAO_MANUAL } from "@/lib/extensionVersion";

const manifesto = JSON.parse(readFileSync(resolve(__dirname, "../../extension/manifest.json"), "utf8")).version as string;

describe("versão da extensão", () => {
  it("compara versões por número", () => {
    expect(compararVersoes("1.10.3", "1.9.9")).toBe(1);
    expect(compararVersoes("1.10.1", "1.10.3")).toBe(-1);
    expect(compararVersoes("1.10.3", "1.10.3")).toBe(0);
    expect(desatualizada("1.10.1")).toBe(compararVersoes("1.10.1", EXTENSAO_ATUAL) < 0);
    expect(desatualizada(null)).toBe(false);
  });

  // Versão nova no manifesto sem entrar em extensionVersion.ts = ninguém é avisado.
  it("a versão do manifesto está disponível (loja ou instalação manual)", () => {
    expect(compararVersoes(manifesto, EXTENSAO_ATUAL), `extension/manifest.json está na ${manifesto}, mas src/lib/extensionVersion.ts anuncia a ${EXTENSAO_ATUAL}. Gere o zip manual (scripts/extensao-manual.sh) e preencha VERSAO_MANUAL, ou atualize VERSAO_NA_LOJA se a loja já aprovou.`).toBeLessThanOrEqual(0);
  });

  it("o zip da instalação manual existe", () => {
    if (!VERSAO_MANUAL) return;
    expect(existsSync(resolve(__dirname, `../../public/downloads/sales-coach-extensao-${VERSAO_MANUAL}.zip`))).toBe(true);
  });
});
