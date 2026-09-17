import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import mark from "@/assets/salescoach-mark.png";
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
      <div className="flex h-28 items-end justify-center gap-2">
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
      <div className="flex justify-center">
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

  // Parallax discreto: as esferas de luz seguem o mouse dentro do painel.
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", String(((e.clientX - r.left) / r.width - 0.5) * 2));
      el.style.setProperty("--my", String(((e.clientY - r.top) / r.height - 0.5) * 2));
    };
    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, []);

  const slide = slides[currentSlide];
  const hasOwnLogo = !!branding.logo_url;
  const headline = branding.login_headline ?? branding.product_name;
  const subheadline = branding.login_subheadline ?? "Análise inteligente de reuniões comerciais com IA";

  return (
    <div className="flex min-h-screen">
      {/* Painel de marca */}
      <div className="relative hidden flex-col items-center justify-center bg-card px-12 py-12 lg:flex lg:w-1/2">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          {/* Símbolo: revelado por varredura, depois flutua com um brilho que respira */}
          <div className="brand-stage brand-mark-float mb-6">
            <div className="brand-glow" aria-hidden="true" />
            <img
              src={hasOwnLogo ? branding.logo_url! : mark}
              alt={branding.product_name}
              className={`brand-mark object-contain ${hasOwnLogo ? "h-24 w-auto" : "h-28 w-28"}`}
            />
            <div className="brand-sweep" aria-hidden="true" />
          </div>

          {/* Nome: duas palavras, duas entradas */}
          <h1 className="text-[44px] leading-none text-foreground" aria-label={headline}>
            {hasOwnLogo ? (
              <span className="brand-word brand-word-1 font-semibold tracking-tight">{headline}</span>
            ) : (
              <>
                <span className="brand-word brand-word-1 font-extrabold">Sales</span>
                <span className="brand-word brand-word-2 font-light">&nbsp;Coach</span>
              </>
            )}
          </h1>

          <p className="brand-tagline mt-5 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            {subheadline}
          </p>

          {/* Vinheta */}
          <div className="brand-vignette mt-12 min-h-[190px] w-full">
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

            <div className="mt-6 flex justify-center gap-1.5" aria-hidden="true">
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

        <p className="absolute bottom-6 text-[11px] text-muted-foreground/70">
          {branding.product_name} · {new Date().getFullYear()}
        </p>
      </div>

      {/* Painel de acesso */}
      <div
        ref={stageRef}
        className="aurora-bg relative flex flex-1 items-center justify-center overflow-hidden px-5 py-10"
      >
        <div className="dot-grid" aria-hidden="true" />
        <div className="orb -right-24 -top-24 h-[420px] w-[420px] bg-[hsl(214_80%_60%/0.35)]" aria-hidden="true" />
        <div className="orb orb-2 -bottom-32 -left-20 h-[380px] w-[380px] bg-[hsl(200_90%_70%/0.22)]" aria-hidden="true" />
        <div className="orb orb-3 left-1/2 top-1/3 h-[260px] w-[260px] bg-[hsl(230_70%_65%/0.18)]" aria-hidden="true" />
        <div className="scan-line" aria-hidden="true" />

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
