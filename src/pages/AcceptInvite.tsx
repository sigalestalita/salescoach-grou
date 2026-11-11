import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/contexts/BrandingContext";
import { Loader2 } from "lucide-react";

type Situacao = { status: "valido" | "vencido" | "cancelado" | "aceito" | "invalido"; email?: string; empresa?: string; conta_existe?: boolean };

const Moldura = ({ titulo, texto, logo, nome, children }: { titulo: string; texto: string; logo?: string | null; nome: string; children?: React.ReactNode }) => (
  <div className="min-h-screen flex items-center justify-center p-6">
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        {logo && (
          <img src={logo} alt={nome} className="h-12 mx-auto mb-3 object-contain" />
        )}
        <CardTitle className="text-2xl">{titulo}</CardTitle>
        <CardDescription>{texto}</CardDescription>
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
    </Card>
  </div>
);

/**
 * Aceite de convite. Antes de mostrar o formulário, pergunta ao backend a situação
 * do convite: se venceu ou foi cancelado, explica; se o e-mail já tem conta, abre
 * direto em "entrar" (sem tentar criar uma senha nova). O vínculo com a organização
 * é feito pelo backend, que confere se o e-mail do convite é o mesmo da conta.
 */
const AcceptInvite = () => {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const { branding } = useBranding();

  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);

  const linkInvite = async () => {
    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("accept-invite", { body: { token } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: "Convite aceito!", description: "Bem-vindo(a) ao time." });
      window.location.href = "/agendas";
    } catch (err) {
      toast({ title: "Não foi possível aceitar o convite", description: (err as Error).message, variant: "destructive" });
      setLinking(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.functions.invoke("accept-invite", { body: { token, acao: "status" } });
      const s: Situacao = data?.status ? data : { status: "invalido" };
      setSituacao(s);
      if (s.email) setEmail(s.email);
      if (s.conta_existe) setMode("login");
      // Sessão já aberta e convite válido: vincula direto.
      if (s.status === "valido") {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) linkInvite();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
        if (error) {
          // Já existe conta com este e-mail: em vez de travar, muda para "entrar".
          if (/already|registered|exist/i.test(error.message)) {
            setMode("login");
            toast({ title: "Você já tem conta", description: "Entre com a senha que você já criou para aceitar o convite." });
            return;
          }
          throw error;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(/invalid/i.test(error.message) ? "Senha incorreta. Se não lembrar, use “Esqueci minha senha”." : error.message);
      }
      await linkInvite();
    } catch (err) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const esqueciSenha = async () => {
    if (!email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth` });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setResetEnviado(true);
  };

  if (!situacao || linking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {linking ? "Vinculando seu acesso..." : "Abrindo o convite..."}
        </div>
      </div>
    );
  }


  if (situacao.status !== "valido") {
    const textos: Record<string, [string, string]> = {
      vencido: ["Este convite venceu", "Peça a quem te convidou para renovar o convite. O mesmo link volta a funcionar."],
      cancelado: ["Este convite foi cancelado", "Peça um convite novo a quem te convidou."],
      aceito: ["Este convite já foi usado", "Seu acesso já está liberado. É só entrar com seu e-mail e senha."],
      invalido: ["Convite não encontrado", "Confira se o link está completo ou peça um convite novo."],
    };
    const [titulo, texto] = textos[situacao.status] ?? textos.invalido;
    return (
      <Moldura titulo={titulo} texto={texto} logo={branding.logo_url} nome={branding.product_name}>
        <Button asChild className="w-full"><Link to="/auth">Ir para o login</Link></Button>
      </Moldura>
    );
  }

  return (
    <Moldura
      logo={branding.logo_url}
      nome={branding.product_name}
      titulo={situacao.empresa ? `Convite da ${situacao.empresa}` : "Você foi convidado"}
      texto={mode === "signup"
        ? `Crie sua senha para entrar no ${branding.product_name}.`
        : `Você já tem conta com este e-mail. Entre com sua senha para aceitar o convite.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="invite-name">Nome completo</Label>
            <Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="invite-email">E-mail do convite</Label>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={!!situacao.email} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-password">Senha</Label>
          <Input id="invite-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={mode === "signup" ? 8 : undefined} required />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Enviando..." : mode === "signup" ? "Criar acesso" : "Entrar e aceitar"}
        </Button>
      </form>

      {mode === "login" && (
        resetEnviado
          ? <p className="mt-4 text-center text-sm text-muted-foreground">Enviamos um link para {email}. Crie a nova senha e depois abra este convite de novo.</p>
          : <button type="button" onClick={esqueciSenha} className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground">Esqueci minha senha</button>
      )}
      {!situacao.conta_existe && (
        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          className="mt-2 w-full text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signup" ? "Já tenho conta" : "Ainda não tenho conta"}
        </button>
      )}
    </Moldura>
  );
};

export default AcceptInvite;
