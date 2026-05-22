import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio } from "lucide-react";

type Segment = { id: string; text: string; speaker: string | null; created_at: string };
type Tip = {
  id: string;
  categoria: string;
  urgencia: string;
  titulo: string;
  acao: string | null;
  emitted_at: string;
};

export function LiveMeetingPanel({ meetingId }: { meetingId: string }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const [{ data: segs }, { data: t }] = await Promise.all([
        supabase
          .from("transcription_segments")
          .select("id, text, speaker, created_at")
          .eq("meeting_id", meetingId)
          .order("created_at", { ascending: true })
          .limit(200),
        supabase
          .from("live_tips")
          .select("id, categoria, urgencia, titulo, acao, emitted_at")
          .eq("meeting_id", meetingId)
          .order("emitted_at", { ascending: false })
          .limit(20),
      ]);
      if (!mounted) return;
      setSegments((segs as Segment[]) || []);
      setTips((t as Tip[]) || []);
    })();

    const ch = supabase
      .channel(`live-${meetingId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transcription_segments", filter: `meeting_id=eq.${meetingId}` },
        (payload) => setSegments((prev) => [...prev, payload.new as Segment]),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_tips", filter: `meeting_id=eq.${meetingId}` },
        (payload) => setTips((prev) => [payload.new as Tip, ...prev].slice(0, 20)),
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [meetingId]);

  const urgencyColor = (u: string) =>
    u === "alta" ? "destructive" : u === "baixa" ? "secondary" : "default";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary animate-pulse" />
            Dicas ao vivo
            <Badge variant="outline" className="ml-auto">{tips.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[480px] overflow-y-auto">
          {tips.length === 0 && (
            <p className="text-xs text-muted-foreground">Ainda sem dicas. O coach analisará a conversa a cada turno do lead.</p>
          )}
          {tips.map((t) => (
            <div key={t.id} className="rounded-md border border-border bg-card/50 p-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
                <span className="text-primary font-semibold">{t.categoria}</span>
                <Badge variant={urgencyColor(t.urgencia) as any} className="h-4 text-[9px]">{t.urgencia}</Badge>
              </div>
              <p className="text-sm font-medium">{t.titulo}</p>
              {t.acao && <p className="text-xs text-muted-foreground italic">{t.acao}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Transcrição ao vivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 max-h-[480px] overflow-y-auto text-sm">
          {segments.length === 0 && (
            <p className="text-xs text-muted-foreground">Aguardando primeiras falas…</p>
          )}
          {segments.map((s) => (
            <p key={s.id} className="leading-snug">
              <span className="text-muted-foreground text-xs mr-2">[{s.speaker || "?"}]</span>
              {s.text}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
