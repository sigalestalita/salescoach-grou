/* eslint-disable @typescript-eslint/no-explicit-any -- os campos JSON da análise chegam do banco sem esquema tipado */
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowRight, Check, Info, Minus } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { temperatureColor, temperatureLabels, useOrgConfig } from "@/hooks/useOrgConfig";
import { cn } from "@/lib/utils";

/**
 * Relatório da análise de uma reunião, usado no detalhe da agenda e no link
 * compartilhado. Uma leitura de cima para baixo: o veredito (nota,
 * temperatura, fala), o contexto da conversa, os critérios das metodologias,
 * o que fazer agora, a aderência ao material da empresa, os momentos-chave e
 * a transcrição.
 */

type Meeting = Tables<"meetings">;
type AnalysisResult = Tables<"analysis_results">;
type Transcription = Tables<"transcriptions">;
type Highlight = Tables<"highlights">;

const getMetricValue = (val: any): { score: number; reason?: string } => {
  if (val === null || val === undefined) return { score: 0 };
  if (typeof val === "number") return { score: val };
  if (typeof val === "object" && "score" in val) return { score: Number(val.score) || 0, reason: val.reason };
  return { score: Number(val) || 0 };
};

const asText = (v: any, ...keys: string[]) => {
  if (typeof v === "string") return v;
  for (const k of keys) if (v?.[k]) return String(v[k]);
  return JSON.stringify(v);
};

const TIPS = {
  score: "Avaliação geral da qualidade da reunião comercial, de 0 a 100. Considera técnica de vendas, qualificação do lead, rapport, identificação de dores e condução do processo comercial.",
  temperature: "Quão perto da compra o lead está, nas faixas configuradas pela sua operação: do lead sem perfil ao pronto para fechar.",
  talk: "Proporção de tempo de fala entre vendedor e lead. O ideal é o vendedor falar entre 30% e 50% do tempo, dando espaço para o lead expor as necessidades.",
  meddic: "Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain e Champion. Cada item vale até 17 pontos.",
  spin: "Situação, Problema, Implicação e Necessidade de solução. Cada dimensão vale até 25 pontos.",
  insights: "O que o vendedor fez bem e o que pode melhorar na próxima conversa.",
  coach: "Próximos passos para avançar a negociação e sugestões de abordagem.",
  rag: "Quanto a conversa usou o material da base de conhecimento: produtos citados, oportunidades perdidas e alinhamento do discurso.",
  highlights: "Momentos-chave da reunião: objeções, sinais de compra, dores e necessidades.",
};

const HIGHLIGHT_TYPES: Record<string, { label: string; color: string }> = {
  objecao: { label: "Objeção", color: "var(--destructive)" },
  sinal_compra: { label: "Sinal de compra", color: "var(--success)" },
  momento_chave: { label: "Momento-chave", color: "var(--primary)" },
  dor: { label: "Dor", color: "var(--warning)" },
  necessidade: { label: "Necessidade", color: "var(--info)" },
};

const SPIN_LABELS: Record<string, string> = { situacao: "Situação", problema: "Problema", implicacao: "Implicação", necessidade: "Necessidade" };
const MEDDIC_LABELS: Record<string, string> = {
  metrics: "Metrics", economic_buyer: "Economic Buyer", decision_criteria: "Decision Criteria",
  decision_process: "Decision Process", identify_pain: "Identify Pain", champion: "Champion",
};

export function MetricTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 shrink-0 cursor-help text-muted-foreground/60 hover:text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        <p>{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function SectionTitle({ children, tip }: { children: ReactNode; tip?: string }) {
  return (
    <CardTitle className="flex items-center gap-2">
      {children}
      {tip && <MetricTooltip text={tip} />}
    </CardTitle>
  );
}

function Criterion({ label, score, max, reason }: { label: string; score: number; max: number; reason?: string }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0;
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-foreground">{label}</span>
        <span className="font-mono text-[12px] tabular-nums text-foreground">
          {score}
          <span className="text-muted-foreground/60">/{max}</span>
        </span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary/85" style={{ width: `${pct}%` }} />
      </div>
      {reason && <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{reason}</p>}
    </div>
  );
}

function FrameworkCard({ title, tip, rows }: { title: string; tip?: string; rows: { key: string; label: string; score: number; max: number; reason?: string }[] | null }) {
  const total = rows?.reduce((s, r) => s + r.score, 0) ?? 0;
  const max = rows?.reduce((s, r) => s + r.max, 0) ?? 0;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <SectionTitle tip={tip}>{title}</SectionTitle>
        {rows && max > 0 && (
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
            {Math.round((total / max) * 100)}%
          </span>
        )}
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {rows ? rows.map((r) => <Criterion key={r.key} {...r} />) : <p className="text-[13px] text-muted-foreground">Sem dados</p>}
      </CardContent>
    </Card>
  );
}

function List({ items, icon, tone }: { items: string[]; icon: "check" | "minus" | "arrow"; tone?: string }) {
  const Icon = icon === "check" ? Check : icon === "minus" ? Minus : ArrowRight;
  return (
    <ul className="space-y-2.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-foreground">
          <Icon className="mt-[3px] h-3.5 w-3.5 shrink-0" style={{ color: tone ? `hsl(${tone})` : "hsl(var(--muted-foreground))" }} strokeWidth={2} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

const fmtTime = (s: number | null) => (s == null ? null : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

interface Props {
  meeting: Meeting;
  analysis: AnalysisResult;
  transcription: Transcription | null;
  highlights: Highlight[];
}

export function AnalysisReport({ meeting, analysis, transcription, highlights }: Props) {
  const { config } = useOrgConfig();
  const tempLabels = temperatureLabels(config.temperatureLevels);

  const bant = analysis.bant_score as any;
  const meddic = analysis.meddic_score as any;
  const spin = analysis.spin_score as any;
  const insights = analysis.insights as any;
  const salesCoach = analysis.sales_coach as any;
  const talkRatio = analysis.talk_ratio as any;
  const rag = analysis.rag_results as any;
  const raw = analysis.raw_analysis as any;
  const summary = raw?.meeting_summary;

  const score = analysis.overall_score;
  const temp = meeting.temperature;
  const levels = config.temperatureLevels;
  const tempIndex = levels.findIndex((l) => l.key === temp);

  const summaryRows: [string, ReactNode][] = summary
    ? ([
        ["Empresa", summary.company_name],
        ["Porte", summary.company_size],
        ["Participantes", summary.participants?.length ? summary.participants.map((p: any) => `${p.name}${p.role ? ` · ${p.role}` : ""}`).join(", ") : null],
        ["Produtos apresentados", summary.products_presented?.length ? summary.products_presented.join(", ") : null],
        ["Proposta", summary.proposal_value],
      ] as [string, ReactNode][]).filter(([, v]) => v)
    : [];

  return (
    <div className="space-y-4">
      {/* Veredito: nota, temperatura e fala lado a lado */}
      <Card className="grid overflow-hidden md:grid-cols-3 md:divide-x md:divide-border">
        <div className="p-5">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            Nota da reunião <MetricTooltip text={TIPS.score} />
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="metric text-[52px] font-light leading-none">{score ?? "—"}</span>
            <span className="font-mono text-[12px] text-muted-foreground">/100</span>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${score ?? 0}%` }} />
          </div>
          {raw?.overall_score_reason && <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{raw.overall_score_reason}</p>}
        </div>

        <div className="border-t border-border p-5 md:border-t-0">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            Temperatura <MetricTooltip text={TIPS.temperature} />
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <span className="status-dot h-2.5 w-2.5" style={{ background: temperatureColor(temp, levels) }} />
            <span className="text-[26px] font-normal leading-none tracking-[-0.025em]">{temp ? tempLabels[temp] ?? temp : "—"}</span>
          </div>
          {/* Régua das faixas: as já alcançadas acendem na cor da faixa atual */}
          <div className="mt-4 flex gap-1">
            {levels.map((l, i) => (
              <div
                key={l.key}
                className="h-1 flex-1 rounded-full"
                style={{ background: tempIndex >= 0 && i <= tempIndex ? temperatureColor(temp, levels) : "hsl(var(--secondary))" }}
                title={l.label}
              />
            ))}
          </div>
          {raw?.temperature_reason && <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{raw.temperature_reason}</p>}
        </div>

        <div className="border-t border-border p-5 md:border-t-0">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            Divisão da fala <MetricTooltip text={TIPS.talk} />
          </div>
          {talkRatio ? (
            <>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="metric text-[26px] leading-none">{talkRatio.seller}%</div>
                  <div className="mt-1 text-[12px] text-muted-foreground">vendedor</div>
                </div>
                <div className="text-right">
                  <div className="metric text-[26px] leading-none text-muted-foreground">{talkRatio.lead}%</div>
                  <div className="mt-1 text-[12px] text-muted-foreground">lead</div>
                </div>
              </div>
              <div className="mt-3 flex h-1 gap-0.5 overflow-hidden rounded-full">
                <div className="rounded-full bg-primary" style={{ flexGrow: talkRatio.seller }} />
                <div className="rounded-full bg-secondary" style={{ flexGrow: talkRatio.lead }} />
              </div>
              {talkRatio.reason && <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{talkRatio.reason}</p>}
            </>
          ) : (
            <div className="mt-3 text-muted-foreground">—</div>
          )}
        </div>
      </Card>

      {/* Contexto da conversa */}
      {summary && (summaryRows.length > 0 || summary.identified_pains?.length > 0) && (
        <Card>
          <CardHeader className="pb-4">
            <SectionTitle>Resumo da reunião</SectionTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {summaryRows.map(([k, v]) => (
                <div key={k}>
                  <dt className="eyebrow">{k}</dt>
                  <dd className="mt-1 text-[13.5px] text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
            {summary.identified_pains?.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <div className="eyebrow">Dores identificadas</div>
                <div className="mt-2.5"><List items={summary.identified_pains} icon="minus" tone="var(--warning)" /></div>
              </div>
            )}
            {summary.solution_pain_match?.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <div className="eyebrow">Dor × solução</div>
                <div className="mt-2.5 space-y-2">
                  {summary.solution_pain_match.map((m: any, i: number) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                      <span className="text-foreground">{m.pain}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-primary">{m.solution}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metodologias */}
      <div className="grid gap-4 lg:grid-cols-3">
        <FrameworkCard
          title={config.methodologyLabel}
          tip={`Critérios de qualificação desta operação: ${config.criteria.map((c) => c.label).join(", ")}. Configuráveis em Configurações › Metodologia de análise.`}
          rows={bant ? config.criteria.map((c) => ({ key: c.key, label: c.label, max: c.max_score ?? config.maxCriterionScore, ...getMetricValue(bant[c.key]) })) : null}
        />
        <FrameworkCard
          title="MEDDIC"
          tip={TIPS.meddic}
          rows={meddic ? Object.entries(meddic as Record<string, any>).map(([k, v]) => ({ key: k, label: MEDDIC_LABELS[k] ?? k.replace(/_/g, " "), max: 17, ...getMetricValue(v) })) : null}
        />
        <FrameworkCard
          title="SPIN"
          tip={TIPS.spin}
          rows={spin ? Object.keys(SPIN_LABELS).map((k) => ({ key: k, label: SPIN_LABELS[k], max: 25, ...getMetricValue(spin[k]) })) : null}
        />
      </div>

      {/* O que fazer com isso */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-4"><SectionTitle tip={TIPS.insights}>Leitura da conversa</SectionTitle></CardHeader>
          <CardContent className="space-y-5">
            {insights ? (
              <>
                {insights.positives?.length > 0 && (
                  <div><div className="eyebrow mb-2.5">O que foi bem</div><List items={insights.positives} icon="check" tone="var(--success)" /></div>
                )}
                {insights.improvements?.length > 0 && (
                  <div><div className="eyebrow mb-2.5">O que faltou</div><List items={insights.improvements} icon="minus" tone="var(--warning)" /></div>
                )}
              </>
            ) : <p className="text-[13px] text-muted-foreground">Sem leitura ainda</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-4"><SectionTitle tip={TIPS.coach}>Próximos passos</SectionTitle></CardHeader>
          <CardContent className="space-y-5">
            {salesCoach ? (
              <>
                {salesCoach.next_steps?.length > 0 && <List items={salesCoach.next_steps} icon="arrow" tone="var(--primary)" />}
                {salesCoach.suggestions?.length > 0 && (
                  <div className="border-t border-border pt-4"><div className="eyebrow mb-2.5">Sugestões do coach</div><List items={salesCoach.suggestions} icon="arrow" /></div>
                )}
              </>
            ) : <p className="text-[13px] text-muted-foreground">Sem recomendações ainda</p>}
          </CardContent>
        </Card>
      </div>

      {/* Base de conhecimento */}
      {rag && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
            <SectionTitle tip={TIPS.rag}>Aderência à base de conhecimento</SectionTitle>
            {rag.knowledge_adherence_score != null && (
              <span className="font-mono text-[13px] tabular-nums text-foreground">{rag.knowledge_adherence_score}<span className="text-muted-foreground/60">/100</span></span>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {rag.knowledge_adherence_score != null && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary/85" style={{ width: `${rag.knowledge_adherence_score}%` }} />
              </div>
            )}
            {rag.discourse_alignment && <p className="text-[13.5px] leading-relaxed text-foreground">{rag.discourse_alignment}</p>}
            <div className="grid gap-6 border-t border-border pt-4 md:grid-cols-3">
              {rag.products_mentioned?.length > 0 && (
                <div>
                  <div className="eyebrow mb-2.5">Produtos citados</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(rag.products_mentioned as any[]).map((p, i) => (
                      <span key={i} className="rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-[12.5px]">{asText(p, "name", "product")}</span>
                    ))}
                  </div>
                </div>
              )}
              {rag.missed_opportunities?.length > 0 && (
                <div><div className="eyebrow mb-2.5">Oportunidades perdidas</div><List items={(rag.missed_opportunities as any[]).map((o) => asText(o, "reason", "description"))} icon="minus" tone="var(--warning)" /></div>
              )}
              {rag.cross_sell_suggestions?.length > 0 && (
                <div><div className="eyebrow mb-2.5">Cross-sell e upsell</div><List items={(rag.cross_sell_suggestions as any[]).map((o) => asText(o, "reason", "product", "suggestion"))} icon="arrow" tone="var(--success)" /></div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Momentos-chave */}
      {highlights.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><SectionTitle tip={TIPS.highlights}>Momentos-chave</SectionTitle></CardHeader>
          <CardContent className="divide-y divide-border">
            {[...highlights].sort((a, b) => (a.timestamp_start ?? 0) - (b.timestamp_start ?? 0)).map((h) => {
              const t = HIGHLIGHT_TYPES[h.highlight_type] ?? { label: h.highlight_type, color: "var(--muted-foreground)" };
              return (
                <div key={h.id} className="grid grid-cols-[52px_140px_minmax(0,1fr)] items-baseline gap-3 py-3 text-[13.5px]">
                  <span className="font-mono text-[11.5px] text-muted-foreground">{fmtTime(h.timestamp_start) ?? "—"}</span>
                  <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <span className="status-dot" style={{ background: `hsl(${t.color})` }} />
                    {t.label}
                  </span>
                  <span className="text-foreground">
                    “{h.text}”{h.speaker && <span className="ml-2 text-[12.5px] text-muted-foreground">{h.speaker}</span>}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Transcrição */}
      {transcription && (
        <Card>
          <CardHeader className="pb-3"><SectionTitle>Transcrição</SectionTitle></CardHeader>
          <CardContent>
            <div className="max-h-[480px] space-y-3 overflow-auto pr-2">
              {transcription.full_text.split("\n").filter((l) => l.trim()).map((line, i) => {
                const m = line.match(/^([^:]{1,40}):\s*(.*)$/);
                return (
                  <p key={i} className={cn("text-[13.5px] leading-relaxed", m ? "text-foreground" : "text-muted-foreground")}>
                    {m ? (<><span className="mr-2 font-medium">{m[1]}</span><span className="text-foreground/80">{m[2]}</span></>) : line}
                  </p>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
