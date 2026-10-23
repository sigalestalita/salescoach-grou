import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CalendarCheck, CalendarPlus, AlertCircle } from "lucide-react";
import { CALENDAR_NAME, calendarApi, CalendarConnection, CalendarProvider } from "@/lib/calendar";
import { GoogleCalendarGuide } from "@/components/GoogleCalendarGuide";

/**
 * Conexão da agenda do vendedor (Google Agenda ou Outlook). Com ela, a extensão
 * grava já com o título da agenda, os participantes e o lead. Fica no topo da
 * página Agendas, para todos os papéis.
 */
export function CalendarConnect() {
  const { toast } = useToast();
  const [conn, setConn] = useState<CalendarConnection | null>(null);
  const [providers, setProviders] = useState<CalendarProvider[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Voltou do Google com erro: o passo a passo já abre.
  const [returnedWithError, setReturnedWithError] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await calendarApi.status();
      setConn(r.connection);
      setProviders(r.providers);
    } catch {
      // Função ainda não publicada ou agenda não configurada: o cartão some.
      setProviders([]);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Volta do OAuth: ?agenda=conectada ou ?agenda=erro&motivo=...
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("agenda");
    if (!r) return;
    if (r === "conectada") {
      toast({ title: "Agenda conectada", description: "As próximas gravações já vêm com o título, os participantes e o lead." });
    } else {
      setReturnedWithError(true);
      toast({ title: "Não foi possível conectar a agenda", description: q.get("motivo") ?? undefined, variant: "destructive" });
    }
    q.delete("agenda"); q.delete("motivo");
    window.history.replaceState(null, "", `${window.location.pathname}${q.toString() ? `?${q}` : ""}`);
  }, [toast]);

  const connect = async (p: CalendarProvider) => {
    setBusy(p);
    try {
      const { url } = await calendarApi.connect(p);
      window.location.assign(url);
    } catch (e) {
      toast({ title: "Não foi possível conectar", description: (e as Error).message, variant: "destructive" });
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await calendarApi.disconnect();
      setConn(null);
      toast({ title: "Agenda desconectada" });
    } catch (e) {
      toast({ title: "Não foi possível desconectar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  // Nada configurado na plataforma e nada conectado: não ocupa espaço.
  if (!loaded || (!conn && providers.length === 0)) return null;
  const broken = conn?.status === "erro";
  const showGuide = (!conn || broken) && (providers.includes("google") || conn?.provider === "google");

  return (
    <Card data-tour="agenda-conectar">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            {broken ? <AlertCircle className="h-5 w-5 text-destructive" /> : <CalendarCheck className="h-5 w-5 text-primary" />}
          </div>
          <div className="space-y-1">
            <p className="font-medium">Sua agenda</p>
            {conn ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant={broken ? "destructive" : "secondary"}>{CALENDAR_NAME[conn.provider]}</Badge>
                <span>{conn.email}</span>
                {broken && <span className="text-destructive">{conn.last_error ?? "Conecte de novo."}</span>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Conecte a agenda e as gravações já vêm com o título, os participantes e o lead de cada reunião.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {conn && !broken && (
            <Button variant="ghost" size="sm" onClick={disconnect} disabled={!!busy}>Desconectar</Button>
          )}
          {(!conn || broken) && providers.map((p) => (
            <Button key={p} variant="outline" size="sm" onClick={() => connect(p)} disabled={!!busy}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              {busy === p ? "Abrindo…" : `${broken && conn?.provider === p ? "Reconectar" : "Conectar"} ${CALENDAR_NAME[p]}`}
            </Button>
          ))}
        </div>
        {showGuide && <GoogleCalendarGuide defaultOpen={broken || returnedWithError} />}
      </CardContent>
    </Card>
  );
}
