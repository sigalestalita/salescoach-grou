import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";

// Animated bar chart component
const AnimatedBarChart = () => {
  const bars = [
    { height: 40, delay: 0 },
    { height: 65, delay: 0.2 },
    { height: 50, delay: 0.4 },
    { height: 80, delay: 0.6 },
    { height: 55, delay: 0.8 },
    { height: 90, delay: 1.0 },
    { height: 70, delay: 1.2 },
  ];

  return (
    <div className="flex items-end gap-2 h-28">
      {bars.map((bar, i) => (
        <div
          key={i}
          className="w-4 rounded-t bg-gradient-to-t from-orange-500 to-orange-300 opacity-0"
          style={{
            height: `${bar.height}%`,
            animation: `barGrow 0.6s ease-out ${bar.delay}s forwards, barPulse 3s ease-in-out ${bar.delay + 0.6}s infinite`,
          }}
        />
      ))}
    </div>
  );
};

// Animated line chart using SVG
const AnimatedLineChart = () => (
  <svg viewBox="0 0 200 80" className="w-full h-20 overflow-visible">
    <defs>
      <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="hsl(24, 100%, 50%)" stopOpacity="0.3" />
        <stop offset="100%" stopColor="hsl(24, 100%, 60%)" stopOpacity="0.8" />
      </linearGradient>
      <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="hsl(24, 100%, 55%)" stopOpacity="0.3" />
        <stop offset="100%" stopColor="hsl(24, 100%, 55%)" stopOpacity="0" />
      </linearGradient>
    </defs>
    <path
      d="M0,60 Q20,55 40,45 T80,30 T120,40 T160,20 T200,10"
      fill="none"
      stroke="url(#lineGrad)"
      strokeWidth="2"
      className="auth-line-draw"
    />
    <path
      d="M0,60 Q20,55 40,45 T80,30 T120,40 T160,20 T200,10 L200,80 L0,80 Z"
      fill="url(#areaGrad)"
      className="auth-area-fade"
    />
    {[
      { cx: 0, cy: 60 },
      { cx: 40, cy: 45 },
      { cx: 80, cy: 30 },
      { cx: 120, cy: 40 },
      { cx: 160, cy: 20 },
      { cx: 200, cy: 10 },
    ].map((dot, i) => (
      <circle
        key={i}
        cx={dot.cx}
        cy={dot.cy}
        r="3"
        fill="hsl(24, 100%, 55%)"
        className="opacity-0"
        style={{ animation: `dotAppear 0.3s ease-out ${0.3 + i * 0.15}s forwards` }}
      />
    ))}
  </svg>
);

// Floating metric cards
const FloatingMetric = ({
  label,
  value,
  delay,
}: {
  label: string;
  value: string;
  delay: number;
}) => (
  <div
    className="bg-sidebar-accent/50 backdrop-blur-sm rounded-lg px-4 py-3 border border-sidebar-border opacity-0"
    style={{ animation: `floatUp 0.5s ease-out ${delay}s forwards, floatBob 4s ease-in-out ${delay + 0.5}s infinite` }}
  >
    <div className="text-xs text-sidebar-foreground/50">{label}</div>
    <div className="text-lg font-bold text-orange-400">{value}</div>
  </div>
);

// Animated ring / donut
const AnimatedRing = () => (
  <svg viewBox="0 0 80 80" className="w-20 h-20">
    <circle cx="40" cy="40" r="30" fill="none" stroke="hsl(var(--sidebar-accent))" strokeWidth="6" />
    <circle
      cx="40"
      cy="40"
      r="30"
      fill="none"
      stroke="hsl(24, 100%, 55%)"
      strokeWidth="6"
      strokeLinecap="round"
      strokeDasharray="188.5"
      strokeDashoffset="188.5"
      transform="rotate(-90 40 40)"
      className="auth-ring-fill"
    />
    <text x="40" y="44" textAnchor="middle" fill="hsl(24, 100%, 55%)" fontSize="14" fontWeight="bold" className="opacity-0" style={{ animation: "dotAppear 0.3s ease-out 1.2s forwards" }}>
      82
    </text>
  </svg>
);

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
      {/* Left panel - branding with animated charts */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar flex-col justify-center items-center p-12 relative overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: "linear-gradient(hsl(var(--sidebar-foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--sidebar-foreground)) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        <div className="max-w-md text-center space-y-6 relative z-10">
          <div className="flex justify-center mb-4">
            <img src={logo} alt="Sales Coach" className="h-16 object-contain opacity-0" style={{ animation: "floatUp 0.6s ease-out 0s forwards" }} />
          </div>
          <h1 className="text-4xl font-bold text-primary-foreground opacity-0" style={{ animation: "floatUp 0.6s ease-out 0.1s forwards" }}>
            Sales Coach
          </h1>
          <p className="text-base text-primary-foreground/60 opacity-0" style={{ animation: "floatUp 0.6s ease-out 0.2s forwards" }}>
            Análise inteligente de reuniões comerciais com IA avançada
          </p>

          {/* Animated charts area */}
          <div className="mt-10 space-y-6">
            {/* Metrics row */}
            <div className="grid grid-cols-3 gap-3">
              <FloatingMetric label="Score Médio" value="82%" delay={0.4} />
              <FloatingMetric label="Reuniões" value="147" delay={0.6} />
              <FloatingMetric label="Hot Rate" value="34%" delay={0.8} />
            </div>

            {/* Line chart + Ring */}
            <div className="flex items-center gap-6 opacity-0" style={{ animation: "floatUp 0.5s ease-out 1s forwards" }}>
              <div className="flex-1">
                <div className="text-xs text-sidebar-foreground/40 mb-2 text-left">Evolução de Performance</div>
                <AnimatedLineChart />
              </div>
              <div className="flex flex-col items-center gap-1">
                <AnimatedRing />
                <span className="text-[10px] text-sidebar-foreground/40">Score</span>
              </div>
            </div>

            {/* Bar chart */}
            <div className="opacity-0" style={{ animation: "floatUp 0.5s ease-out 0.6s forwards" }}>
              <div className="text-xs text-sidebar-foreground/40 mb-2 text-left">Reuniões por dia</div>
              <AnimatedBarChart />
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
