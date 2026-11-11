import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { Loader2, Mail } from "lucide-react";

/**
 * Conta autenticada que ainda não pertence a nenhuma organização.
 *
 * Antes, todo cadastro recebia automaticamente perfil e papel de vendedor —
 * em um produto vendido para várias empresas, isso daria acesso a quem apenas
 * se cadastrasse. Agora o acesso vem de convite. Se já houver convite válido para o
 * e-mail da conta, ele aparece aqui para aceitar em um clique (sem precisar do link).
 */
const SemOrganizacao = () => {
  const { user, signOut } = useAuth();
  const { branding } = useBranding();
  const { toast } = useToast();
  const [convites, setConvites] = useState<{ token: string; empresa: string }[]>([]);
  const [aceitando, setAceitando] = useState<string | null>(null);

  useEffect(() => {
    supabase.functions.invoke("accept-invite", { body: { acao: "pendentes" } })
      .then(({ data }) => setConvites(data?.convites ?? []))
      .catch(() => {});
  }, []);

  const aceitar = async (token: string) => {
    setAceitando(token);
    const { data, error } = await supabase.functions.invoke("accept-invite", { body: { token } });
    if (error || data?.error) {
      toast({ title: "Não foi possível aceitar o convite", description: data?.error || error?.message, variant: "destructive" });
      setAceitando(null);
      return;
    }
    window.location.href = "/agendas";
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          {branding.logo_url && (
            <img src={branding.logo_url} alt={branding.product_name} className="h-12 mx-auto mb-3 object-contain" />
          )}
          <CardTitle className="text-2xl">Acesso pendente</CardTitle>
          <CardDescription>
            Sua conta ({user?.email}) ainda não está vinculada a nenhuma empresa no {branding.product_name}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {convites.length > 0 ? (
            convites.map((c) => (
              <div key={c.token} className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                <p className="mb-3">Você tem um convite da <b>{c.empresa}</b>.</p>
                <Button className="w-full" disabled={!!aceitando} onClick={() => aceitar(c.token)}>
                  {aceitando === c.token && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Entrar na {c.empresa}
                </Button>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Peça ao administrador da sua empresa para enviar um convite para este e-mail. Assim que o
              convite existir, ele aparece aqui para você aceitar em um clique.
            </div>
          )}

          {branding.support_email && (
            <a
              href={`mailto:${branding.support_email}`}
              className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
            >
              <Mail className="h-4 w-4" />
              {branding.support_email}
            </a>
          )}

          <Button variant="outline" className="w-full" onClick={signOut}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SemOrganizacao;
