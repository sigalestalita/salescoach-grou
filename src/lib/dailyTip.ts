import { supabase } from "@/integrations/supabase/client";

/** Dica do dia da tela Início (função daily-tip): sai uma vez por dia, escrita pela IA. */
export interface DailyTip {
  titulo: string;
  dica: string;
  porque: string;
  frase_pronta: string | null;
  foco: string | null;
  tipo: "vendedor" | "gestao";
}

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function fetchDailyTip(): Promise<DailyTip> {
  const { data, error } = await supabase.functions.invoke("daily-tip", { body: { day: hoje() } });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? "Não foi possível carregar a dica de hoje.");
  }
  return (data as { tip: DailyTip }).tip;
}
