import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * O usuário é operador da plataforma?
 *
 * A policy de `platform_admins` só devolve linha para quem já é operador, então
 * a própria consulta é a verificação. Esse acesso vê organizações, planos e
 * consumo — nunca conteúdo de reunião dos clientes.
 */
export function usePlatformAdmin() {
  const { user, loading: authLoading } = useAuth();

  const query = useQuery({
    queryKey: ["platform-admin", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      return !!data;
    },
  });

  return {
    isPlatformAdmin: query.data ?? false,
    loading: authLoading || query.isLoading,
  };
}
