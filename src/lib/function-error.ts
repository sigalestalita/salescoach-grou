/**
 * Mensagem de erro de uma edge function chamada com supabase.functions.invoke.
 *
 * Quando a função responde com status de erro, o invoke devolve `data` vazio e
 * um erro genérico ("Edge Function returned a non-2xx status code"); a mensagem
 * que a função mandou fica no corpo da resposta, em `error.context`.
 */
export async function functionErrorMessage(error: unknown, data?: { error?: string } | null): Promise<string> {
  if (data?.error) return data.error;
  const detail = await (error as { context?: Response })?.context?.json?.().catch(() => null);
  return (detail as { error?: string } | null)?.error ?? (error instanceof Error ? error.message : "Erro inesperado.");
}
