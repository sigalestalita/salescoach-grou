import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Guarda de isolamento entre empresas.
 *
 * Verifica, no estado final das migrações, que toda policy das tabelas com
 * dados de cliente filtra por organização. É o teste que falha se alguém
 * adicionar uma tabela ou uma policy sem escopo — o erro que faria uma empresa
 * enxergar os dados de outra.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** Tabelas que guardam dados de cliente e precisam de escopo de organização. */
const TENANT_TABLES = [
  "teams",
  "meetings",
  "transcriptions",
  "analysis_results",
  "highlights",
  "transcription_segments",
  "live_tips",
  "knowledge_documents",
  "knowledge_items",
  "api_usage_logs",
  "user_roles",
  "meeting_types",
  "analysis_templates",
  "pain_categories",
  "pain_items",
  "offer_types",
  "org_settings",
  "organization_invites",
];

function allMigrationsSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

interface Policy {
  name: string;
  table: string;
  body: string;
}

/** Policies que continuam valendo: as recriadas depois do último DROP. */
function effectivePolicies(sql: string): Policy[] {
  const created = new Map<string, Policy>();

  const createRe = /CREATE POLICY\s+"([^"]+)"\s+ON\s+(?:public\.)?(\w+)([\s\S]*?);/g;
  const dropRe = /DROP POLICY(?:\s+IF EXISTS)?\s+"([^"]+)"\s+ON\s+(?:public\.)?(\w+)/g;

  // Percorre na ordem em que aparecem, aplicando criações e remoções.
  const events: { index: number; kind: "create" | "drop"; policy: Policy }[] = [];

  let m: RegExpExecArray | null;
  while ((m = createRe.exec(sql))) {
    events.push({
      index: m.index,
      kind: "create",
      policy: { name: m[1], table: m[2], body: m[3] },
    });
  }
  while ((m = dropRe.exec(sql))) {
    events.push({
      index: m.index,
      kind: "drop",
      policy: { name: m[1], table: m[2], body: "" },
    });
  }

  events.sort((a, b) => a.index - b.index);

  for (const event of events) {
    const key = `${event.policy.table}::${event.policy.name}`;
    if (event.kind === "create") created.set(key, event.policy);
    else created.delete(key);
  }

  return [...created.values()];
}

describe("isolamento por organização", () => {
  const sql = allMigrationsSql();
  const policies = effectivePolicies(sql);

  it("encontra as policies das migrações", () => {
    expect(policies.length).toBeGreaterThan(30);
  });

  it.each(TENANT_TABLES)(
    "toda policy de %s filtra por organização",
    (table) => {
      const tablePolicies = policies.filter((p) => p.table === table);
      expect(tablePolicies.length).toBeGreaterThan(0);

      for (const policy of tablePolicies) {
        expect(
          policy.body.includes("current_org_id()"),
          `A policy "${policy.name}" em ${table} não filtra por organização. ` +
            `Sem isso, uma empresa enxerga dados de outra.`,
        ).toBe(true);
      }
    },
  );

  it("as tabelas com dados de cliente exigem org_id preenchido", () => {
    // profiles é a exceção deliberada: um usuário recém-cadastrado ainda não
    // pertence a nenhuma organização até aceitar um convite.
    const requireNotNull = [
      "teams",
      "meetings",
      "transcriptions",
      "analysis_results",
      "highlights",
      "transcription_segments",
      "live_tips",
      "knowledge_documents",
      "knowledge_items",
      "user_roles",
    ];

    for (const table of requireNotNull) {
      const pattern = new RegExp(
        `ALTER TABLE\\s+public\\.${table}\\s+ALTER COLUMN org_id SET NOT NULL`,
        "i",
      );
      expect(pattern.test(sql), `${table}.org_id deveria ser NOT NULL`).toBe(true);
    }
  });

  it("o gatilho de cadastro não concede papel automaticamente", () => {
    // Um cadastro que já nasce com papel daria acesso a quem apenas se
    // registrasse na plataforma.
    const handleNewUser = sql.lastIndexOf("FUNCTION public.handle_new_user()");
    expect(handleNewUser).toBeGreaterThan(-1);

    const body = sql.slice(handleNewUser, handleNewUser + 800);
    expect(body).not.toMatch(/INSERT INTO public\.user_roles/i);
  });

  it("a leitura de gravações no storage valida dono ou organização", () => {
    const policy = [...effectivePolicies(sql)].find(
      (p) => p.name === "meeting_files_select",
    );
    expect(policy).toBeDefined();
    expect(policy!.body).toContain("current_org_id()");
    expect(policy!.body).toContain("auth.uid()");
  });
});
