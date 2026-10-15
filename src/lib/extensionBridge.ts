import { supabase } from "@/integrations/supabase/client";

/**
 * Login automático da extensão do Chrome.
 *
 * Com o usuário logado no site, pergunta à extensão (se instalada) quem está
 * logado nela. Se ninguém, ou outra pessoa, pede ao servidor um código de uso
 * único (função extension-session) e o entrega à extensão, que abre uma sessão
 * própria. Só páginas em *.grougp.com.br conseguem falar com a extensão
 * (externally_connectable no manifesto).
 */

/** Id da extensão publicada na Chrome Web Store. VITE_EXTENSION_ID cobre testes com a extensão descompactada. */
export const EXTENSION_ID: string = import.meta.env.VITE_EXTENSION_ID || "icabeghcpefeaeklfldpdfklkjfpbbkd";

type ExtStatus = { installed: boolean; version?: string; userId: string | null };

interface ChromeRuntime {
  sendMessage: (id: string, msg: unknown, cb: (res: unknown) => void) => void;
  lastError?: unknown;
}

function runtime(): ChromeRuntime | null {
  const rt = (window as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
  return rt?.sendMessage ? rt : null;
}

function ask<T>(msg: unknown, timeoutMs = 3000): Promise<T | null> {
  const rt = runtime();
  if (!rt) return Promise.resolve(null);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeoutMs);
    try {
      rt.sendMessage(EXTENSION_ID, msg, (res) => {
        clearTimeout(t);
        // Extensão não instalada: o Chrome preenche lastError.
        void rt.lastError;
        resolve((res as T) ?? null);
      });
    } catch {
      clearTimeout(t);
      resolve(null);
    }
  });
}

export async function extensionStatus(): Promise<ExtStatus | null> {
  return ask<ExtStatus>({ type: "salescoach:status" });
}

/** Garante que a extensão esteja logada com o mesmo usuário do site. */
export async function syncExtensionSession(userId: string): Promise<"sem-extensao" | "ja-conectada" | "conectada" | "falhou"> {
  const status = await extensionStatus();
  if (!status?.installed) return "sem-extensao";
  if (status.userId === userId) return "ja-conectada";

  const { data, error } = await supabase.functions.invoke("extension-session", { body: {} });
  if (error || !data?.token_hash) return "falhou";

  const res = await ask<{ ok: boolean }>({ type: "salescoach:session", tokenHash: data.token_hash }, 15000);
  return res?.ok ? "conectada" : "falhou";
}
