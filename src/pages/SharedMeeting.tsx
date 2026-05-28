import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { MeetingAnalysisView } from "@/components/MeetingAnalysisView";
import { TooltipProvider } from "@/components/ui/tooltip";
import logo from "@/assets/logo.png";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-shared-meeting`;

const SharedMeeting = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${FUNCTION_URL}?token=${encodeURIComponent(token)}`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        if (!res.ok) {
          setError(res.status === 404 ? "Link inválido ou expirado." : "Não foi possível carregar a análise.");
          return;
        }
        setData(await res.json());
      } catch (e) {
        setError("Erro ao carregar.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando análise…</div>;
  if (error || !data) return <div className="min-h-screen flex items-center justify-center text-destructive">{error || "Não encontrado"}</div>;

  const { meeting, analysis, transcription, highlights, mediaUrl, seller } = data;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card/50 backdrop-blur sticky top-0 z-10">
          <div className="container max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <img src={logo} alt="Sales Coach" className="h-8" />
            <span className="text-xs text-muted-foreground">Análise compartilhada</span>
          </div>
        </header>
        <main className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{meeting.title}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mt-1">
              {seller?.full_name && <span>Vendedor: {seller.full_name}</span>}
              {meeting.lead_name && <span>• {meeting.lead_name}</span>}
              {meeting.lead_company && <span>• {meeting.lead_company}</span>}
              {meeting.meeting_date && <span>• {new Date(meeting.meeting_date).toLocaleDateString("pt-BR")}</span>}
            </div>
          </div>
          <MeetingAnalysisView
            meeting={meeting}
            analysis={analysis}
            transcription={transcription}
            highlights={highlights || []}
            mediaUrl={mediaUrl}
          />
        </main>
      </div>
    </TooltipProvider>
  );
};

export default SharedMeeting;
