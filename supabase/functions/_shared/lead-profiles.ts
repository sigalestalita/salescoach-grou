// Perfis de cliente da empresa (tabela lead_profiles), usados pelo modo de
// treino para montar o lead simulado. Ver 20261023090000_perfis_de_cliente.sql.

export interface LeadProfile {
  id?: string;
  name: string;
  segment: string | null;
  role: string | null;
  company_profile: string | null;
  pains: string[];
  objections: string[];
  context: string | null;
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const list = (v: unknown, max: number, each: number) =>
  Array.from(new Set((Array.isArray(v) ? v : []).map((x) => clean(x, each)).filter(Boolean))).slice(0, max);

/** Limpa um perfil vindo da IA ou da tela. Devolve null se não der para usar. */
export function cleanProfile(raw: Record<string, unknown>): LeadProfile | null {
  const name = clean(raw.name, 120);
  const pains = list(raw.pains, 8, 300);
  if (!name || pains.length === 0) return null;
  return {
    name,
    segment: clean(raw.segment, 120) || null,
    role: clean(raw.role, 120) || null,
    company_profile: clean(raw.company_profile, 400) || null,
    pains,
    objections: list(raw.objections, 8, 300),
    context: clean(raw.context, 800) || null,
  };
}

/** Lê a resposta da IA ({ profiles: [...] }). Lança se nenhum perfil servir. */
export function parseProfiles(raw: string): LeadProfile[] {
  const s = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
  const arr = Array.isArray(s) ? s : Array.isArray(s?.profiles) ? s.profiles : [];
  const profiles = arr
    .map((p: unknown) => (p && typeof p === "object" ? cleanProfile(p as Record<string, unknown>) : null))
    .filter((p: LeadProfile | null): p is LeadProfile => !!p)
    .slice(0, 8);
  if (profiles.length === 0) throw new Error("A IA não propôs perfis utilizáveis.");
  return profiles;
}

/** Linhas do perfil para o prompt do lead simulado. */
export function profilePromptLines(p: LeadProfile, focusPain: string | null): string[] {
  const others = p.pains.filter((d) => d !== focusPain);
  return [
    p.segment ? `- Segmento da sua empresa: ${p.segment}` : "",
    p.company_profile ? `- Sua empresa: ${p.company_profile}` : "",
    p.context ? `- Contexto (como você chegou até aqui e como decide): ${p.context}` : "",
    others.length
      ? `- Outros problemas que você tem e só conta se o vendedor investigar: ${others.join("; ")}`
      : "",
  ].filter(Boolean);
}
