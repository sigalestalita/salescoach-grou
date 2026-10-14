import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Bot, CalendarCheck, CalendarPlus } from "lucide-react";
import {
  botApi, CALENDAR_NAME, CalendarConnection, CalendarProvider, isMeetingUrl, RECORD_MODE_LABEL, RecordMode,
} from "@/lib/bots";

/**
 * Bot que entra na reunião: conectar a agenda (o bot entra sozinho) ou enviar o
 * bot para um link. Fica no topo da página Agendas, para todos os papéis.
 */
export function BotPanel({ meetingTypes, onScheduled }: {
  meetingTypes: { key: string; label: string }[];
  onScheduled?: () => void;
}) {
  const { toast } = useToast();
  const [conn, setConn] = useState<CalendarConnection | null>(null);
  const [providers, setProviders] = useState<CalendarProvider[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ meetingUrl: "", when: "", title: "", meetingType: "", leadName: "", leadCompany: "", leadEmail: "" });

  const load = useCallback(async () => {
    try {
      const r = await botApi.calendar();
      setConn(r.connection?.status === "conectado" ? r.connection : null);
      setProviders(r.providers);
    } catch {
      // Função ainda não publicada: o painel fica só com o envio por link.
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
    if (r === "conectada") toast({ title: "Agenda conectada", description: "O bot vai entrar sozinho nas suas próximas reuniões com clientes." });
    else toast({ title: "Não foi possível conectar a agenda", description: q.get("motivo") ?? undefined, variant: "destructive" });
    q.delete("agenda"); q.delete("motivo");
    window.history.replaceState(null, "", `${window.location.pathname}${q.toString() ? `?${q}` : ""}`);
  }, [toast]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) {
      toast({ title: "Algo deu errado", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const connect = (p: CalendarProvider) => run(`connect:${p}`, async () => {
    const { url } = await botApi.connectCalendar(p);
    window.location.assign(url);
  });

  const setMode = (mode: RecordMode) => run("mode", async () => {
    await botApi.setMode(mode);
    setConn((c) => (c ? { ...c, mode } : c));
    toast({ title: "Preferência salva", description: "As próximas reuniões da agenda seguem a nova regra." });
  });

  const disconnect = () => run("disconnect", async () => {
    await botApi.disconnectCalendar();
    setConn(null);
    toast({ title: "Agenda desconectada", description: "Os bots agendados por ela foram cancelados." });
    onScheduled?.();
  });

  const schedule = () => run("schedule", async () => {
    if (!isMeetingUrl(form.meetingUrl)) throw new Error("Use um link do Google Meet, do Microsoft Teams ou do Zoom.");
    const r = await botApi.schedule({
      meetingUrl: form.meetingUrl.trim(),
      startAt: form.when ? new Date(form.when).toISOString() : null,
      title: form.title.trim() || "Reunião",
      meetingType: form.meetingType || meetingTypes[0]?.key || null,
      leadName: form.leadName.trim(), leadCompany: form.leadCompany.trim(), leadEmail: form.leadEmail.trim(),
    });
    setOpen(false);
    setForm({ meetingUrl: "", when: "", title: "", meetingType: "", leadName: "", leadCompany: "", leadEmail: "" });
    toast({
      title: r.joinAt ? "Bot agendado" : "Bot a caminho",
      description: r.joinAt
        ? `Ele entra às ${new Date(r.joinAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}. Admita o participante se a reunião tiver sala de espera.`
        : "Ele entra em instantes. Admita o participante se a reunião tiver sala de espera.",
    });
    onScheduled?.();
  });

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2"><Bot className="h-5 w-5 text-primary" /></div>
          <div className="space-y-1">
            <p className="font-medium">Bot nas reuniões</p>
            {!loaded ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : conn ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary" className="gap-1"><CalendarCheck className="h-3 w-3" />{CALENDAR_NAME[conn.provider]}</Badge>
                <span>{conn.email}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Conecte a agenda e o bot entra sozinho nas reuniões com clientes, ou envie o bot para um link.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {conn && (
            <>
              <Select value={conn.mode} onValueChange={(v) => setMode(v as RecordMode)} disabled={busy === "mode"}>
                <SelectTrigger className="h-9 w-[300px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(RECORD_MODE_LABEL) as RecordMode[]).map((m) => (
                    <SelectItem key={m} value={m}>{RECORD_MODE_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={disconnect} disabled={!!busy}>Desconectar</Button>
            </>
          )}
          {!conn && providers.map((p) => (
            <Button key={p} variant="outline" size="sm" onClick={() => connect(p)} disabled={!!busy}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              {busy === `connect:${p}` ? "Abrindo…" : `Conectar ${CALENDAR_NAME[p]}`}
            </Button>
          ))}
          <Button size="sm" onClick={() => setOpen(true)} disabled={!!busy}>
            <Bot className="mr-2 h-4 w-4" />
            Enviar o bot
          </Button>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar o bot para uma reunião</DialogTitle>
            <DialogDescription>
              Ele entra como participante, avisa no chat que está gravando e, quando a chamada termina, a análise começa sozinha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="bot-url">Link da reunião</Label>
              <Input id="bot-url" placeholder="https://meet.google.com/abc-defg-hij" value={form.meetingUrl}
                onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })} />
              <p className="text-xs text-muted-foreground">Google Meet, Microsoft Teams ou Zoom.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bot-when">Quando</Label>
              <Input id="bot-when" type="datetime-local" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} />
              <p className="text-xs text-muted-foreground">Em branco, o bot entra agora. Com mais de 10 minutos de antecedência, a entrada é garantida no horário.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="bot-title">Título</Label>
                <Input id="bot-title" placeholder="Diagnóstico com Empresa X" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={form.meetingType || meetingTypes[0]?.key || ""} onValueChange={(v) => setForm({ ...form, meetingType: v })}>
                  <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent>
                    {meetingTypes.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bot-lead">Nome do lead</Label>
                <Input id="bot-lead" value={form.leadName} onChange={(e) => setForm({ ...form, leadName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bot-company">Empresa do lead</Label>
                <Input id="bot-company" value={form.leadCompany} onChange={(e) => setForm({ ...form, leadCompany: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bot-email">E-mail do lead</Label>
              <Input id="bot-email" type="email" value={form.leadEmail} onChange={(e) => setForm({ ...form, leadEmail: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={schedule} disabled={busy === "schedule" || !form.meetingUrl.trim()}>
              {busy === "schedule" ? "Enviando…" : form.when ? "Agendar o bot" : "Enviar agora"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
