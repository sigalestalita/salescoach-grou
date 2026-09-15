import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

/**
 * Guarda de produto genérico.
 *
 * O código da aplicação não pode conhecer a metodologia, o portfólio ou as
 * categorias de dor de nenhum cliente — isso é configuração por organização,
 * guardada no banco. Se um termo de negócio voltar para dentro do código, este
 * teste falha e aponta o arquivo.
 *
 * As migrações ficam de fora de propósito: é lá que mora o backfill, que grava
 * a configuração da empresa que já usava o sistema como dado dela.
 */

const ROOTS = ["src", "supabase/functions", "extension"];

const IGNORED_DIRS = new Set(["node_modules", "dist", "ui", "test"]);
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".html", ".css"]);

/** Termos específicos de um único negócio. */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bGrou\b/, why: "nome de cliente" },
  { pattern: /\bPDA\b/, why: "produto de cliente" },
  { pattern: /Personal Development Analysis/i, why: "produto de cliente" },
  { pattern: /Programa de Partners/i, why: "tabela de preços de cliente" },
  { pattern: /Créditos PDA/i, why: "tabela de preços de cliente" },
  { pattern: /\bturnover\b/i, why: "categoria de dor de um segmento" },
  { pattern: /Maturidade de RH/i, why: "campo de contexto de um segmento" },
];

/** Valores de negócio que passaram a ser configuração por organização. */
const FORBIDDEN_LITERALS: { pattern: RegExp; why: string }[] = [
  {
    pattern: /["'](empresa|consultoria)["']\s*[,:)\]]/,
    why: "tipo de reunião fixo (use meeting_types da organização)",
  },
];

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!IGNORED_DIRS.has(entry)) walk(full, acc);
    } else if (SCANNED_EXTENSIONS.has(extname(entry))) {
      acc.push(full);
    }
  }
  return acc;
}

describe("o código não carrega o negócio de nenhum cliente", () => {
  const files = ROOTS.flatMap((root) => walk(join(process.cwd(), root)));

  it("varre os arquivos da aplicação", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("não contém termos de um cliente específico", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const { pattern, why } of FORBIDDEN) {
        const match = content.match(pattern);
        if (match) {
          offenders.push(`${relative(process.cwd(), file)}: "${match[0]}" (${why})`);
        }
      }
    }

    expect(offenders, `Termos de cliente encontrados no código:\n${offenders.join("\n")}`)
      .toEqual([]);
  });

  it("não fixa tipos de reunião no código", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const { pattern, why } of FORBIDDEN_LITERALS) {
        const match = content.match(pattern);
        if (match) {
          offenders.push(`${relative(process.cwd(), file)}: ${match[0].trim()} (${why})`);
        }
      }
    }

    expect(offenders, `Valores de negócio fixos no código:\n${offenders.join("\n")}`)
      .toEqual([]);
  });
});
