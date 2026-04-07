import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Check role — only admin and gestor can access
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .single();

      if (!roleData || roleData.role === "vendedor") {
        await supabase.auth.signOut();
        toast({
          title: "Acesso negado",
          description: "Apenas gestores e administradores têm acesso à plataforma.",
          variant: "destructive",
        });
        return;
      }

      navigate("/");
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar flex-col justify-center items-center p-12">
        <div className="max-w-md text-center space-y-8">
          <div className="flex justify-center mb-6">
            <img src={logo} alt="Sales Coach" className="h-16 object-contain" />
          </div>
          <h1 className="text-4xl font-bold text-primary-foreground">Sales Coach</h1>
          <p className="text-lg text-primary-foreground/80">
            Análise inteligente de reuniões comerciais com IA avançada. Transcrição, frameworks de vendas e coaching automatizado.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary-foreground">BANT</div>
              <div className="text-sm text-primary-foreground/60">Framework</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary-foreground">MEDDIC</div>
              <div className="text-sm text-primary-foreground/60">Framework</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary-foreground">SPIN</div>
              <div className="text-sm text-primary-foreground/60">Framework</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Entrar</CardTitle>
            <CardDescription>
              Acesse sua conta para analisar reuniões
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Carregando..." : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
