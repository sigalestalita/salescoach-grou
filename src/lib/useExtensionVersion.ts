import { useEffect, useState } from "react";
import { extensionStatus } from "@/lib/extensionBridge";

/**
 * Versão da extensão instalada neste navegador (null: não instalada, outro
 * navegador ou extensão antiga demais para responder). Pergunta de novo quando a
 * aba volta ao foco, para o aviso sumir logo depois de a pessoa atualizar.
 */
export function useExtensionVersion(ativo = true): { versao: string | null; verificado: boolean } {
  const [estado, setEstado] = useState<{ versao: string | null; verificado: boolean }>({ versao: null, verificado: false });
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const checar = () =>
      extensionStatus()
        .then((s) => { if (vivo) setEstado({ versao: s?.installed ? s.version ?? null : null, verificado: true }); })
        .catch(() => { if (vivo) setEstado({ versao: null, verificado: true }); });
    checar();
    const aoVoltar = () => { if (document.visibilityState === "visible") checar(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { vivo = false; document.removeEventListener("visibilitychange", aoVoltar); };
  }, [ativo]);
  return estado;
}
