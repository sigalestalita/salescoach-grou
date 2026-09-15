import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/contexts/BrandingContext";
import { Loader2 } from "lucide-react";

/**
 * Aceite de convite: quem já tem conta faz login e é vinculado; quem não tem
 * cria a senha na hora. O vínculo com a organização é feito pelo backend, que
 * confere se o e-mail do convite é o mesmo da conta.
 */
const AcceptInvite = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { branding } = useBranding();

  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [linking, setLinking] = useState(false);

  const linkInvite = async () => {
    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("accept-invite", {
        body: { token },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast({ title: "Convite aceito!", description: "Bem-vindo(a) ao time." });
      window.location.href = "/agendas";
    } catch (err: any) {
      toast({ title: "Não foi possível aceitar o convite", description: err.message, variant: "destructive" });
      setLinking(false);
    }
  };

  // Sessão já aberta: vincula direto.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) linkInvite();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await linkInvite();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (linking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Vinculando seu acesso...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {branding.logo_url && (
            <img src={branding.logo_url} alt={branding.product_name} className="h-12 mx-auto mb-3 object-contain" />
          )}
          <CardTitle className="text-2xl">Você foi convidado</CardTitle>
          <CardDescription>
            {mode === "signup"
              ? `Crie sua senha para entrar no ${branding.product_name}.`
              : `Entre com sua conta para aceitar o convite.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="invite-name">Nome completo</Label>
                <Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email do convite</Label>
              <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-password">Senha</Label>
              <Input
                id="invite-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Enviando..." : mode === "signup" ? "Criar acesso" : "Entrar e aceitar"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
            className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === "signup" ? "Já tenho conta" : "Ainda não tenho conta"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AcceptInvite;
