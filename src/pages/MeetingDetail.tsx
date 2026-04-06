import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Play, Target, Thermometer, Clock, MessageSquare, Mic } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Meeting = Tables<"meetings">;
type AnalysisResult = Tables<"analysis_results">;

const MeetingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  const fetchData = async () => {
    const [meetingRes, analysisRes] = await Promise.all([
      supabase.from("meetings").select("*").eq("id", id!).single(),
      supabase.from("analysis_results").select("*").eq("meeting_id", id!).single(),
    ]);
    if (meetingRes.data) setMeeting(meetingRes.data);
    if (analysisRes.data) setAnalysis(analysisRes.data);
    setLoading(false);
  };

  const handleAnalyze = async () => {
    if (!meeting) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-meeting", {
        body: { meetingId: meeting.id },
      });
      if (error) throw error;
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
          <Button onClick={handleAnalyze} disabled={processing}>
            <Play className="h-4 w-4 mr-2" />
            {processing ? "Processando..." : "Analisar"}
          </Button>
        )}
      </div>

      {/* Status */}
      {meeting.status !== "completo" && (
        <Card>
          <CardContent className="py-8 text-center">
            {meeting.status === "enviado" && (
              <>
                <Mic className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium">Aguardando análise</h3>
                <p className="text-sm text-muted-foreground">Clique em "Analisar" para iniciar o processamento com IA</p>
              </>
            )}
            {(meeting.status === "transcrevendo" || meeting.status === "analisando") && (
              <>
                <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                <h3 className="text-lg font-medium">
                  {meeting.status === "transcrevendo" ? "Transcrevendo áudio..." : "Analisando com IA..."}
                </h3>
                <p className="text-sm text-muted-foreground">Isso pode levar alguns minutos</p>
              </>
            )}
            {meeting.status === "erro" && (
              <>
                <div className="text-destructive text-4xl mb-4">⚠️</div>
                <h3 className="text-lg font-medium text-destructive">Erro no processamento</h3>
                <p className="text-sm text-muted-foreground">Tente novamente ou entre em contato com o suporte</p>
              </>
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
        </>
      )}
    </div>
  );
};

export default MeetingDetail;
