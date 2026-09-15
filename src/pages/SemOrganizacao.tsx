import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { Mail } from "lucide-react";

/**
 * Conta autenticada que ainda não pertence a nenhuma organização.
 *
 * Antes, todo cadastro recebia automaticamente perfil e papel de vendedor —
 * em um produto vendido para várias empresas, isso daria acesso a quem apenas
 * se cadastrasse. Agora o acesso vem de convite.
 */
const SemOrganizacao = () => {
  const { user, signOut } = useAuth();
  const { branding } = useBranding();

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
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Peça ao administrador da sua empresa para enviar um convite para este e-mail. O link do
            convite vincula seu acesso automaticamente.
          </div>

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
