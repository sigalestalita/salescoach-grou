import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Bot, Loader2 } from "lucide-react";
import { BOT_STATUS_LABEL, botApi, MeetingBot } from "@/lib/bots";

const ATIVO: MeetingBot["status"][] = ["agendado", "entrando", "sala_de_espera", "gravando", "processando"];

/** Situação do bot na página da reunião, com a opção de cancelar. */
export function MeetingBotStatus({ meetingId, onCancelled }: { meetingId: string; onCancelled?: () => void }) {
  const { toast } = useToast();
  const [bot, setBot] = useState<MeetingBot | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setBot((await botApi.meeting(meetingId)).bot); } catch { setBot(null); }
  }, [meetingId]);

  useEffect(() => {
    load();
    // Acompanha o bot enquanto ele está ativo.
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  if (!bot || bot.status === "concluido" || bot.status === "cancelado") return null;
  const ativo = ATIVO.includes(bot.status);

  const cancel = async () => {
    setBusy(true);
    try {
      await botApi.cancel(meetingId);
      toast({ title: "Bot cancelado" });
      onCancelled?.();
      await load();
    } catch (e) {
      toast({ title: "Não foi possível cancelar", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            {bot.status === "entrando" || bot.status === "processando"
              ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
              : <Bot className="h-5 w-5 text-primary" />}
          </div>
          <div>
            <p className="font-medium">{BOT_STATUS_LABEL[bot.status]}</p>
            <p className="text-sm text-muted-foreground">
              {bot.status === "agendado" && bot.join_at
                ? `Entra em ${new Date(bot.join_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                : bot.status_detail ?? (bot.status === "gravando" ? "A análise começa sozinha quando a chamada terminar." : "")}
            </p>
          </div>
        </div>
        {ativo && bot.status !== "processando" && (
          <Button variant="outline" size="sm" onClick={cancel} disabled={busy}>
            {bot.status === "agendado" ? "Cancelar o bot" : "Tirar o bot da reunião"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
