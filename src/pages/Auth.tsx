import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";

// --- Flashcard slides ---

const slides = [
  {
    title: "Crescimento contínuo",
    content: (
      <svg viewBox="0 0 200 80" className="w-full h-24 overflow-visible">
        <defs>
          <linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(24,100%,50%)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(24,100%,60%)" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="ag1" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(24,100%,55%)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(24,100%,55%)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0,60 Q20,55 40,45 T80,30 T120,40 T160,20 T200,10" fill="none" stroke="url(#lg1)" strokeWidth="2" className="auth-line-draw" />
        <path d="M0,60 Q20,55 40,45 T80,30 T120,40 T160,20 T200,10 L200,80 L0,80 Z" fill="url(#ag1)" className="auth-area-fade" />
        {[{ cx: 0, cy: 60 }, { cx: 40, cy: 45 }, { cx: 80, cy: 30 }, { cx: 120, cy: 40 }, { cx: 160, cy: 20 }, { cx: 200, cy: 10 }].map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r="3" fill="hsl(24,100%,55%)" className="opacity-0" style={{ animation: `dotAppear 0.3s ease-out ${0.3 + i * 0.15}s forwards` }} />
        ))}
      </svg>
    ),
  },
  {
    title: "Potencial da sua equipe",
    content: (
      <div className="flex items-end gap-2 h-28 justify-center">
        {[40, 65, 50, 80, 55, 90, 70].map((h, i) => (
          <div
            key={i}
            className="w-5 rounded-t bg-gradient-to-t from-orange-500 to-orange-300 opacity-0"
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
    title: "Performance geral",
    content: (
      <div className="flex justify-center">
        <svg viewBox="0 0 80 80" className="w-24 h-24">
          <circle cx="40" cy="40" r="30" fill="none" stroke="hsl(var(--sidebar-accent))" strokeWidth="6" />
          <circle cx="40" cy="40" r="30" fill="none" stroke="hsl(24,100%,55%)" strokeWidth="6" strokeLinecap="round" strokeDasharray="188.5" strokeDashoffset="188.5" transform="rotate(-90 40 40)" className="auth-ring-fill" />
          <text x="40" y="44" textAnchor="middle" fill="hsl(24,100%,55%)" fontSize="14" fontWeight="bold" className="opacity-0" style={{ animation: "dotAppear 0.3s ease-out 1s forwards" }}>A+</text>
        </svg>
      </div>
    ),
  },
  {
    title: "Métricas inteligentes",
    content: (
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Desempenho", value: "↑ 24%" },
          { label: "Insights", value: "∞" },
          { label: "Evolução", value: "A+" },
        ].map((m, i) => (
          <div key={i} className="bg-sidebar-accent/50 backdrop-blur-sm rounded-lg px-3 py-3 border border-sidebar-border opacity-0" style={{ animation: `floatUp 0.4s ease-out ${i * 0.15}s forwards` }}>
            <div className="text-xs text-sidebar-foreground/50">{m.label}</div>
            <div className="text-lg font-bold text-orange-400">{m.value}</div>
          </div>
        ))}
      </div>
    ),
  },
];

const SLIDE_DURATION = 4000;

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideState, setSlideState] = useState<"in" | "out">("in");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => {
      setSlideState("out");
      setTimeout(() => {
        setCurrentSlide((prev) => (prev + 1) % slides.length);
        setSlideState("in");
      }, 500);
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

  const slide = slides[currentSlide];

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar flex-col justify-center items-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: "linear-gradient(hsl(var(--sidebar-foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--sidebar-foreground)) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        <div className="max-w-md w-full text-center space-y-6 relative z-10">
          <div className="flex justify-center mb-4">
            <img src={logo} alt="Sales Coach" className="h-16 object-contain" />
          </div>
          <h1 className="text-4xl font-bold text-primary-foreground">Sales Coach</h1>
          <p className="text-base text-primary-foreground/60">
            Análise inteligente de reuniões comerciais com IA avançada
          </p>

          {/* Flashcard area */}
          <div className="mt-10 min-h-[200px] flex flex-col justify-center">
            <div
              key={currentSlide}
              className={`space-y-4 transition-all duration-500 ${
                slideState === "in"
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              }`}
            >
              <div className="text-xs text-sidebar-foreground/40 uppercase tracking-widest">
                {slide.title}
              </div>
              {slide.content}
            </div>

            {/* Dots indicator */}
            <div className="flex justify-center gap-2 mt-6">
              {slides.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === currentSlide
                      ? "w-6 bg-orange-400"
                      : "w-1.5 bg-sidebar-foreground/20"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Entrar</CardTitle>
            <CardDescription>Acesse sua conta para analisar reuniões</CardDescription>
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
