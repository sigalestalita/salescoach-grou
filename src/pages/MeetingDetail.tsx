import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Play, Mic, Link, ChevronDown, Download, BrainCircuit, CheckCircle2, AlertTriangle, Video, ExternalLink } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Tables } from "@/integrations/supabase/types";
import { LiveMeetingPanel } from "@/components/LiveMeetingPanel";
import { ShareControls } from "@/components/ShareControls";
import { useOrgConfig } from "@/hooks/useOrgConfig";
import { AnalysisReport } from "@/components/AnalysisReport";



type Meeting = Tables<"meetings">;
type AnalysisResult = Tables<"analysis_results">;
type Transcription = Tables<"transcriptions">;
type Highlight = Tables<"highlights">;

const processingStatuses = ["baixando", "transcrevendo", "analisando"] as const;
const PROCESSING_STALE_AFTER_MS = 30 * 60 * 1000;

const isMeetingProcessingStalled = (
  currentMeeting: Pick<Meeting, "status" | "updated_at"> | null,
) => {
  if (!currentMeeting) return false;

  return (
    processingStatuses.includes(currentMeeting.status as (typeof processingStatuses)[number]) &&
    Date.now() - new Date(currentMeeting.updated_at).getTime() > PROCESSING_STALE_AFTER_MS
  );
};

const MeetingDetail = () => {
  // Metodologia e faixas de temperatura da organização.
  const { config } = useOrgConfig();
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
  const [fileMediaUrl, setFileMediaUrl] = useState<string | null>(null);

  const isLinkBased = meeting && !meeting.file_url && !!meeting.youtube_url;
  const isStaleProcessing = isMeetingProcessingStalled(meeting);

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  // Poll for updates when meeting is in a processing state
  useEffect(() => {
    if (!meeting || !processingStatuses.includes(meeting.status as (typeof processingStatuses)[number])) return;
    if (isMeetingProcessingStalled(meeting)) {
      setProcessing(false);
      return;
    }

    setProcessing(true);
    const interval = setInterval(async () => {
      const { data: updated } = await supabase
        .from("meetings")
        .select("status, updated_at")
        .eq("id", meeting.id)
        .single();

      if (updated?.status === "completo" || updated?.status === "erro" || isMeetingProcessingStalled(updated)) {
        clearInterval(interval);
        setProcessing(false);
        fetchData();
      } else if (updated?.status && updated.status !== meeting.status) {
        setMeeting((prev) => prev ? { ...prev, status: updated.status, updated_at: updated.updated_at } : prev);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [meeting?.id, meeting?.status, meeting?.updated_at]);

  const fetchData = async () => {
    const [meetingRes, analysisRes, transcriptionRes, highlightsRes] = await Promise.all([
      supabase.from("meetings").select("*").eq("id", id!).single(),
      supabase.from("analysis_results").select("*").eq("meeting_id", id!).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("transcriptions").select("*").eq("meeting_id", id!).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("highlights").select("*").eq("meeting_id", id!),
    ]);
    if (meetingRes.data) {
      setMeeting(meetingRes.data);
      // Get signed URL for storage files
      if (meetingRes.data.file_url && !meetingRes.data.youtube_url) {
        const { data: signedData } = await supabase.storage
          .from("meeting-files")
          .createSignedUrl(meetingRes.data.file_url, 3600); // 1 hour
        if (signedData?.signedUrl) setFileMediaUrl(signedData.signedUrl);
      }
    }
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


  const typeLabel = config.meetingTypes.find((t) => t.key === meeting.meeting_type)?.label;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="mt-0.5 h-8 w-8" onClick={() => navigate("/agendas")} aria-label="Voltar para agendas">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">
            {[typeLabel, meeting.meeting_date && new Date(meeting.meeting_date).toLocaleDateString("pt-BR")].filter(Boolean).join(" · ")}
          </div>
          <h1 className="mt-1.5 text-[24px] font-medium leading-tight tracking-[-0.025em]">{meeting.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            {meeting.lead_name && <span>{meeting.lead_name}</span>}
            {meeting.lead_company && <><span className="opacity-40">/</span><span>{meeting.lead_company}</span></>}
          </div>
        </div>
        {meeting.share_token && (
          <ShareControls meeting={meeting} onChange={fetchData} />
        )}
        {(meeting.status === "enviado" || meeting.status === "erro" || isStaleProcessing) && (
          <Button onClick={handleAnalyze} disabled={processing || (isLinkBased && !meeting.youtube_url && !manualTranscript.trim())}>
            <Play className="h-4 w-4 mr-2" />
            {processing ? "Processando..." : meeting.status === "enviado" ? "Analisar" : "Tentar novamente"}
          </Button>
        )}
      </div>

      {/* Video/Audio Player — Storage file */}
      {meeting.file_url && !meeting.youtube_url && fileMediaUrl && (() => {
        const isVideo = meeting.file_type === "webm" || meeting.file_type === "mp4" || meeting.file_url!.endsWith(".webm") || meeting.file_url!.endsWith(".mp4");

        return (
          <Collapsible defaultOpen>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="flex flex-row items-center justify-between py-3">
                  <CardTitle className="flex items-center gap-2">
                    {isVideo ? <Video className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    Gravação da Reunião
                  </CardTitle>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  {isVideo ? (
                    <video controls className="w-full rounded-md border" preload="metadata">
                      <source src={fileMediaUrl} type="video/webm" />
                      Seu navegador não suporta o player de vídeo.
                    </video>
                  ) : (
                    <audio controls className="w-full" preload="metadata">
                      <source src={fileMediaUrl} type="audio/webm" />
                      Seu navegador não suporta o player de áudio.
                    </audio>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })()}

      {/* Video/Audio Player — Google Drive link ou link direto para o arquivo */}
      {meeting.youtube_url && (() => {
        const getGoogleDriveEmbedUrl = (url: string): string | null => {
          let match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
          if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
          match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
          if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
          return null;
        };
        const embedUrl = getGoogleDriveEmbedUrl(meeting.youtube_url);
        const directMedia = meeting.youtube_url.match(/\.(mp4|webm|m4a|mp3|ogg)(\?.*)?$/i)?.[1]?.toLowerCase() ?? null;

        if (directMedia) {
          const isVideo = directMedia === "mp4" || directMedia === "webm";
          return (
            <Collapsible defaultOpen>
              <Card>
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="flex flex-row items-center justify-between py-3">
                    <CardTitle className="flex items-center gap-2">
                      {isVideo ? <Video className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      Gravação da Reunião
                    </CardTitle>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    {isVideo ? (
                      <video controls className="w-full rounded-md border" preload="metadata" src={meeting.youtube_url}>
                        Seu navegador não suporta o player de vídeo.
                      </video>
                    ) : (
                      <audio controls className="w-full" preload="metadata" src={meeting.youtube_url}>
                        Seu navegador não suporta o player de áudio.
                      </audio>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        }

        return embedUrl ? (
          <Collapsible defaultOpen>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="flex flex-row items-center justify-between py-3">
                  <CardTitle className="flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    Gravação da Reunião
                  </CardTitle>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-3">
                  <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
                    <iframe
                      src={embedUrl}
                      className="absolute inset-0 w-full h-full rounded-md border"
                      allow="autoplay; encrypted-media"
                      allowFullScreen
                    />
                  </div>
                  <a href={meeting.youtube_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                    <ExternalLink className="h-3 w-3" />
                    Abrir no Google Drive
                  </a>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ) : (
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <Link className="h-5 w-5 text-muted-foreground" />
              <a href={meeting.youtube_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline truncate">
                {meeting.youtube_url}
              </a>
            </CardContent>
          </Card>
        );
      })()}

      {/* Optional manual transcript for link-based meetings */}
      {isLinkBased && (meeting.status === "enviado" || meeting.status === "erro" || isStaleProcessing) && (
        <Collapsible>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle>Já tem a transcrição? Cole aqui (opcional)</CardTitle>
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
      {meeting.status === "ao_vivo" && (
        <LiveMeetingPanel meetingId={meeting.id} />
      )}
      {meeting.status !== "completo" && meeting.status !== "ao_vivo" && (
        <Card>
          <CardContent className="py-8">
            {meeting.status === "enviado" && (
              <div className="text-center">
                <Mic className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
                <h3 className="text-[16px] font-medium">Aguardando análise</h3>
                <p className="text-sm text-muted-foreground">Clique em "Analisar" para iniciar o processamento com IA</p>
              </div>
            )}
            {processingStatuses.includes(meeting.status as (typeof processingStatuses)[number]) && (() => {
              if (isStaleProcessing) {
                return (
                  <div className="space-y-4 text-center">
                    <AlertTriangle className="mx-auto h-8 w-8 text-destructive" strokeWidth={1.5} />
                    <div className="space-y-2">
                      <h3 className="text-[16px] font-medium text-foreground">Processamento travado</h3>
                      <p className="text-sm text-muted-foreground">
                        Essa reunião ficou parada em <span className="font-medium text-foreground">{meeting.status}</span> por mais de 30 minutos.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isLinkBased
                          ? 'Provável causa: o arquivo do Google Drive não concluiu o download automático. Verifique se ele está compartilhado para qualquer pessoa com o link, ou cole a transcrição manualmente, e clique em "Tentar novamente".'
                          : 'Provável causa: o arquivo não concluiu o processamento. Clique em "Tentar novamente".'}
                      </p>
                    </div>
                  </div>
                );
              }

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
              <div className="text-center space-y-2">
                <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" strokeWidth={1.5} />
                <h3 className="text-[16px] font-medium text-foreground">Erro no processamento</h3>
                {meeting.error_message ? (
                  <p className="text-sm text-foreground/90 max-w-xl mx-auto">
                    {meeting.error_message}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {isLinkBased
                      ? 'Não foi possível baixar ou transcrever o arquivo do Google Drive. Confirme o compartilhamento do link, ou cole a transcrição manualmente, e tente novamente.'
                      : 'Não foi possível concluir a análise. Tente novamente.'}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Resultado da análise */}
      {analysis && (
        <AnalysisReport meeting={meeting} analysis={analysis} transcription={transcription} highlights={highlights} />
      )}
    </div>
  );
};

export default MeetingDetail;
