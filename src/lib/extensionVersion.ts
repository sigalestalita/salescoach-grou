/**
 * Versão da extensão que os usuários conseguem instalar agora.
 *
 * - VERSAO_NA_LOJA: a que está publicada na Chrome Web Store. Atualize quando a
 *   loja aprovar uma versão nova.
 * - VERSAO_MANUAL: a mais nova, para instalação manual enquanto a loja analisa
 *   (zip gerado por scripts/extensao-manual.sh em public/downloads). null quando
 *   a loja está em dia.
 *
 * Toda versão nova (extension/manifest.json) precisa entrar aqui, numa das
 * duas: o teste src/test/extension-version.test.ts falha se o manifesto estiver
 * à frente. Com isso, quem estiver com a extensão antiga vê a faixa de aviso no
 * topo do app (ExtensionUpdateBanner) e o aviso na página Extensão.
 */
export const VERSAO_NA_LOJA = "1.10.3";
export const VERSAO_MANUAL: string | null = null;

/** -1 se a < b, 0 se iguais, 1 se a > b ("1.10.3" > "1.9.9"). */
export function compararVersoes(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** A versão mais nova disponível (loja ou manual). */
export const EXTENSAO_ATUAL: string =
  VERSAO_MANUAL && compararVersoes(VERSAO_MANUAL, VERSAO_NA_LOJA) > 0 ? VERSAO_MANUAL : VERSAO_NA_LOJA;

/** A atualização só existe por instalação manual (a loja ainda não aprovou). */
export const SO_MANUAL = EXTENSAO_ATUAL !== VERSAO_NA_LOJA;

export const MANUAL_URL = VERSAO_MANUAL ? `/downloads/sales-coach-extensao-${VERSAO_MANUAL}.zip` : "";

export const desatualizada = (instalada?: string | null) => !!instalada && compararVersoes(instalada, EXTENSAO_ATUAL) < 0;
