import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import fullLogo from "@/assets/salescoach-logo.png";
import markWhite from "@/assets/salescoach-mark-white.png";
import { useBranding } from "@/contexts/BrandingContext";

/**
 * Tela de login.
 *
 * Painel esquerdo em branco com o logotipo completo e uma vinheta animada em
 * navy; painel direito com o gradiente da marca e o formulário em um cartão
 * branco. Quando a organização tem logo próprio, ele substitui o da plataforma.
 */

const slides = [
  {
    title: "Evolução do time",
    content: (
      <svg viewBox="0 0 200 80" className="h-24 w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--brand-navy))" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="ag1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.18" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0,60 Q20,55 40,45 T80,30 T120,40 T160,20 T200,10" fill="none" stroke="url(#lg1)" strokeWidth="2.5" className="auth-line-draw" />
        <path d="M0,60 Q20,55 40,45 T80,30 T120,40 T160,20 T200,10 L200,80 L0,80 Z" fill="url(#ag1)" className="auth-area-fade" />
        {[{ cx: 0, cy: 60 }, { cx: 40, cy: 45 }, { cx: 80, cy: 30 }, { cx: 120, cy: 40 }, { cx: 160, cy: 20 }, { cx: 200, cy: 10 }].map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r="3" fill="hsl(var(--primary))" className="opacity-0" style={{ animation: `dotAppear 0.3s ease-out ${0.3 + i * 0.15}s forwards` }} />
        ))}
      </svg>
    ),
  },
  {
    title: "Score por executivo",
    content: (
      <div className="flex h-28 items-end justify-start gap-2">
        {[40, 65, 50, 80, 55, 90, 70].map((h, i) => (
          <div
            key={i}
            className="w-5 rounded-t-sm bg-brand-gradient opacity-0"
            style={{
              height: `${h}%`,
              animation: `barGrow 0.6s ease-out ${i * 0.12}s forwards, barPulse 3s ease-in-out ${i * 0.12 + 0.6}s infinite`,
            }}
          />
        ))}
      </div>
    ),
  },
  {
    title: "Qualificação da agenda",
    content: (
      <div className="flex justify-start">
        <svg viewBox="0 0 80 80" className="h-24 w-24" aria-hidden="true">
          <circle cx="40" cy="40" r="30" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
          <circle cx="40" cy="40" r="30" fill="none" stroke="hsl(var(--primary))" strokeWidth="6" strokeLinecap="round" strokeDasharray="188.5" strokeDashoffset="188.5" transform="rotate(-90 40 40)" className="auth-ring-fill" />
          <text x="40" y="45" textAnchor="middle" fill="hsl(var(--brand-navy))" fontSize="15" fontWeight="700" fontFamily="Poppins, sans-serif" className="opacity-0" style={{ animation: "dotAppear 0.3s ease-out 1s forwards" }}>82</text>
        </svg>
      </div>
    ),
  },
  {
    title: "Métricas que orientam",
    content: (
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Talk ratio", value: "42%" },
          { label: "Perguntas", value: "18" },
          { label: "Temperatura", value: "Quente" },
        ].map((m, i) => (
          <div key={i} className="rounded-md border border-border bg-card px-3 py-3 text-left opacity-0 shadow-sm" style={{ animation: `floatUp 0.4s ease-out ${i * 0.15}s forwards` }}>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{m.label}</div>
            <div className="mt-0.5 text-lg font-semibold text-foreground">{m.value}</div>
          </div>
        ))}
      </div>
    ),
  },
];

const SLIDE_DURATION = 4500;

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideState, setSlideState] = useState<"in" | "out">("in");
  const { toast } = useToast();
  const navigate = useNavigate();
  const { branding } = useBranding();
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setSlideState("out");
      setTimeout(() => {
        setCurrentSlide((prev) => (prev + 1) % slides.length);
        setSlideState("in");
      }, 400);
    }, SLIDE_DURATION);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (!roleData) {
        // Conta válida que ainda não foi vinculada a uma organização.
        navigate("/sem-organizacao");
        return;
      }

      navigate(roleData.role === "vendedor" ? "/agendas" : "/");
    } catch (error: any) {
      toast({ title: "Não foi possível entrar", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      toast({
        title: "Informe seu email",
        description: "Preencha o campo de email para receber o link de redefinição.",
        variant: "destructive",
      });
      return;
    }
    setResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast({
        title: "Link enviado",
        description: "Se existir uma conta com este email, o link de redefinição chegará em instantes.",
      });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const slide = slides[currentSlide];
  const hasOwnLogo = !!branding.logo_url;
  const headline = branding.login_headline ?? branding.product_name;
  const subheadline = branding.login_subheadline ?? "Análise inteligente de reuniões comerciais com IA";

  return (
    <div className="flex min-h-screen">
      {/* Painel de marca */}
      <div className="relative hidden flex-col justify-center bg-card px-14 py-12 lg:flex lg:w-[52%]">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8">
            <img
              src={hasOwnLogo ? branding.logo_url! : fullLogo}
              alt={branding.product_name}
              className={hasOwnLogo ? "h-16 object-contain" : "h-40 w-auto object-contain"}
            />
            {hasOwnLogo && (
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground">{headline}</h1>
            )}
          </div>

          <p className="max-w-sm text-[15px] leading-relaxed text-muted-foreground">{subheadline}</p>

          {/* Vinheta */}
          <div className="mt-12 min-h-[190px]">
            <div
              key={currentSlide}
              className={`space-y-4 transition-all duration-300 ${
                slideState === "in" ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {slide.title}
              </div>
              {slide.content}
            </div>

            <div className="mt-6 flex gap-1.5" aria-hidden="true">
              {slides.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i === currentSlide ? "w-6 bg-primary" : "w-1.5 bg-border"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="absolute bottom-6 left-14 text-[11px] text-muted-foreground/70">
          {branding.product_name} · {new Date().getFullYear()}
        </p>
      </div>

      {/* Painel de acesso */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-brand-gradient px-5 py-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/[0.06] blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-white/[0.05] blur-3xl"
        />

        <div className="relative w-full max-w-[400px]">
          {/* Marca compacta: só em telas sem o painel esquerdo */}
          <div className="mb-6 flex items-center justify-center gap-2.5 lg:hidden">
            <img src={branding.logo_url ?? markWhite} alt="" className="h-8 w-8 object-contain" />
            <span className="text-lg font-semibold text-white">{branding.product_name}</span>
          </div>

          <div className="auth-card-in rounded-lg border border-white/10 bg-card p-7 shadow-[0_24px_60px_-20px_rgba(7,26,52,0.55)] sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Entrar</h2>
              <p className="mt-1 text-sm text-muted-foreground">Acesse sua conta para analisar reuniões.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[13px] font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  className="h-10"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[13px] font-medium">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10"
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="h-10 w-full font-semibold" disabled={loading}>
                {loading ? "Entrando..." : "Entrar"}
              </Button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resetting}
                className="w-full text-[13px] font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                {resetting ? "Enviando..." : "Esqueci minha senha"}
              </button>
            </form>
          </div>

          {branding.support_email && (
            <p className="mt-5 text-center text-xs text-white/70">
              Precisa de ajuda?{" "}
              <a href={`mailto:${branding.support_email}`} className="font-medium text-white underline-offset-2 hover:underline">
                {branding.support_email}
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
