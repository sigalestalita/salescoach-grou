import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Mic, ChevronDown, Video, ExternalLink, Link as LinkIcon } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { AnalysisReport } from "@/components/AnalysisReport";

type Meeting = Tables<"meetings">;
type AnalysisResult = Tables<"analysis_results">;
type Transcription = Tables<"transcriptions">;
type Highlight = Tables<"highlights">;

interface Props {
  meeting: Meeting;
  analysis: AnalysisResult | null;
  transcription: Transcription | null;
  highlights: Highlight[];
  mediaUrl: string | null;
}

export const MeetingAnalysisView = ({ meeting, analysis, transcription, highlights, mediaUrl }: Props) => {

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
                <CardTitle className="flex items-center gap-2">
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
                  <CardTitle className="flex items-center gap-2">
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

      {analysis && <AnalysisReport meeting={meeting} analysis={analysis} transcription={transcription} highlights={highlights} />}
    </div>
  );
};
