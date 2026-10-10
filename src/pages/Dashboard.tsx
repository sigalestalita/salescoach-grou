import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgConfig } from "@/hooks/useOrgConfig";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { Calendar, TrendingUp, Thermometer, Users, Target, BarChart3, MessageSquare } from "lucide-react";

interface DashboardData {
  totalMeetings: number;
  completedMeetings: number;
  avgScore: number | null;
  hotRate: number;
  tempDistribution: { name: string; value: number; color: string }[];
  sellerRanking: { name: string; avgScore: number; meetings: number }[];
  scoreEvolution: Record<string, any>[];
  scoreEvolutionSellers: string[];
  avgBant: { key: string; label: string; avg: number }[];
  avgMeddic: { key: string; label: string; avg: number }[];
  avgSpin: { key: string; label: string; avg: number }[];
  avgTalkRatio: { seller: number; lead: number } | null;
  activeSellers: number;
}

interface SellerOption {
  id: string;
  name: string;
}

// Da faixa mais quente para a mais fria. Funciona com qualquer quantidade de
// faixas configuradas pela organização.
const TEMP_PALETTE: string[] = [
  "hsl(4 66% 42%)",
  "hsl(var(--temp-hot))",
  "hsl(var(--temp-warm))",
  "hsl(var(--temp-cold))",
  "hsl(220 8% 70%)",
];

// Séries por executivo: matizes distintos em luminosidade parecida, ancorados
// no azul da marca, legíveis sobre fundo claro.
const SERIES_PALETTE: string[] = [
  "hsl(214 74% 40%)",
  "hsl(174 58% 34%)",
  "hsl(28 80% 44%)",
  "hsl(280 45% 48%)",
  "hsl(340 60% 46%)",
  "hsl(150 50% 36%)",
  "hsl(196 70% 40%)",
  "hsl(45 70% 40%)",
];

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  boxShadow: "0 8px 24px -12px hsl(var(--shadow-color) / 0.25)",
  color: "hsl(var(--foreground))",
  fontSize: "12px",
  padding: "8px 10px",
};

const AXIS_PROPS = { axisLine: false, tickLine: false, tick: { fontSize: 11, fill: "hsl(var(--muted-foreground))" } } as const;

const Dashboard = () => {
  // Metodologia e faixas de temperatura vêm da configuração da organização.
  const { config } = useOrgConfig();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<string>("all");

  useEffect(() => {
    fetchDashboardData();
  // Refaz o cálculo quando a configuração da organização chega, para que os
  // critérios e faixas usados sejam os do cliente e não os padrões.
  }, [selectedSeller, config]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [meetingsRes, analysisRes, profilesRes] = await Promise.all([
        supabase.from("meetings").select("id, status, temperature, overall_score, seller_id, meeting_date"),
        supabase.from("analysis_results").select("meeting_id, overall_score, temperature, bant_score, meddic_score, spin_score, talk_ratio, created_at"),
        supabase.from("profiles").select("user_id, full_name"),
      ]);

      const allMeetings = meetingsRes.data || [];
      const analyses = analysisRes.data || [];
      const profiles = profilesRes.data || [];

      const profileMap = new Map(profiles.map(p => [p.user_id, p.full_name || "Sem nome"]));

      // Build seller options (only once or when data changes)
      const uniqueSellers = new Map<string, string>();
      for (const m of allMeetings) {
        if (!uniqueSellers.has(m.seller_id)) {
          uniqueSellers.set(m.seller_id, profileMap.get(m.seller_id) || "Vendedor desconhecido");
        }
      }
      const sellerOptions = Array.from(uniqueSellers.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setSellers(sellerOptions);

      // Filter meetings by selected seller
      const meetings = selectedSeller === "all"
        ? allMeetings
        : allMeetings.filter(m => m.seller_id === selectedSeller);

      const meetingIds = new Set(meetings.map(m => m.id));

      const completed = meetings.filter(m => m.status === "completo");
      const totalMeetings = meetings.length;
      const completedMeetings = completed.length;

      // Filter analyses to only matching meetings
      const filteredAnalyses = analyses.filter(a => meetingIds.has(a.meeting_id));

      // Deduplicate analyses per meeting (take latest)
      const latestAnalysis = new Map<string, typeof analyses[0]>();
      for (const a of filteredAnalyses) {
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
      const levels = config.temperatureLevels;
      const tempCounts: Record<string, number> = {};
      for (const level of levels) tempCounts[level.key] = 0;
      for (const m of completed) {
        if (m.temperature && m.temperature in tempCounts) {
          tempCounts[m.temperature]++;
        }
      }

      // "Quente" = faixas da metade superior da escala configurada.
      const hotKeys = levels.slice(Math.ceil(levels.length / 2)).map((l) => l.key);
      const hotCount = hotKeys.reduce((sum, key) => sum + (tempCounts[key] ?? 0), 0);
      const hotRate = completedMeetings > 0 ? Math.round((hotCount / completedMeetings) * 100) : 0;

      // Da faixa mais quente para a mais fria, com a paleta na mesma ordem.
      const tempDistribution = [...levels].reverse().map((level, idx, arr) => ({
        name: level.label,
        value: tempCounts[level.key] ?? 0,
        color: TEMP_PALETTE[Math.min(idx, TEMP_PALETTE.length - 1)] ?? TEMP_PALETTE[TEMP_PALETTE.length - 1],
      })).filter(t => t.value > 0);

      // Seller ranking (only when viewing all)
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

      const activeSellers = selectedSeller === "all" ? sellerData.size : (sellerData.size > 0 ? 1 : 0);

      // Score evolution (by month) — per seller when unfiltered
      const meetingSellerMap = new Map<string, string>();
      for (const m of allMeetings) {
        meetingSellerMap.set(m.id, m.seller_id);
      }

      // Group scores by month+seller
      const monthSellerScores = new Map<string, Map<string, number[]>>();
      const allMonths = new Set<string>();
      for (const a of uniqueAnalyses) {
        if (a.overall_score == null) continue;
        const date = new Date(a.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        allMonths.add(monthKey);
        const sellerId = meetingSellerMap.get(a.meeting_id) || "unknown";
        if (!monthSellerScores.has(monthKey)) monthSellerScores.set(monthKey, new Map());
        const sellerMap = monthSellerScores.get(monthKey)!;
        if (!sellerMap.has(sellerId)) sellerMap.set(sellerId, []);
        sellerMap.get(sellerId)!.push(Number(a.overall_score));
      }

      const sortedMonths = Array.from(allMonths).sort();
      const involvedSellers = new Set<string>();
      for (const sm of monthSellerScores.values()) {
        for (const sid of sm.keys()) involvedSellers.add(sid);
      }

      let scoreEvolution: Record<string, any>[];
      let scoreEvolutionSellers: string[];

      if (selectedSeller === "all" && involvedSellers.size > 1) {
        // Multi-seller: one line per seller
        scoreEvolutionSellers = Array.from(involvedSellers);
        scoreEvolution = sortedMonths.map(month => {
          const row: Record<string, any> = {
            date: new Date(month + "-01").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
          };
          const sellerMap = monthSellerScores.get(month);
          for (const sid of scoreEvolutionSellers) {
            const scores = sellerMap?.get(sid);
            row[sid] = scores ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
          }
          return row;
        });
      } else {
        // Single seller or filtered: single line
        scoreEvolutionSellers = [];
        scoreEvolution = sortedMonths.map(month => {
          const sellerMap = monthSellerScores.get(month)!;
          const all: number[] = [];
          for (const scores of sellerMap.values()) all.push(...scores);
          return {
            date: new Date(month + "-01").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
            score: Math.round(all.reduce((a, b) => a + b, 0) / all.length),
          };
        });
      }

      // Average framework scores
      const avgBant = computeAvgFramework(
        uniqueAnalyses,
        "bant_score",
        config.criteria.map((c) => ({ key: c.key, label: c.label })),
        config.maxCriterionScore,
      );


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
        sellerRanking, scoreEvolution, scoreEvolutionSellers, avgBant, avgMeddic, avgSpin, avgTalkRatio, activeSellers,
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

  const isFiltered = selectedSeller !== "all";
  const selectedSellerName = sellers.find(s => s.id === selectedSeller)?.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-medium tracking-[-0.025em]">Visão geral</h1>
          <p className="mt-1 text-muted-foreground">
            {isFiltered
              ? `Métricas individuais de ${selectedSellerName}`
              : "Visão geral do desempenho das reuniões comerciais"}
          </p>
        </div>
        <Select value={selectedSeller} onValueChange={setSelectedSeller}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filtrar vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os vendedores</SelectItem>
            {sellers.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 animate-stagger">
        <StatCard tone="navy" icon={Calendar} label="Total de Agendas" value={data.totalMeetings} hint={`${data.completedMeetings} analisadas`} />
        <StatCard tone="blue" icon={Target} label="Score Médio" value={data.avgScore ?? "--"} hint="de 100 pontos" />
        <StatCard tone="coral" icon={Thermometer} label="Reuniões Quentes" value={`${data.hotRate}%`} hint="Taxa de agendas quentes" />
        <StatCard
          tone="teal"
          icon={Users}
          label={isFiltered ? "Agendas Analisadas" : "Vendedores Ativos"}
          value={isFiltered ? data.completedMeetings : data.activeSellers}
          hint={isFiltered ? "deste vendedor" : "Com agendas analisadas"}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2 animate-stagger">
        {/* Score Evolution */}
        <Card className="glass-card card-hover-glow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4" />
              Evolução de Scores
            </CardTitle>
            <CardDescription>{isFiltered ? "Score mensal individual" : "Comparativo de scores médios por executivo"}</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {data.scoreEvolution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.scoreEvolution}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" {...AXIS_PROPS} dy={6} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} {...AXIS_PROPS} width={30} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: "hsl(var(--muted-foreground))" }} cursor={{ stroke: "hsl(var(--border))" }} />
                  {data.scoreEvolutionSellers.length > 0 ? (
                    <>
                      <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: "12px", paddingTop: "10px", color: "hsl(var(--muted-foreground))" }} />
                      {data.scoreEvolutionSellers.map((sid, idx) => {
                        const sellerName = sellers.find(s => s.id === sid)?.name || sid.slice(0, 8);
                        return (
                          <Line key={sid} type="monotone" dataKey={sid} stroke={SERIES_PALETTE[idx % SERIES_PALETTE.length]} strokeWidth={1.75} dot={false} activeDot={{ r: 3.5, strokeWidth: 0 }} name={sellerName} connectNulls />
                        );
                      })}
                    </>
                  ) : (
                    <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={1.75} dot={false} activeDot={{ r: 3.5, strokeWidth: 0 }} name="Score Médio" />
                  )}
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
        <Card className="glass-card card-hover-glow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Thermometer className="h-4 w-4" />
              Temperatura das Agendas
            </CardTitle>
            <CardDescription>
              Distribuição {config.methodologyLabel}: {config.temperatureLevels[0]?.label} → {config.temperatureLevels[config.temperatureLevels.length - 1]?.label}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {data.tempDistribution.length > 0 ? (
              <div className="flex h-full flex-col justify-center gap-6">
                {/* Barra única com a proporção de cada faixa, da mais quente à mais fria */}
                <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
                  {data.tempDistribution.map((t) => (
                    <div key={t.name} style={{ flexGrow: t.value, background: t.color }} title={`${t.name}: ${t.value}`} />
                  ))}
                </div>
                <ul className="space-y-2.5">
                  {data.tempDistribution.map((t) => {
                    const pct = Math.round((t.value / Math.max(1, data.tempDistribution.reduce((acc, t) => acc + t.value, 0))) * 100);
                    return (
                      <li key={t.name} className="flex items-center gap-3 text-[13px]">
                        <span className="status-dot h-2 w-2" style={{ background: t.color }} />
                        <span className="flex-1 text-foreground">{t.name}</span>
                        <span className="font-mono text-[12px] text-muted-foreground">{t.value}</span>
                        <span className="w-10 text-right font-mono text-[12px] tabular-nums text-foreground">{pct}%</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
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
      <div className="grid gap-4 md:grid-cols-3 animate-stagger">
        <FrameworkCard
          title={`${config.methodologyLabel} ${isFiltered ? "Individual" : "Médio"}`}
          items={data.avgBant}
          maxValue={config.maxCriterionScore}
        />
        <FrameworkCard title={isFiltered ? "MEDDIC Individual" : "MEDDIC Médio"} items={data.avgMeddic} maxValue={17} />
        <FrameworkCard title={isFiltered ? "SPIN Individual" : "SPIN Médio"} items={data.avgSpin} maxValue={25} />
      </div>

      {/* Talk Ratio + Ranking */}
      <div className="grid gap-4 md:grid-cols-2 animate-stagger">
        {/* Average Talk Ratio */}
        <Card className="glass-card card-hover-glow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4" />
              Talk Ratio {isFiltered ? "Individual" : "Médio"}
            </CardTitle>
            <CardDescription>{isFiltered ? "Proporção de fala deste vendedor" : "Proporção média de fala vendedor vs lead"}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.avgTalkRatio ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <div><div className="eyebrow">Vendedor</div><div className="metric mt-1 text-[26px] leading-none">{data.avgTalkRatio.seller}%</div></div>
                    <div className="text-right"><div className="eyebrow">Lead</div><div className="metric mt-1 text-[26px] leading-none text-muted-foreground">{data.avgTalkRatio.lead}%</div></div>
                  </div>
                  <Progress value={data.avgTalkRatio.seller} />
                </div>
                <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                  <span
                    className="status-dot"
                    style={{ background: data.avgTalkRatio.seller > 60 ? "hsl(var(--warning))" : "hsl(var(--success))" }}
                  />
                  {data.avgTalkRatio.seller > 60
                    ? "Vendedor falando mais que o recomendado. O ideal é ouvir mais o lead."
                    : data.avgTalkRatio.seller < 40
                    ? "Boa escuta ativa: o lead tem espaço para falar."
                    : "Proporção equilibrada de fala."}
                </p>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-4">Sem dados</div>
            )}
          </CardContent>
        </Card>

        {/* Seller Ranking */}
        <Card className="glass-card card-hover-glow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4" />
              {isFiltered ? "Resumo do Vendedor" : "Ranking de Vendedores"}
            </CardTitle>
            <CardDescription>{isFiltered ? "Performance individual" : "Performance por vendedor"}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.sellerRanking.length > 0 ? (
              <div className="space-y-3">
                {data.sellerRanking.map((seller, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    {!isFiltered && <span className="w-6 font-mono text-[12px] text-muted-foreground">{String(idx + 1).padStart(2, "0")}</span>}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium truncate">{seller.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-muted-foreground">{seller.meetings} agendas</span>
                          <span className="w-8 text-right font-mono text-[13px] font-medium tabular-nums text-foreground">{seller.avgScore}</span>
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
    <Card className="glass-card card-hover-glow">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Média das reuniões</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.key} className="space-y-1">
              <div className="flex justify-between text-[13px]">
                <span className="text-foreground">{item.label}</span>
                <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{item.avg}<span className="opacity-50">/{maxValue}</span></span>
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
