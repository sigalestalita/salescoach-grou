/**
 * Janela "O que há de novo": quais novidades publicadas mostrar para a pessoa.
 * Cada uma aparece uma vez (product_update_views guarda quem já viu). Quem
 * entrou no Sales Coach depois da publicação não recebe: para essa pessoa não
 * é novidade, e o primeiro acesso já tem a central de boas-vindas.
 */

export interface NovidadePublicada {
  id: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_path: string | null;
  published_at: string;
}

/** Só as dos últimos 30 dias: depois disso já não é novidade. */
export const JANELA_NOVIDADES_DIAS = 30;
/** No máximo três de uma vez, da mais nova para a mais antiga. */
export const MAX_NOVIDADES = 3;

export function novidadesParaMostrar(
  publicadas: NovidadePublicada[],
  vistas: Set<string>,
  contaCriadaEm: string | null | undefined,
  agora = new Date(),
): NovidadePublicada[] {
  const limite = agora.getTime() - JANELA_NOVIDADES_DIAS * 86_400_000;
  const entrou = contaCriadaEm ? new Date(contaCriadaEm).getTime() : 0;
  return publicadas
    .filter((n) => {
      const t = new Date(n.published_at).getTime();
      return !vistas.has(n.id) && t >= limite && t > entrou;
    })
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .slice(0, MAX_NOVIDADES);
}
