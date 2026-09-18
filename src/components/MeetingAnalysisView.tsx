import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Target, Thermometer, MessageSquare, Mic, Link as LinkIcon, ChevronDown, BookOpen, ShoppingCart, AlertTriangle, TrendingUp, Video, ExternalLink, Info } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { temperatureLabels, useOrgConfig } from "@/hooks/useOrgConfig";

type Meeting = Tables<"meetings">;
type AnalysisResult = Tables<"analysis_results">;
type Transcription = Tables<"transcriptions">;
type Highlight = Tables<"highlights">;

const MetricTooltip = ({ text }: { text: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs text-xs">
      <p>{text}</p>
    </TooltipContent>
  </Tooltip>
);

const getMetricValue = (val: any): { score: number; reason?: string } => {
  if (val === null || val === undefined) return { score: 0 };
  if (typeof val === "number") return { score: val };
  if (typeof val === "object" && "score" in val) return { score: val.score, reason: val.reason };
  return { score: Number(val) || 0 };
};

const tempColors: Record<string, string> = {
  congelado: "bg-muted/30 text-muted-foreground border-muted/30",
  frio: "bg-info/10 text-info border-info/20",
  morno: "bg-warning/10 text-warning border-warning/20",
  quente: "bg-destructive/10 text-destructive border-destructive/20",
  muito_quente: "bg-destructive/20 text-destructive border-destructive/40",
};

interface Props {
  meeting: Meeting;
  analysis: AnalysisResult | null;
  transcription: Transcription | null;
  highlights: Highlight[];
  mediaUrl: string | null;
}

export const MeetingAnalysisView = ({ meeting, analysis, transcription, highlights, mediaUrl }: Props) => {
  // Metodologia, critérios e faixas de temperatura vêm da configuração da
  // organização — não há framework fixo no componente.
  const { config } = useOrgConfig();
  const tempLabels = temperatureLabels(config.temperatureLevels);

  const bant = analysis?.bant_score as any;
  const meddic = analysis?.meddic_score as any;
  const spin = analysis?.spin_score as any;
  const insights = analysis?.insights as any;
  const salesCoach = analysis?.sales_coach as any;
  const talkRatio = analysis?.talk_ratio as any;
  const ragResults = analysis?.rag_results as any;
  const rawAnalysis = analysis?.raw_analysis as any;

  const getGoogleDriveEmbedUrl = (url: string): string | null => {
    let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    return null;
  };

  const mediaExt = (mediaUrl ?? "").split("?")[0].match(/\.(mp4|webm|m4a|mp3|ogg)$/i)?.[1]?.toLowerCase() ?? null;
  const isVideo = meeting.file_type === "webm" || meeting.file_type === "mp4" || mediaExt === "mp4" || mediaExt === "webm" || (meeting.file_url?.endsWith(".webm") || meeting.file_url?.endsWith(".mp4"));
  const mediaMime = mediaExt === "mp4" ? "video/mp4" : mediaExt === "m4a" ? "audio/mp4" : mediaExt === "mp3" ? "audio/mpeg" : mediaExt === "ogg" ? "audio/ogg" : isVideo ? "video/webm" : "audio/webm";

  return (
    <div className="space-y-6">
      {/* Gravação: arquivo no storage (URL assinada) ou link direto para o arquivo */}
      {mediaUrl && (meeting.file_url || mediaExt) && (
        <Collapsible defaultOpen>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  {isVideo ? <Video className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  Gravação da Reunião
                </CardTitle>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                {isVideo ? (
                  <video controls className="w-full rounded-md border" preload="metadata">
                    <source src={mediaUrl} type={mediaMime} />
                  </video>
                ) : (
                  <audio controls className="w-full" preload="metadata">
                    <source src={mediaUrl} type={mediaMime} />
                  </audio>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Google Drive link */}
      {meeting.youtube_url && (() => {
        const embedUrl = getGoogleDriveEmbedUrl(meeting.youtube_url);
        return embedUrl ? (
          <Collapsible defaultOpen>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="flex flex-row items-center justify-between py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    Gravação da Reunião
                  </CardTitle>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-3">
                  <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
                    <iframe src={embedUrl} className="absolute inset-0 w-full h-full rounded-md border" allow="autoplay; encrypted-media" allowFullScreen />
                  </div>
                  <a href={meeting.youtube_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
                    <ExternalLink className="h-3 w-3" /> Abrir no Google Drive
                  </a>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ) : (
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <LinkIcon className="h-5 w-5 text-muted-foreground" />
              <a href={meeting.youtube_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline truncate">{meeting.youtube_url}</a>
            </CardContent>
          </Card>
        );
      })()}

      {!analysis && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Esta reunião ainda não foi analisada.
          </CardContent>
        </Card>
      )}

      {analysis && (
        <>
          {/* Resumo */}
          {rawAnalysis?.meeting_summary && (() => {
            const summary = rawAnalysis.meeting_summary;
            return (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4" /> Resumo da Reunião</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {summary.company_name && <li className="flex items-start gap-2"><span className="font-medium text-muted-foreground min-w-[140px]">Empresa:</span><span>{summary.company_name}</span></li>}
                    {summary.company_size && <li className="flex items-start gap-2"><span className="font-medium text-muted-foreground min-w-[140px]">Porte:</span><span>{summary.company_size}</span></li>}
                    {summary.participants?.length > 0 && <li className="flex items-start gap-2"><span className="font-medium text-muted-foreground min-w-[140px]">Participantes:</span><span>{summary.participants.map((p: any) => `${p.name}${p.role ? ` (${p.role})` : ""}`).join(", ")}</span></li>}
                    {summary.identified_pains?.length > 0 && (
                      <li className="flex items-start gap-2"><span className="font-medium text-muted-foreground min-w-[140px]">Dores:</span>
                        <ul className="list-disc list-inside space-y-0.5">{summary.identified_pains.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>
                      </li>
                    )}
                    {summary.products_presented?.length > 0 && <li className="flex items-start gap-2"><span className="font-medium text-muted-foreground min-w-[140px]">Produtos:</span><span>{summary.products_presented.join(", ")}</span></li>}
                    {summary.proposal_value && <li className="flex items-start gap-2"><span className="font-medium text-muted-foreground min-w-[140px]">Proposta:</span><span>{summary.proposal_value}</span></li>}
                  </ul>
                </CardContent>
              </Card>
            );
          })()}

          {/* Score + Temperatura + Talk Ratio */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" /> Score Geral <MetricTooltip text="Avaliação geral da reunião comercial de 0 a 100." /></CardTitle></CardHeader>
              <CardContent>
                <div className="text-4xl sm:text-5xl font-bold text-primary text-center">{analysis.overall_score ?? "--"}</div>
                <p className="text-xs text-center text-muted-foreground mt-1">de 100</p>
                {rawAnalysis?.overall_score_reason && <p className="text-xs text-muted-foreground mt-2 text-center italic">{rawAnalysis.overall_score_reason}</p>}
              </CardContent>
            </Card>

            <Card className={meeting.temperature ? tempColors[meeting.temperature] : ""}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Thermometer className="h-4 w-4" /> Temperatura</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold text-center capitalize break-words">
                  {meeting.temperature ? tempLabels[meeting.temperature] || meeting.temperature : "--"}
                </div>
                {rawAnalysis?.temperature_reason && <p className="text-xs text-muted-foreground mt-2 text-center italic">{rawAnalysis.temperature_reason}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Talk Ratio</CardTitle></CardHeader>
              <CardContent>
                {talkRatio ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span>Vendedor: {talkRatio.seller}%</span><span>Lead: {talkRatio.lead}%</span></div>
                    <Progress value={talkRatio.seller} />
                    {talkRatio.reason && <p className="text-xs text-muted-foreground italic">{talkRatio.reason}</p>}
                  </div>
                ) : <div className="text-center text-muted-foreground">--</div>}
              </CardContent>
            </Card>
          </div>

          {/* Frameworks */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-sm">{config.methodologyLabel} Score</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {bant ? config.criteria.map((criterion) => {
                  const { score, reason } = getMetricValue(bant[criterion.key]);
                  const max = criterion.max_score ?? config.maxCriterionScore;
                  return (
                    <div key={criterion.key} className="space-y-1">
                      <div className="flex justify-between text-xs"><span>{criterion.label}</span><span>{score}/{max}</span></div>
                      <Progress value={max > 0 ? (score / max) * 100 : 0} />
                      {reason && <p className="text-xs text-muted-foreground italic">{reason}</p>}
                    </div>
                  );
                }) : <p className="text-sm text-muted-foreground">Sem dados</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">MEDDIC Score</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {meddic ? Object.entries(meddic as Record<string, any>).map(([key, val]) => {
                  const { score, reason } = getMetricValue(val);
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-xs"><span className="capitalize">{key.replace(/_/g, " ")}</span><span>{score}/17</span></div>
                      <Progress value={(score / 17) * 100} />
                      {reason && <p className="text-xs text-muted-foreground italic">{reason}</p>}
                    </div>
                  );
                }) : <p className="text-sm text-muted-foreground">Sem dados</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">SPIN Score</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {spin ? ["situacao", "problema", "implicacao", "necessidade"].map((key) => {
                  const { score, reason } = getMetricValue(spin[key]);
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-xs"><span className="capitalize">{key === "situacao" ? "Situação" : key === "implicacao" ? "Implicação" : key}</span><span>{score}/25</span></div>
                      <Progress value={(score / 25) * 100} />
                      {reason && <p className="text-xs text-muted-foreground italic">{reason}</p>}
                    </div>
                  );
                }) : <p className="text-sm text-muted-foreground">Sem dados</p>}
              </CardContent>
            </Card>
          </div>

          {/* Insights + Coach */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">💡 Insights</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {insights ? (
                  <>
                    {insights.positives && <div><h4 className="text-xs font-semibold text-success mb-1">✅ O que foi bem</h4><ul className="text-sm space-y-1">{(insights.positives as string[]).map((p, i) => <li key={i}>• {p}</li>)}</ul></div>}
                    {insights.improvements && <div><h4 className="text-xs font-semibold text-warning mb-1">⚠️ O que faltou</h4><ul className="text-sm space-y-1">{(insights.improvements as string[]).map((p, i) => <li key={i}>• {p}</li>)}</ul></div>}
                  </>
                ) : <p className="text-sm text-muted-foreground">Sem insights</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">🤖 Sales Coach</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {salesCoach ? (
                  <>
                    {salesCoach.next_steps && <div><h4 className="text-xs font-semibold mb-1">Próximos Passos</h4><ul className="text-sm space-y-1">{(salesCoach.next_steps as string[]).map((s, i) => <li key={i}>• {s}</li>)}</ul></div>}
                    {salesCoach.suggestions && <div><h4 className="text-xs font-semibold mb-1">Sugestões</h4><ul className="text-sm space-y-1">{(salesCoach.suggestions as string[]).map((s, i) => <li key={i}>• {s}</li>)}</ul></div>}
                  </>
                ) : <p className="text-sm text-muted-foreground">Sem recomendações</p>}
              </CardContent>
            </Card>
          </div>

          {/* RAG */}
          {ragResults && (
            <Card className="border-primary/20">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /> 📚 Aderência à Base de Conhecimento</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {ragResults.knowledge_adherence_score != null && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="font-medium">Score</span><span className="font-bold text-primary">{ragResults.knowledge_adherence_score}/100</span></div>
                    <Progress value={ragResults.knowledge_adherence_score} className="h-2" />
                  </div>
                )}
                {ragResults.discourse_alignment && <div><h4 className="text-xs font-semibold mb-1">Alinhamento</h4><p className="text-sm text-muted-foreground">{ragResults.discourse_alignment}</p></div>}
                <div className="grid gap-4 md:grid-cols-3">
                  {ragResults.products_mentioned?.length > 0 && (
                    <div><h4 className="text-xs font-semibold mb-2 flex items-center gap-1"><ShoppingCart className="h-3 w-3 text-primary" /> Produtos</h4>
                      <div className="flex flex-wrap gap-1">{(ragResults.products_mentioned as any[]).map((p, i) => <Badge key={i} variant="secondary" className="text-xs">{typeof p === "string" ? p : p?.name || p?.product || JSON.stringify(p)}</Badge>)}</div>
                    </div>
                  )}
                  {ragResults.missed_opportunities?.length > 0 && (
                    <div><h4 className="text-xs font-semibold mb-2 flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-warning" /> Oportunidades Perdidas</h4>
                      <ul className="text-sm space-y-1">{(ragResults.missed_opportunities as any[]).map((o, i) => <li key={i} className="text-muted-foreground">• {typeof o === "string" ? o : o?.reason || o?.description || JSON.stringify(o)}</li>)}</ul>
                    </div>
                  )}
                  {ragResults.cross_sell_suggestions?.length > 0 && (
                    <div><h4 className="text-xs font-semibold mb-2 flex items-center gap-1"><TrendingUp className="h-3 w-3 text-success" /> Cross-sell</h4>
                      <ul className="text-sm space-y-1">{(ragResults.cross_sell_suggestions as any[]).map((s, i) => <li key={i} className="text-muted-foreground">• {typeof s === "string" ? s : s?.reason || s?.product || s?.suggestion || JSON.stringify(s)}</li>)}</ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Highlights */}
          {highlights.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">🎯 Highlights</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {highlights.map((h) => (
                  <div key={h.id} className="flex items-start gap-2 text-sm border-l-2 border-primary/30 pl-3 py-1">
                    <Badge variant="outline" className="text-xs shrink-0">
                      {h.highlight_type === "objecao" ? "Objeção" : h.highlight_type === "sinal_compra" ? "Sinal de Compra" : h.highlight_type === "momento_chave" ? "Momento-Chave" : h.highlight_type === "dor" ? "Dor" : h.highlight_type === "necessidade" ? "Necessidade" : h.highlight_type}
                    </Badge>
                    <span>{h.text}</span>
                    {h.speaker && <span className="text-muted-foreground text-xs">({h.speaker})</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Transcrição */}
          {transcription && (
            <Card>
              <CardHeader><CardTitle className="text-sm">📝 Transcrição</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">{transcription.full_text}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
