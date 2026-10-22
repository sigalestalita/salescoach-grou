import { useState } from "react";
import { Link } from "react-router-dom";
import { Puzzle, X } from "lucide-react";
import { EXTENSAO_ATUAL, desatualizada } from "@/lib/extensionVersion";
import { useExtensionVersion } from "@/lib/useExtensionVersion";

const chaveFechado = () => `sc-aviso-extensao-${EXTENSAO_ATUAL}`;

/**
 * Faixa no topo do app quando a extensão instalada é mais antiga que a
 * disponível (ver src/lib/extensionVersion.ts). Fechada, volta na próxima sessão.
 */
export function ExtensionUpdateBanner({ ativo = true }: { ativo?: boolean }) {
  const { versao } = useExtensionVersion(ativo);
  const [fechado, setFechado] = useState(() => {
    try { return sessionStorage.getItem(chaveFechado()) === "1"; } catch { return false; }
  });
  if (!ativo || fechado || !desatualizada(versao)) return null;
  const fechar = () => {
    try { sessionStorage.setItem(chaveFechado(), "1"); } catch { /* sem armazenamento: só esconde agora */ }
    setFechado(true);
  };
  return (
    <div role="status" className="flex items-start gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-950 md:px-8">
      <Puzzle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">
        <strong>Atualize a extensão do Sales Coach.</strong> Você está com a versão {versao}, e a {EXTENSAO_ATUAL} já está
        disponível, com correções nas gravações.{" "}
        <Link to="/extensao#atualizar" className="font-semibold underline underline-offset-2">Ver como atualizar</Link>
      </span>
      <button type="button" onClick={fechar} aria-label="Fechar aviso" className="rounded p-0.5 hover:bg-amber-200">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
