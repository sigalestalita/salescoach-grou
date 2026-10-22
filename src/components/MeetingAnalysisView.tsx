import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Target, Thermometer, MessageSquare, Mic, Link as LinkIcon, ChevronDown, BookOpen, ShoppingCart, AlertTriangle, TrendingUp, Video, ExternalLink, Info, HeartPulse, ClipboardCheck, CheckCircle2, CircleDashed, XCircle, MinusCircle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { temperatureLabels, useOrgConfig } from "@/hooks/useOrgConfig";
import { FRAMEWORK_GRID, methodologyOf } from "@/lib/methodology";

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
  // Saúde do cliente (playbooks de atendimento)
  critico: "bg-destructive/20 text-destructive border-destructive/40",
  em_risco: "bg-destructive/10 text-destructive border-destructive/20",
  atencao: "bg-warning/10 text-warning border-warning/20",
  saudavel: "bg-success/10 text-success border-success/20",
  promotor: "bg-success/20 text-success border-success/40",
};

const HIGHLIGHT_LABELS: Record<string, string> = {
  objecao: "Objeção", sinal_compra: "Sinal de Compra", momento_chave: "Momento-Chave", dor: "Dor", necessidade: "Necessidade",
  risco: "Risco", oportunidade: "Oportunidade", reclamacao: "Reclamação", elogio: "Elogio", pedido: "Pedido", compromisso: "Compromisso",
};

/** Status de uma etapa do playbook, como a IA devolve em playbook_result.etapas. */
const STEP_STATUS: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  cumprida: { label: "Cumprida", icon: CheckCircle2, className: "text-success" },
  parcial: { label: "Parcial", icon: CircleDashed, className: "text-warning" },
  nao_cumprida: { label: "Não cumprida", icon: XCircle, className: "text-destructive" },
  nao_se_aplica: { label: "Não se aplica", icon: MinusCircle, className: "text-muted-foreground" },
};

/** O que a análise por playbook guarda em analysis_results.playbook_result. */
interface PlaybookResult {
  etapas?: { key?: string; status?: string; evidencia?: string }[];
  boas_praticas?: { label?: string; ok?: boolean; evidencia?: string }[];
  evitar?: { label?: string; ocorreu?: boolean; evidencia?: string }[];
  sinais?: { key?: string; label?: string; tipo?: string; detectado?: boolean; evidencia?: string }[];
  campos?: Record<string, unknown>;
  sentimento_cliente?: string;
  pendencias?: string[];
  compromissos?: { quem?: string; o_que?: string; prazo?: string | null }[];
}

const SIGNAL_TYPE: Record<string, { label: string; className: string }> = {
  risco: { label: "Risco", className: "border-destructive/40 text-destructive" },
  oportunidade: { label: "Oportunidade", className: "border-success/40 text-success" },
  atencao: { label: "Atenção", className: "border-warning/40 text-warning" },
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

  const bant = analysis?.bant_score as any;
  const meddic = analysis?.meddic_score as any;
  const spin = analysis?.spin_score as any;
  // Critérios da metodologia com que esta reunião foi analisada (pode ser
  // outra que a padrão atual: cada tipo de reunião pode ter a sua).
  const method = methodologyOf(analysis, config);
  // Conversa de atendimento avaliada por playbook: outros rótulos e o detalhe
  // das etapas, sinais e compromissos.
  const isPlaybook = method.mode === "playbook";
  const playbook = (analysis?.playbook_result ?? null) as PlaybookResult | null;
  const tempLabels = { ...config.allLevelLabels, ...temperatureLabels(method.levels) };
  // MEDDIC e SPIN são opcionais por metodologia: sem dados, o card some.
  const frameworkGrid = FRAMEWORK_GRID[1 + (meddic ? 1 : 0) + (spin ? 1 : 0)];
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
  // Gravação da extensão sem a tela: o arquivo é webm, mas só tem áudio.
  const isVideo = meeting.gravou_tela !== false && (meeting.file_type === "webm" || meeting.file_type === "mp4" || mediaExt === "mp4" || mediaExt === "webm" || (meeting.file_url?.endsWith(".webm") || meeting.file_url?.endsWith(".mp4")));
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
                {meeting.gravou_tela === false && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Gravada sem a tela: só o áudio chegou. A tela não foi compartilhada ao iniciar a gravação, ou o vídeo não conseguiu subir.
                  </p>
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
                      <li className="flex items-start gap-2"><span className="font-medium text-muted-foreground min-w-[140px]">{isPlaybook ? "Pontos levantados:" : "Dores:"}</span>
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
          <div className="grid gap-4 md:grid-cols-3" data-tour="reuniao-scores">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" /> {isPlaybook ? "Aderência ao playbook" : "Score Geral"} <MetricTooltip text={isPlaybook ? `Quanto a conversa seguiu o playbook ${method.label}, de 0 a 100, pelo peso de cada etapa.` : "Avaliação geral da reunião comercial de 0 a 100."} /></CardTitle></CardHeader>
              <CardContent>
                <div className="text-4xl sm:text-5xl font-bold text-primary text-center">{analysis.overall_score ?? "--"}</div>
                <p className="text-xs text-center text-muted-foreground mt-1">de 100</p>
                {rawAnalysis?.overall_score_reason && <p className="text-xs text-muted-foreground mt-2 text-center italic">{rawAnalysis.overall_score_reason}</p>}
              </CardContent>
            </Card>

            <Card className={meeting.temperature ? tempColors[meeting.temperature] : ""}>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">{isPlaybook ? <><HeartPulse className="h-4 w-4" /> Saúde do cliente</> : <><Thermometer className="h-4 w-4" /> Temperatura</>}</CardTitle></CardHeader>
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
                    <div className="flex justify-between text-sm"><span>{isPlaybook ? "Atendimento" : "Vendedor"}: {talkRatio.seller}%</span><span>{isPlaybook ? "Cliente" : "Lead"}: {talkRatio.lead}%</span></div>
                    <Progress value={talkRatio.seller} />
                    {talkRatio.reason && <p className="text-xs text-muted-foreground italic">{talkRatio.reason}</p>}
                  </div>
                ) : <div className="text-center text-muted-foreground">--</div>}
              </CardContent>
            </Card>
          </div>

          {/* Frameworks */}
          <div className={frameworkGrid}>
            <Card>
              <CardHeader><CardTitle className="text-sm">{isPlaybook ? `Etapas do playbook · ${method.label}` : `${method.label} Score`}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {bant ? method.criteria.map((criterion) => {
                  const { score, reason } = getMetricValue(bant[criterion.key]);
                  const max = criterion.max_score ?? method.maxCriterionScore;
                  const etapa = isPlaybook && Array.isArray(playbook?.etapas) ? playbook.etapas.find((e) => e?.key === criterion.key) : null;
                  const status = etapa?.status ? STEP_STATUS[etapa.status] : null;
                  return (
                    <div key={criterion.key} className="space-y-1">
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5">
                          {status && <status.icon className={`h-3.5 w-3.5 shrink-0 ${status.className}`} aria-label={status.label} />}
                          {criterion.label}
                          {"required" in criterion && criterion.required && <Badge variant="outline" className="h-4 px-1 text-[10px]">obrigatória</Badge>}
                        </span>
                        <span>{score}/{max}</span>
                      </div>
                      <Progress value={max > 0 ? (score / max) * 100 : 0} />
                      {reason && <p className="text-xs text-muted-foreground italic">{reason}</p>}
                      {etapa?.evidencia && <p className="text-xs text-muted-foreground">“{etapa.evidencia}”</p>}
                    </div>
                  );
                }) : <p className="text-sm text-muted-foreground">Sem dados</p>}
              </CardContent>
            </Card>

            {meddic && (
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
            )}

            {spin && (
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
            )}
          </div>

          {/* Playbook: sinais, práticas, informações e compromissos */}
          {isPlaybook && playbook && <PlaybookDetails playbook={playbook} />}

          {/* Insights + Coach */}
          <div className="grid gap-4 md:grid-cols-2" data-tour="reuniao-coach">
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
              <CardHeader><CardTitle className="text-sm">🤖 {isPlaybook ? "Coach" : "Sales Coach"}</CardTitle></CardHeader>
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
                      {HIGHLIGHT_LABELS[h.highlight_type] ?? h.highlight_type}
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
            <Card data-tour="reuniao-transcricao">
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

/** Detalhe da análise por playbook: o que a IA encontrou além das etapas. */
const PlaybookDetails = ({ playbook }: { playbook: PlaybookResult }) => {
  const sinais = (Array.isArray(playbook.sinais) ? playbook.sinais : []).filter((s) => s?.detectado);
  const praticas = Array.isArray(playbook.boas_praticas) ? playbook.boas_praticas : [];
  const evitar = (Array.isArray(playbook.evitar) ? playbook.evitar : []).filter((e) => e?.ocorreu);
  const campos = Object.entries((playbook.campos ?? {}) as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && String(v).trim() && String(v) !== "null");
  const compromissos = Array.isArray(playbook.compromissos) ? playbook.compromissos : [];
  const pendencias = Array.isArray(playbook.pendencias) ? playbook.pendencias : [];
  // Sinais vêm com a key do playbook; o rótulo e o tipo, da configuração guardada.
  const rotulo = (k: string) => k.replace(/_/g, " ");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Sinais detectados</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {playbook.sentimento_cliente && <p className="text-sm italic text-muted-foreground">{playbook.sentimento_cliente}</p>}
          {sinais.length ? sinais.map((s, i) => {
            const tipo = s.tipo ? SIGNAL_TYPE[s.tipo] ?? null : null;
            return (
              <div key={i} className="space-y-0.5 border-l-2 border-primary/30 pl-3">
                <div className="flex items-center gap-2 text-sm">
                  {tipo && <Badge variant="outline" className={`text-[10px] ${tipo.className}`}>{tipo.label}</Badge>}
                  <span className="capitalize">{s.label ?? rotulo(String(s.key ?? ""))}</span>
                </div>
                {s.evidencia && <p className="text-xs text-muted-foreground">“{s.evidencia}”</p>}
              </div>
            );
          }) : <p className="text-sm text-muted-foreground">Nenhum sinal de risco ou oportunidade nesta conversa.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Condução</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {praticas.length > 0 && (
            <ul className="space-y-1">
              {praticas.map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  {p?.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
                  <span>{p?.label}{p?.evidencia && <span className="block text-xs text-muted-foreground">{p.evidencia}</span>}</span>
                </li>
              ))}
            </ul>
          )}
          {evitar.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-destructive mb-1">Aconteceu o que deveria ser evitado</h4>
              <ul className="space-y-1">{evitar.map((e, i) => <li key={i}>• {e.label}{e.evidencia && <span className="block text-xs text-muted-foreground">{e.evidencia}</span>}</li>)}</ul>
            </div>
          )}
          {praticas.length === 0 && evitar.length === 0 && <p className="text-muted-foreground">Sem observações de condução.</p>}
        </CardContent>
      </Card>

      {(campos.length > 0 || compromissos.length > 0 || pendencias.length > 0) && (
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4" /> Registro do atendimento</CardTitle></CardHeader>
          <CardContent className="grid gap-4 text-sm md:grid-cols-3">
            {campos.length > 0 && (
              <ul className="space-y-1">
                {campos.map(([k, v]) => <li key={k}><span className="capitalize text-muted-foreground">{rotulo(k)}:</span> {String(v)}</li>)}
              </ul>
            )}
            {compromissos.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Compromissos</h4>
                <ul className="space-y-1">{compromissos.map((c, i) => <li key={i}>• {c.o_que}{c.quem ? ` (${c.quem})` : ""}{c.prazo && c.prazo !== "null" ? ` · ${c.prazo}` : ""}</li>)}</ul>
              </div>
            )}
            {pendencias.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold mb-1">Em aberto para o cliente</h4>
                <ul className="space-y-1">{pendencias.map((p, i) => <li key={i}>• {p}</li>)}</ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
