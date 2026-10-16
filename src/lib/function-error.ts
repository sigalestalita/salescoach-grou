/**
 * Mensagem de erro de uma edge function chamada com supabase.functions.invoke.
 *
 * Quando a função responde com status de erro, o invoke devolve `data` vazio e
 * um erro genérico ("Edge Function returned a non-2xx status code"); a mensagem
 * que a função mandou fica no corpo da resposta, em `error.context`.
 */
export async function functionErrorMessage(error: unknown, data?: { error?: string } | null): Promise<string> {
  if (data?.error) return data.error;
  const res = (error as { context?: Response })?.context;
  const status = typeof res?.status === "number" ? res.status : null;
  const body = await res?.text?.().catch(() => "") ?? "";
  let detail: { error?: string; message?: string; code?: string } | null = null;
  try { detail = JSON.parse(body); } catch { /* corpo não é JSON */ }
  if (detail?.error) return detail.error;
  // Resposta da própria plataforma (tempo, memória, CPU): mostra o código para dar para investigar.
  if (status === 504 || status === 546 || detail?.code === "WORKER_LIMIT") {
    return `O servidor não terminou a tempo (${detail?.code ?? `HTTP ${status}`}). Tente de novo em instantes.`;
  }
  const extra = detail?.message ?? (body && body.length < 160 ? body : "");
  if (status) return `Erro ${status}${detail?.code ? ` · ${detail.code}` : ""}${extra ? `: ${extra}` : ""}`;
  return error instanceof Error ? error.message : "Erro inesperado.";
}
