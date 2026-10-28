import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { JANELA_NOVIDADES_DIAS, NovidadePublicada, novidadesParaMostrar } from "@/lib/novidadesPopup";

/**
 * Janela "O que há de novo": as novidades publicadas na tela Plataforma que a
 * pessoa ainda não viu, uma vez cada. Fechar ou seguir o botão de uma delas
 * marca todas as mostradas como vistas (product_update_views).
 */
export function NovidadesPopup({ userId, role, contaCriadaEm }: { userId: string; role: string; contaCriadaEm?: string | null }) {
  const [itens, setItens] = useState<NovidadePublicada[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let vivo = true;
    (async () => {
      // Tabelas das novidades fora dos tipos gerados (como no quadro do Início).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const desde = new Date(Date.now() - JANELA_NOVIDADES_DIAS * 86_400_000).toISOString();
      const { data: publicadas, error } = await db.from("product_updates")
        .select("id, title, body, cta_label, cta_path, published_at")
        .eq("status", "publicado").contains("audience", [role]).gte("published_at", desde)
        .order("published_at", { ascending: false }).limit(10);
      if (error || !publicadas?.length) return;
      const { data: vistas, error: errVistas } = await db.from("product_update_views")
        .select("update_id").in("update_id", publicadas.map((p: NovidadePublicada) => p.id));
      // Sem a tabela de vistas (migração não aplicada), não mostra: apareceria toda vez.
      if (errVistas) return;
      const ids = new Set<string>((vistas ?? []).map((v: { update_id: string }) => v.update_id));
      if (vivo) setItens(novidadesParaMostrar(publicadas, ids, contaCriadaEm));
    })().catch(() => {});
    return () => { vivo = false; };
  }, [userId, role, contaCriadaEm]);

  const marcarVistas = () => {
    const ids = itens.map((i) => i.id);
    setItens([]);
    if (!ids.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("product_update_views")
      .upsert(ids.map((id) => ({ user_id: userId, update_id: id })), { onConflict: "user_id,update_id", ignoreDuplicates: true })
      .then(() => {}, () => {});
  };

  if (!itens.length) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && marcarVistas()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" /> O que há de novo
          </DialogTitle>
          <DialogDescription>
            {itens.length === 1 ? "Uma novidade no Sales Coach desde a sua última visita." : "Novidades no Sales Coach desde a sua última visita."}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-4">
          {itens.map((n) => (
            <li key={n.id} className="space-y-1.5 rounded-lg border p-3">
              <p className="font-semibold leading-snug">{n.title}</p>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{n.body}</p>
              {n.cta_path && (
                <Button
                  size="sm" variant="outline" className="mt-1"
                  onClick={() => { marcarVistas(); navigate(n.cta_path!); }}
                >
                  {n.cta_label ?? "Ver"} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={marcarVistas}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
