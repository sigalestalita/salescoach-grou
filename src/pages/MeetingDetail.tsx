import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Play, Target, Thermometer, Clock, MessageSquare, Mic, Link, ChevronDown, Download, BrainCircuit, CheckCircle2, BookOpen, ShoppingCart, AlertTriangle, TrendingUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Tables } from "@/integrations/supabase/types";

type Meeting = Tables<"meetings">;
type AnalysisResult = Tables<"analysis_results">;
type Transcription = Tables<"transcriptions">;
type Highlight = Tables<"highlights">;

const MeetingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [transcription, setTranscription] = useState<Transcription | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [manualTranscript, setManualTranscript] = useState("");

  const isLinkBased = meeting && !meeting.file_url && !!meeting.youtube_url;

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  const fetchData = async () => {
    const [meetingRes, analysisRes, transcriptionRes, highlightsRes] = await Promise.all([
      supabase.from("meetings").select("*").eq("id", id!).single(),
      supabase.from("analysis_results").select("*").eq("meeting_id", id!).single(),
      supabase.from("transcriptions").select("*").eq("meeting_id", id!).single(),
      supabase.from("highlights").select("*").eq("meeting_id", id!),
    ]);
    if (meetingRes.data) setMeeting(meetingRes.data);
    if (analysisRes.data) setAnalysis(analysisRes.data);
    if (transcriptionRes.data) setTranscription(transcriptionRes.data);
    if (highlightsRes.data) setHighlights(highlightsRes.data);
    setLoading(false);
  };

  const handleAnalyze = async () => {
    if (!meeting) return;
    setProcessing(true);
    try {
      const body: any = { meetingId: meeting.id };
      if (manualTranscript.trim()) {
        body.manualTranscript = manualTranscript.trim();
      }
      const { data, error } = await supabase.functions.invoke("analyze-meeting", {
        body,
      });
      if (error) {
        const msg = data?.error || data?.message || error.message || "Erro desconhecido";
        throw new Error(msg);
      }
      toast({ title: "Análise iniciada!", description: "O processamento pode levar alguns minutos." });
      // Poll for completion
      const interval = setInterval(async () => {
        const { data: updated } = await supabase.from("meetings").select("status").eq("id", meeting.id).single();
        if (updated?.status === "completo" || updated?.status === "erro") {
          clearInterval(interval);
          fetchData();
          setProcessing(false);
        }
      }, 5000);
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      setProcessing(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;
  if (!meeting) return <div className="text-center py-12">Agenda não encontrada</div>;

  const bant = analysis?.bant_score as any;
  const meddic = analysis?.meddic_score as any;
  const spin = analysis?.spin_score as any;
  const insights = analysis?.insights as any;
  const salesCoach = analysis?.sales_coach as any;
  const talkRatio = analysis?.talk_ratio as any;
  const metrics = analysis?.conversation_metrics as any;
  const ragResults = analysis?.rag_results as any;

  const tempColors: Record<string, string> = {
    frio: "bg-info/10 text-info border-info/20",
    morno: "bg-warning/10 text-warning border-warning/20",
    quente: "bg-destructive/10 text-destructive border-destructive/20",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/agendas")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{meeting.title}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {meeting.lead_name && <span>{meeting.lead_name}</span>}
            {meeting.lead_company && <span>• {meeting.lead_company}</span>}
            {meeting.meeting_date && (
              <span>• {new Date(meeting.meeting_date).toLocaleDateString("pt-BR")}</span>
            )}
          </div>
        </div>
        {meeting.status === "enviado" && (
          <Button onClick={handleAnalyze} disabled={processing || (isLinkBased && !meeting.youtube_url && !manualTranscript.trim())}>
            <Play className="h-4 w-4 mr-2" />
            {processing ? "Processando..." : "Analisar"}
          </Button>
        )}
      </div>

      {/* Link info */}
      {meeting.youtube_url && (
        <Card>
          <CardContent className="py-4 flex items-center gap-3">
            <Link className="h-5 w-5 text-muted-foreground" />
            <a href={meeting.youtube_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline truncate">
              {meeting.youtube_url}
            </a>
          </CardContent>
        </Card>
      )}

      {/* Optional manual transcript for link-based meetings */}
      {isLinkBased && meeting.status === "enviado" && (
        <Collapsible>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm">📝 Já tem a transcrição? Cole aqui (opcional)</CardTitle>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-3 pt-0">
                <p className="text-xs text-muted-foreground">
                  Se não colar, o sistema tentará baixar o áudio do link e transcrever automaticamente.
                </p>
                <Textarea
                  placeholder="Cole aqui a transcrição completa da reunião..."
                  value={manualTranscript}
                  onChange={(e) => setManualTranscript(e.target.value)}
                  rows={8}
                />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
      {meeting.status !== "completo" && (
        <Card>
          <CardContent className="py-8">
            {meeting.status === "enviado" && (
              <div className="text-center">
                <Mic className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium">Aguardando análise</h3>
                <p className="text-sm text-muted-foreground">Clique em "Analisar" para iniciar o processamento com IA</p>
              </div>
            )}
            {(meeting.status === "baixando" || meeting.status === "transcrevendo" || meeting.status === "analisando") && (() => {
              const steps = [
                { key: "baixando", label: "Baixando arquivo", icon: Download },
                { key: "transcrevendo", label: "Transcrevendo áudio", icon: Mic },
                { key: "analisando", label: "Analisando com IA", icon: BrainCircuit },
              ];
              const currentIdx = steps.findIndex(s => s.key === meeting.status);
              const progressValue = ((currentIdx + 1) / steps.length) * 100;

              return (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Progresso</span>
                      <span>{Math.round(progressValue)}%</span>
                    </div>
                    <Progress value={progressValue} className="h-2" />
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    {steps.map((step, idx) => {
                      const isCompleted = idx < currentIdx;
                      const isCurrent = idx === currentIdx;
                      const Icon = isCompleted ? CheckCircle2 : step.icon;
                      return (
                        <div key={step.key} className="flex items-center gap-2">
                          {idx > 0 && (
                            <div className={`w-8 h-0.5 ${isCompleted ? "bg-primary" : "bg-muted"}`} />
                          )}
                          <div className={`flex flex-col items-center gap-1 ${isCurrent ? "text-primary" : isCompleted ? "text-primary/70" : "text-muted-foreground"}`}>
                            <div className={`p-2 rounded-full ${isCurrent ? "bg-primary/10 animate-pulse" : isCompleted ? "bg-primary/10" : "bg-muted"}`}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <span className="text-xs font-medium">{step.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-sm text-muted-foreground text-center">Isso pode levar alguns minutos</p>
                </div>
              );
            })()}
            {meeting.status === "erro" && (
              <div className="text-center">
                <div className="text-destructive text-4xl mb-4">⚠️</div>
                <h3 className="text-lg font-medium text-destructive">Erro no processamento</h3>
                <p className="text-sm text-muted-foreground">Tente novamente ou entre em contato com o suporte</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Analysis results */}
      {analysis && (
        <>
          {/* Score Geral + Temperatura */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Score Geral
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-5xl font-bold text-primary text-center">
                  {analysis.overall_score ?? "--"}
                </div>
                <p className="text-xs text-center text-muted-foreground mt-1">de 100</p>
              </CardContent>
            </Card>

            <Card className={meeting.temperature ? tempColors[meeting.temperature] : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Thermometer className="h-4 w-4" />
                  Temperatura
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-center capitalize">
                  {meeting.temperature
                    ? { frio: "❄️ Frio", morno: "🌤️ Morno", quente: "🔥 Quente" }[meeting.temperature]
                    : "--"}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Talk Ratio
                </CardTitle>
              </CardHeader>
              <CardContent>
                {talkRatio ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Vendedor: {talkRatio.seller}%</span>
                      <span>Lead: {talkRatio.lead}%</span>
                    </div>
                    <Progress value={talkRatio.seller} />
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">--</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Framework Scores */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* BANT */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">BANT Score</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {bant ? (
                  ["budget", "authority", "need", "timeline"].map((key) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="capitalize">{key === "need" ? "Necessidade" : key === "budget" ? "Orçamento" : key === "authority" ? "Autoridade" : "Prazo"}</span>
                        <span>{bant[key]}/25</span>
                      </div>
                      <Progress value={(bant[key] / 25) * 100} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Sem dados</p>
                )}
              </CardContent>
            </Card>

            {/* MEDDIC */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">MEDDIC Score</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {meddic ? (
                  Object.entries(meddic as Record<string, number>).map(([key, val]) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="capitalize">{key.replace(/_/g, " ")}</span>
                        <span>{val}/17</span>
                      </div>
                      <Progress value={(val / 17) * 100} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Sem dados</p>
                )}
              </CardContent>
            </Card>

            {/* SPIN */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">SPIN Score</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {spin ? (
                  ["situacao", "problema", "implicacao", "necessidade"].map((key) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="capitalize">{key === "situacao" ? "Situação" : key === "implicacao" ? "Implicação" : key}</span>
                        <span>{spin[key]}/25</span>
                      </div>
                      <Progress value={(spin[key] / 25) * 100} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Sem dados</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Insights & Sales Coach */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">💡 Insights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights ? (
                  <>
                    {insights.positives && (
                      <div>
                        <h4 className="text-xs font-semibold text-success mb-1">✅ O que foi bem</h4>
                        <ul className="text-sm space-y-1">
                          {(insights.positives as string[]).map((p: string, i: number) => (
                            <li key={i}>• {p}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {insights.improvements && (
                      <div>
                        <h4 className="text-xs font-semibold text-warning mb-1">⚠️ O que faltou</h4>
                        <ul className="text-sm space-y-1">
                          {(insights.improvements as string[]).map((p: string, i: number) => (
                            <li key={i}>• {p}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem insights ainda</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">🤖 Sales Coach</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {salesCoach ? (
                  <>
                    {salesCoach.next_steps && (
                      <div>
                        <h4 className="text-xs font-semibold mb-1">Próximos Passos</h4>
                        <ul className="text-sm space-y-1">
                          {(salesCoach.next_steps as string[]).map((s: string, i: number) => (
                            <li key={i}>• {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {salesCoach.suggestions && (
                      <div>
                        <h4 className="text-xs font-semibold mb-1">Sugestões</h4>
                        <ul className="text-sm space-y-1">
                          {(salesCoach.suggestions as string[]).map((s: string, i: number) => (
                            <li key={i}>• {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem recomendações ainda</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* RAG Results - Base de Conhecimento */}
          {ragResults && (
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  📚 Aderência à Base de Conhecimento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Score de Aderência */}
                {ragResults.knowledge_adherence_score != null && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Score de Aderência</span>
                      <span className="font-bold text-primary">{ragResults.knowledge_adherence_score}/100</span>
                    </div>
                    <Progress value={ragResults.knowledge_adherence_score} className="h-2" />
                  </div>
                )}

                {/* Alinhamento do discurso */}
                {ragResults.discourse_alignment && (
                  <div>
                    <h4 className="text-xs font-semibold mb-1 flex items-center gap-1">
                      <Target className="h-3 w-3" /> Alinhamento do Discurso
                    </h4>
                    <p className="text-sm text-muted-foreground">{ragResults.discourse_alignment}</p>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  {/* Produtos mencionados */}
                  {ragResults.products_mentioned && ragResults.products_mentioned.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                        <ShoppingCart className="h-3 w-3 text-primary" /> Produtos Mencionados
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {(ragResults.products_mentioned as string[]).map((p: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Oportunidades perdidas */}
                  {ragResults.missed_opportunities && ragResults.missed_opportunities.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-warning" /> Oportunidades Perdidas
                      </h4>
                      <ul className="text-sm space-y-1">
                        {(ragResults.missed_opportunities as string[]).map((o: string, i: number) => (
                          <li key={i} className="text-muted-foreground">• {o}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Sugestões de Cross-sell */}
                  {ragResults.cross_sell_suggestions && ragResults.cross_sell_suggestions.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-success" /> Sugestões Cross-sell / Upsell
                      </h4>
                      <ul className="text-sm space-y-1">
                        {(ragResults.cross_sell_suggestions as string[]).map((s: string, i: number) => (
                          <li key={i} className="text-muted-foreground">• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Highlights */}
          {highlights.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">🎯 Highlights</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {highlights.map((h) => (
                  <div key={h.id} className="flex items-start gap-2 text-sm border-l-2 border-primary/30 pl-3 py-1">
                    <Badge variant="outline" className="text-xs shrink-0">
                      {h.highlight_type === "objecao" ? "Objeção" :
                       h.highlight_type === "sinal_compra" ? "Sinal de Compra" :
                       h.highlight_type === "momento_chave" ? "Momento-Chave" :
                       h.highlight_type === "dor" ? "Dor" :
                       h.highlight_type === "necessidade" ? "Necessidade" : h.highlight_type}
                    </Badge>
                    <span>{h.text}</span>
                    {h.speaker && <span className="text-muted-foreground text-xs">({h.speaker})</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Transcription */}
          {transcription && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">📝 Transcrição</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">
                  {transcription.full_text}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default MeetingDetail;
