import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { Calendar, TrendingUp, Thermometer, Users, Target, BarChart3, MessageSquare } from "lucide-react";

interface DashboardData {
  totalMeetings: number;
  completedMeetings: number;
  avgScore: number | null;
  hotRate: number;
  tempDistribution: { name: string; value: number; color: string }[];
  sellerRanking: { name: string; avgScore: number; meetings: number }[];
  scoreEvolution: { date: string; score: number }[];
  avgBant: { key: string; label: string; avg: number }[];
  avgMeddic: { key: string; label: string; avg: number }[];
  avgSpin: { key: string; label: string; avg: number }[];
  avgTalkRatio: { seller: number; lead: number } | null;
  activeSellers: number;
}

const TEMP_COLORS: Record<string, string> = {
  quente: "hsl(var(--destructive))",
  morno: "hsl(var(--warning, 38 92% 50%))",
  frio: "hsl(var(--info, 210 100% 50%))",
};

const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [meetingsRes, analysisRes, profilesRes] = await Promise.all([
        supabase.from("meetings").select("id, status, temperature, overall_score, seller_id, meeting_date"),
        supabase.from("analysis_results").select("meeting_id, overall_score, temperature, bant_score, meddic_score, spin_score, talk_ratio, created_at"),
        supabase.from("profiles").select("user_id, full_name"),
      ]);

      const meetings = meetingsRes.data || [];
      const analyses = analysisRes.data || [];
      const profiles = profilesRes.data || [];

      const profileMap = new Map(profiles.map(p => [p.user_id, p.full_name || "Sem nome"]));

      const completed = meetings.filter(m => m.status === "completo");
      const totalMeetings = meetings.length;
      const completedMeetings = completed.length;

      // Deduplicate analyses per meeting (take latest)
      const latestAnalysis = new Map<string, typeof analyses[0]>();
      for (const a of analyses) {
        const existing = latestAnalysis.get(a.meeting_id);
        if (!existing || a.created_at > existing.created_at) {
          latestAnalysis.set(a.meeting_id, a);
        }
      }
      const uniqueAnalyses = Array.from(latestAnalysis.values());

      // Average score
      const scores = uniqueAnalyses.filter(a => a.overall_score != null).map(a => Number(a.overall_score));
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;

      // Temperature distribution
      const tempCounts = { quente: 0, morno: 0, frio: 0 };
      for (const m of completed) {
        if (m.temperature && m.temperature in tempCounts) {
          tempCounts[m.temperature as keyof typeof tempCounts]++;
        }
      }
      const hotRate = completedMeetings > 0 ? Math.round((tempCounts.quente / completedMeetings) * 100) : 0;
      const tempDistribution = [
        { name: "Quente", value: tempCounts.quente, color: TEMP_COLORS.quente },
        { name: "Morno", value: tempCounts.morno, color: TEMP_COLORS.morno },
        { name: "Frio", value: tempCounts.frio, color: TEMP_COLORS.frio },
      ].filter(t => t.value > 0);

      // Seller ranking
      const sellerData = new Map<string, { scores: number[]; count: number }>();
      for (const m of completed) {
        if (!sellerData.has(m.seller_id)) sellerData.set(m.seller_id, { scores: [], count: 0 });
        const sd = sellerData.get(m.seller_id)!;
        sd.count++;
        if (m.overall_score != null) sd.scores.push(Number(m.overall_score));
      }
      const sellerRanking = Array.from(sellerData.entries())
        .map(([sid, d]) => ({
          name: profileMap.get(sid) || sid.slice(0, 8),
          avgScore: d.scores.length > 0 ? Math.round(d.scores.reduce((s, v) => s + v, 0) / d.scores.length) : 0,
          meetings: d.count,
        }))
        .sort((a, b) => b.avgScore - a.avgScore);

      const activeSellers = sellerData.size;

      // Score evolution (by month)
      const monthlyScores = new Map<string, number[]>();
      for (const a of uniqueAnalyses) {
        if (a.overall_score == null) continue;
        const date = new Date(a.created_at);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        if (!monthlyScores.has(key)) monthlyScores.set(key, []);
        monthlyScores.get(key)!.push(Number(a.overall_score));
      }
      const scoreEvolution = Array.from(monthlyScores.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, s]) => ({
          date: new Date(date + "-01").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
          score: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
        }));

      // Average framework scores
      const avgBant = computeAvgFramework(uniqueAnalyses, "bant_score", [
        { key: "budget", label: "Orçamento" },
        { key: "authority", label: "Autoridade" },
        { key: "need", label: "Necessidade" },
        { key: "timeline", label: "Prazo" },
      ], 25);

      const avgMeddic = computeAvgFramework(uniqueAnalyses, "meddic_score", [
        { key: "metrics", label: "Métricas" },
        { key: "economic_buyer", label: "Decisor Econômico" },
        { key: "decision_criteria", label: "Critérios de Decisão" },
        { key: "decision_process", label: "Processo de Decisão" },
        { key: "identify_pain", label: "Identificar Dor" },
        { key: "champion", label: "Champion" },
      ], 17);

      const avgSpin = computeAvgFramework(uniqueAnalyses, "spin_score", [
        { key: "situacao", label: "Situação" },
        { key: "problema", label: "Problema" },
        { key: "implicacao", label: "Implicação" },
        { key: "necessidade", label: "Necessidade" },
      ], 25);

      // Average talk ratio
      const talkRatios = uniqueAnalyses
        .filter(a => a.talk_ratio && typeof a.talk_ratio === "object")
        .map(a => a.talk_ratio as any);
      const avgTalkRatio = talkRatios.length > 0
        ? {
            seller: Math.round(talkRatios.reduce((s: number, t: any) => s + (t.seller || 0), 0) / talkRatios.length),
            lead: Math.round(talkRatios.reduce((s: number, t: any) => s + (t.lead || 0), 0) / talkRatios.length),
          }
        : null;

      setData({
        totalMeetings, completedMeetings, avgScore, hotRate, tempDistribution,
        sellerRanking, scoreEvolution, avgBant, avgMeddic, avgSpin, avgTalkRatio, activeSellers,
      });
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-12 text-muted-foreground">Erro ao carregar dados</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do desempenho das reuniões comerciais</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Agendas</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalMeetings}</div>
            <p className="text-xs text-muted-foreground">{data.completedMeetings} analisadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Score Médio</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.avgScore ?? "--"}</div>
            <p className="text-xs text-muted-foreground">de 100 pontos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reuniões Quentes</CardTitle>
            <Thermometer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.hotRate}%</div>
            <p className="text-xs text-muted-foreground">Taxa de agendas quentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendedores Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.activeSellers}</div>
            <p className="text-xs text-muted-foreground">Com agendas analisadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Score Evolution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4" />
              Evolução de Scores
            </CardTitle>
            <CardDescription>Score médio mensal do time</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {data.scoreEvolution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.scoreEvolution}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} className="text-xs" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} name="Score Médio" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>Envie sua primeira agenda para ver os gráficos</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Temperature Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Thermometer className="h-4 w-4" />
              Temperatura das Agendas
            </CardTitle>
            <CardDescription>Distribuição Frio / Morno / Quente</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {data.tempDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.tempDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                    {data.tempDistribution.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Thermometer className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>Dados aparecerão após análises</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Framework Averages */}
      <div className="grid gap-4 md:grid-cols-3">
        <FrameworkCard title="BANT Médio" items={data.avgBant} maxValue={25} />
        <FrameworkCard title="MEDDIC Médio" items={data.avgMeddic} maxValue={17} />
        <FrameworkCard title="SPIN Médio" items={data.avgSpin} maxValue={25} />
      </div>

      {/* Talk Ratio + Ranking */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Average Talk Ratio */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4" />
              Talk Ratio Médio
            </CardTitle>
            <CardDescription>Proporção média de fala vendedor vs lead</CardDescription>
          </CardHeader>
          <CardContent>
            {data.avgTalkRatio ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Vendedor: {data.avgTalkRatio.seller}%</span>
                    <span>Lead: {data.avgTalkRatio.lead}%</span>
                  </div>
                  <Progress value={data.avgTalkRatio.seller} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.avgTalkRatio.seller > 60
                    ? "⚠️ Vendedores estão falando mais que o recomendado. O ideal é ouvir mais o lead."
                    : data.avgTalkRatio.seller < 40
                    ? "✅ Boa escuta ativa! Os vendedores estão dando espaço para o lead."
                    : "👍 Proporção equilibrada de fala."}
                </p>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-4">Sem dados</div>
            )}
          </CardContent>
        </Card>

        {/* Seller Ranking */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4" />
              Ranking de Vendedores
            </CardTitle>
            <CardDescription>Performance por vendedor</CardDescription>
          </CardHeader>
          <CardContent>
            {data.sellerRanking.length > 0 ? (
              <div className="space-y-3">
                {data.sellerRanking.map((seller, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground w-6">{idx + 1}°</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium truncate">{seller.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{seller.meetings} agendas</Badge>
                          <span className="text-sm font-bold text-primary">{seller.avgScore}</span>
                        </div>
                      </div>
                      <Progress value={seller.avgScore} className="h-1.5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-4">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>Ranking aparecerá após análises</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function FrameworkCard({ title, items, maxValue }: { title: string; items: { key: string; label: string; avg: number }[]; maxValue: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>Média do time</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>{item.label}</span>
                <span>{item.avg}/{maxValue}</span>
              </div>
              <Progress value={(item.avg / maxValue) * 100} className="h-1.5" />
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Sem dados</p>
        )}
      </CardContent>
    </Card>
  );
}

function computeAvgFramework(
  analyses: any[],
  field: string,
  keys: { key: string; label: string }[],
  maxValue: number,
) {
  const validAnalyses = analyses.filter(a => a[field] && typeof a[field] === "object");
  if (validAnalyses.length === 0) return [];

  return keys.map(({ key, label }) => {
    const values = validAnalyses
      .map(a => {
        const v = (a[field] as any)?.[key];
        if (typeof v === "number") return v;
        if (v && typeof v === "object" && "score" in v) return Number(v.score);
        return null;
      })
      .filter((v): v is number => v !== null && !isNaN(v));
    const avg = values.length > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0;
    return { key, label, avg };
  });
}

export default Dashboard;
