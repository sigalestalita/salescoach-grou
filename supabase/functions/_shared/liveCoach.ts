// Ritmo do coach ao vivo: quando vale chamar a IA e quando uma dica nova é só
// a anterior com outras palavras. Só regras aqui, sem banco nem IA, para testar.
//
// O problema que isto resolve: o coach roda ao fim de cada fala. Quando a
// closer começa a ler a pergunta sugerida, a própria fala dela dispara o coach
// de novo, e a IA devolvia a mesma pergunta reescrita, trocando a dica no meio
// da leitura.

const PALAVRAS_VAZIAS = new Set([
  "a", "o", "e", "de", "da", "do", "das", "dos", "em", "um", "uma", "que", "nao", "com", "para", "pra", "por",
  "se", "na", "no", "nas", "nos", "ao", "as", "os", "mas", "ou", "como", "mais", "muito", "isso", "esse", "essa",
  "este", "esta", "aqui", "tem", "ter", "ser", "vai", "vou", "eu", "voce", "voces", "ele", "ela", "gente", "entao",
  "tambem", "sim", "bem", "tipo", "assim", "porque", "quando", "onde", "qual", "quais", "quem", "sobre", "ainda",
  "meu", "minha", "seu", "sua", "seus", "suas", "nosso", "nossa", "hoje", "agora",
  "pode", "podem", "poderia", "consegue", "conseguem", "acha", "acham", "seria", "fazer", "faz",
]);

/** Palavras que carregam o sentido da frase (sem acento, sem as muito comuns). */
export function termosDaFrase(texto: string): Set<string> {
  return new Set(
    texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4 && !PALAVRAS_VAZIAS.has(t)),
  );
}

/**
 * A dica nova é uma das recentes reescrita? Compara as palavras que importam
 * da frase a falar: se quase todas as da frase menor estão na outra, é a mesma
 * pergunta com outras palavras.
 */
export function dicaRepetida(nova: { acao: string }, recentes: { acao: string | null }[]): boolean {
  const a = termosDaFrase(nova.acao);
  if (a.size < 2) return false;
  return recentes.some((r) => {
    if (!r.acao) return false;
    const b = termosDaFrase(r.acao);
    if (b.size < 2) return false;
    let comuns = 0;
    for (const t of a) if (b.has(t)) comuns++;
    return comuns / Math.min(a.size, b.size) >= 0.6;
  });
}

/** Depois da fala do vendedor, a IA só é chamada se a última dica tiver pelo menos isto. */
export const SILENCIO_APOS_DICA_MS = 25_000;

/**
 * Vale chamar a IA agora? Depois da fala do cliente, sempre (pode ser uma
 * objeção). Depois da fala do vendedor, só se a última dica já tiver ficado um
 * tempo na tela: logo depois de uma dica, o vendedor está lendo ou fazendo a
 * pergunta sugerida, e uma dica nova só atrapalharia.
 */
export function vaiChamarIa(gatilho: string | null | undefined, ultimaDicaEm: string | null | undefined, agora = new Date()): boolean {
  if (gatilho !== "vendedor" || !ultimaDicaEm) return true;
  return agora.getTime() - new Date(ultimaDicaEm).getTime() >= SILENCIO_APOS_DICA_MS;
}
