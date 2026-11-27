import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Empresa = { org_id: string; nome: string; slug: string; papel: string; ativa: boolean };

/**
 * Troca de empresa para quem faz parte de mais de uma.
 * Só aparece com duas ou mais. A troca muda a empresa ativa no banco e
 * recarrega o app do início, para tudo (dados, marca, menu) vir da nova.
 */
export function EmpresaSwitcher() {
  const { session, support } = useAuth();
  const { toast } = useToast();
  const [trocando, setTrocando] = useState<string | null>(null);

  const { data: empresas = [] } = useQuery({
    queryKey: ["minhas-empresas", session?.user.id],
    enabled: !!session && !support,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("minhas_empresas");
      if (error) throw error;
      return (data ?? []) as Empresa[];
    },
  });

  if (empresas.length < 2) return null;
  const ativa = empresas.find((e) => e.ativa);

  const trocar = async (e: Empresa) => {
    if (e.ativa || trocando) return;
    setTrocando(e.org_id);
    const { error } = await supabase.rpc("trocar_empresa", { _org_id: e.org_id });
    if (error) {
      setTrocando(null);
      toast({ title: "Não foi possível trocar de empresa", description: error.message, variant: "destructive" });
      return;
    }
    window.location.assign("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="mt-2 flex w-full items-center gap-2 rounded-xl bg-white/[.06] px-2.5 py-2 text-left text-[12.5px] text-sidebar-foreground/80 ring-1 ring-white/[.06] transition-colors hover:bg-white/[.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          title="Trocar de empresa"
        >
          <Building2 className="h-4 w-4 shrink-0 text-sidebar-foreground/55" />
          <span className="min-w-0 flex-1 truncate">{ativa?.nome ?? "Escolha a empresa"}</span>
          {trocando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/45" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Suas empresas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {empresas.map((e) => (
          <DropdownMenuItem key={e.org_id} onSelect={() => trocar(e)} className="gap-2">
            <span className="min-w-0 flex-1 truncate">{e.nome}</span>
            {e.ativa && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
