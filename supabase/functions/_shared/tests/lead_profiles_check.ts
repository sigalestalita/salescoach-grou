// deno run supabase/functions/_shared/tests/lead_profiles_check.ts
import { cleanProfile, parseProfiles, profilePromptLines } from "../lead-profiles.ts";

let ok = 0;
const check = (name: string, cond: boolean) => {
  if (!cond) { console.error("FALHOU:", name); Deno.exit(1); }
  ok++;
};

const p = parseProfiles('```json\n{"profiles":[{"name":"  Dono de clínica ","segment":"Clínica odontológica","pains":["CAC alto","CAC alto",""],"objections":["Já tentei"]},{"name":"Sem dor","pains":[]}]}\n```');
check("descarta perfil sem dor", p.length === 1);
check("limpa nome", p[0].name === "Dono de clínica");
check("dores sem repetição nem vazias", p[0].pains.length === 1);
check("campos ausentes viram null", p[0].role === null && p[0].context === null);

let threw = false;
try { parseProfiles('{"profiles":[]}'); } catch { threw = true; }
check("lança sem perfis", threw);

check("aceita lista direta", parseProfiles('[{"name":"A","pains":["x"]}]').length === 1);
check("cleanProfile recusa sem nome", cleanProfile({ pains: ["x"] }) === null);

const lines = profilePromptLines({ name: "A", segment: "Escola", role: null, company_profile: "2 unidades", pains: ["d1", "d2"], objections: [], context: null }, "d1");
check("prompt sem a dor em foco", lines.some((l) => l.includes("d2")) && !lines.some((l) => l.includes("d1")));
check("prompt com segmento", lines.some((l) => l.includes("Escola")));

console.log(`lead_profiles_check: ${ok} verificações ok`);
