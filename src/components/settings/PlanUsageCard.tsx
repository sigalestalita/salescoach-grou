import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CreditCard } from "lucide-react";

/**
 * Plano e consumo do ciclo atual.
 *
 * As métricas são as operações que custam dinheiro: minutos transcritos,
 * análises, dicas ao vivo, gerações de argumento e tokens de LLM.
 */

const METRIC_LABELS: Record<string, string> = {
  transcricao: "Minutos transcritos",
  live_transcricao: "Minutos ao vivo",
  analise: "Análises",
  live_coach: "Dicas ao vivo",
  generate_arguments: "Gerações de argumento",
  extracao_documento: "Documentos processados",
  storage: "Armazenamento (bytes)",
  tokens: "Tokens de IA",
  cost_usd: "Custo estimado (US$)",
};

interface UsageEntry {
  metric: string;
  used: number;
  limit: number | null;
}

export const PlanUsageCard = () => {
  const { orgId, role } = useAuth();
  const [planName, setPlanName] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;

    const load = async () => {
      const [subRes, quotaRes] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("status, current_period_end, plans(name)")
          .eq("org_id", orgId)
          .maybeSingle(),
        supabase.rpc("org_quota_status", { _org_id: orgId }),
      ]);

      if (subRes.data) {
        setStatus(subRes.data.status);
        setPeriodEnd(subRes.data.current_period_end);
        const plan = subRes.data.plans as { name?: string } | null;
        setPlanName(plan?.name ?? null);
      }

      const quota = (quotaRes.data ?? {}) as Record<string, { used: number; limit: number | null }>;
      setUsage(
        Object.entries(quota)
          .map(([metric, value]) => ({
            metric,
            used: Number(value?.used ?? 0),
            limit: value?.limit === null || value?.limit === undefined ? null : Number(value.limit),
          }))
          .filter((entry) => entry.used > 0 || entry.limit !== null)
          .sort((a, b) => a.metric.localeCompare(b.metric)),
      );

      setLoading(false);
    };

    load();
  }, [orgId]);

  if (role !== "admin" && role !== "gestor") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" />
          Plano e consumo
        </CardTitle>
        <CardDescription>
          Uso do ciclo atual{periodEnd ? ` — fecha em ${new Date(periodEnd).toLocaleDateString("pt-BR")}` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm">Plano</span>
          <div className="flex items-center gap-2">
            {planName ? <Badge>{planName}</Badge> : <Badge variant="secondary">Sem plano</Badge>}
            {status && <Badge variant="outline">{status}</Badge>}
          </div>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Carregando consumo...</p>}

        {!loading && usage.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum consumo registrado neste ciclo.</p>
        )}

        <div className="space-y-3">
          {usage.map((entry) => {
            const label = METRIC_LABELS[entry.metric] ?? entry.metric;
            const value = entry.metric === "cost_usd" ? entry.used.toFixed(2) : Math.round(entry.used);
            return (
              <div key={entry.metric} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {value}
                    {entry.limit !== null ? ` / ${entry.limit}` : " · sem limite"}
                  </span>
                </div>
                {entry.limit !== null && entry.limit > 0 && (
                  <Progress value={Math.min(100, (entry.used / entry.limit) * 100)} />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
