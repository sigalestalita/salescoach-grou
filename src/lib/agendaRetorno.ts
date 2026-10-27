/**
 * Volta da autorização da agenda (Google ou Microsoft) pelo domínio do Sales
 * Coach. O provedor devolve code e state para /agenda/retorno; a página repassa
 * os mesmos parâmetros para a função calendar, que troca o código pelos tokens
 * e manda a pessoa de volta para o app. Ver CALENDAR_REDIRECT_URI em
 * supabase/functions/_shared/calendar.ts.
 */
const REPASSA = ["code", "state", "error", "error_description", "scope", "session_state"];

export function destinoRetornoAgenda(supabaseUrl: string, search: string): string | null {
  const vindo = new URLSearchParams(search);
  if (!vindo.get("state")) return null;
  const ida = new URLSearchParams();
  for (const k of REPASSA) {
    const v = vindo.get(k);
    if (v !== null) ida.set(k, v);
  }
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/calendar?${ida.toString()}`;
}
