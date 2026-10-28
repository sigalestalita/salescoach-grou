import { supabase } from "@/integrations/supabase/client";
import { extensionStatus } from "@/lib/extensionBridge";

/**
 * Versão da extensão do Chrome: o site pergunta à extensão instalada e grava
 * no perfil (registrar_extensao), para a tela Plataforma mostrar quem está em
 * qual versão. A versão atual na loja fica em platform_settings, editada na
 * Plataforma; quem está abaixo dela vê o aviso de extensão desatualizada.
 */

/** Compara "1.12.1" com "1.13": negativo quando a é mais antiga que b. */
export function compararVersao(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** A extensão instalada é mais antiga que a atual na loja. Sem uma das duas, não avisa. */
export function desatualizada(instalada: string | null | undefined, atual: string | null | undefined): boolean {
  return !!instalada && !!atual && compararVersao(instalada, atual) < 0;
}

/** Versão atual da extensão na Chrome Web Store, definida na tela Plataforma. */
export async function versaoAtualDaLoja(): Promise<string | null> {
  const { data } = await supabase.from("platform_settings").select("value").eq("key", "extensao_atual").maybeSingle();
  return typeof data?.value === "string" ? data.value : null;
}

const MARCA = "sc-extensao-registrada";

/**
 * Versão da extensão instalada neste navegador (null sem extensão). Grava no
 * perfil uma vez por dia, ou quando a versão muda.
 */
export async function registrarExtensao(userId: string): Promise<string | null> {
  const status = await extensionStatus();
  const versao = status?.installed ? status.version ?? null : null;
  if (!versao) return null;
  const marca = `${userId}:${versao}:${new Date().toISOString().slice(0, 10)}`;
  let jaRegistrou = false;
  try { jaRegistrou = localStorage.getItem(MARCA) === marca; } catch { /* sem armazenamento */ }
  if (!jaRegistrou) {
    const { error } = await supabase.rpc("registrar_extensao", { _versao: versao });
    if (!error) {
      try { localStorage.setItem(MARCA, marca); } catch { /* sem armazenamento */ }
    }
  }
  return versao;
}
