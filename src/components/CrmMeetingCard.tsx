import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plug, Search, Send } from "lucide-react";
import { CRM_NAME, crmApi, CrmDealRef, CrmJob, CrmProvider, JOB_LABEL, JobResult } from "@/lib/crm";

/**
 * O envio desta reunião ao CRM: a qual negócio ela pertence, o que foi gravado
 * e o botão de enviar. Só aparece quando a organização tem um CRM conectado.
 */

type MeetingCrm = Awaited<ReturnType<typeof crmApi.meeting>>;

const JOB_VARIANT: Record<CrmJob["status"], "secondary" | "destructive" | "outline" | "default"> = {
  enviado: "secondary",
  erro: "destructive",
  aguardando_vinculo: "outline",
  pendente: "outline",
  enviando: "outline",
};

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function CrmMeetingCard({ meetingId }: { meetingId: string }) {
  const { toast } = useToast();
  const [info, setInfo] = useState<MeetingCrm | null>(null);
  const [suggested, setSuggested] = useState<CrmDealRef[]>([]);
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<CrmDealRef[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await crmApi.meeting(meetingId);
      setInfo(data);
      if (data.connection && !data.link && data.lead_email) {
        crmApi.suggestDeals(meetingId).then((r) => setSuggested(r.deals)).catch(() => setSuggested([]));
      }
    } catch {
      setInfo(null);
    }
  }, [meetingId]);

  useEffect(() => { load(); }, [load]);

  if (!info?.connection) return null;
  const provider = info.connection.provider as CrmProvider;
  const last = info.jobs[0];

  const report = (r: JobResult | null) => {
    if (!r) return;
    if (r.status === "enviado") toast({ title: `Enviado ao ${CRM_NAME[provider]}` });
    else if (r.status === "aguardando_vinculo") toast({ title: "Escolha o negócio", description: r.message });
    else toast({ title: r.status === "erro" ? "O envio falhou" : "Envio na fila", description: r.message, variant: r.status === "erro" ? "destructive" : undefined });
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) {
      toast({ title: "Algo deu errado", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); await load(); }
  };

  const link = (deal: CrmDealRef) => run(`link:${deal.id}`, async () => {
    const r = await crmApi.linkDeal(meetingId, deal.id);
    setChoosing(false); setFound(null); setTerm("");
    report(r.result);
  });

  const search = () => run("search", async () => {
    const r = await crmApi.searchDeals(term);
    setFound(r.deals);
  });

  const send = () => run("send", async () => report((await crmApi.send(meetingId)).result));

  const dealList = (deals: CrmDealRef[]) => (
    <ul className="divide-y divide-border rounded-md border border-border">
      {deals.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span>
            {d.name}
            {d.status && d.status !== "ongoing" && <span className="ml-2 text-xs text-muted-foreground">({d.status === "won" ? "ganho" : d.status === "lost" ? "perdido" : "pausado"})</span>}
          </span>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => link(d)}>
            {busy === `link:${d.id}` ? "Enviando…" : "Vincular e enviar"}
          </Button>
        </li>
      ))}
    </ul>
  );

  const chooser = (
    <div className="space-y-3">
      {suggested.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Negócios de {info.lead_email}:</p>
          {dealList(suggested)}
        </div>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (term.trim().length >= 2) search(); }}>
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar negócio pelo nome" />
        <Button type="submit" variant="outline" disabled={term.trim().length < 2 || busy === "search"}>
          <Search className="h-4 w-4" />
        </Button>
      </form>
      {found && (found.length ? dealList(found) : <p className="text-sm text-muted-foreground">Nenhum negócio com esse nome.</p>)}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Plug className="h-5 w-5" />
          {CRM_NAME[provider]}
        </CardTitle>
        <CardDescription>
          {info.link ? <>Negócio: <span className="font-medium text-foreground">{info.link.name ?? info.link.id}</span></> : "Esta reunião ainda não está ligada a um negócio do CRM."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {info.connection.status !== "ativo" && (
          <p className="text-sm text-destructive">A conexão com o CRM precisa ser refeita por um administrador, em Configurações.</p>
        )}

        {last && (
          <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={JOB_VARIANT[last.status]}>{JOB_LABEL[last.status]}</Badge>
              <span className="text-muted-foreground">{quando(last.updated_at)}</span>
            </div>
            {last.last_error && last.status !== "enviado" && <p>{last.last_error}</p>}
            {last.status === "enviado" && last.sent && (
              <ul className="space-y-1 text-muted-foreground">
                <li>{Object.keys(last.sent.campos ?? {}).length} campo(s) atualizado(s){last.sent.etapas?.includes("anotacao") ? ", anotação criada" : ""}</li>
                {last.sent.tarefa && <li>Tarefa "{last.sent.tarefa.nome}" para {last.sent.tarefa.vencimento.split("-").reverse().join("/")}</li>}
                {(last.sent.ignorados ?? []).filter((i) => i.reason !== "sem valor nesta reunião").map((i) => (
                  <li key={i.source}>Não gravado em {i.field}: {i.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!info.link || choosing ? chooser : null}

        <div className="flex flex-wrap gap-2">
          {info.link && !choosing && (
            <Button variant="outline" size="sm" disabled={!!busy} onClick={() => setChoosing(true)}>Trocar negócio</Button>
          )}
          {info.link && !choosing && (
            last?.status === "enviado" ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={!!busy}><Send className="mr-2 h-4 w-4" />Enviar de novo</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Enviar de novo?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Os campos são atualizados conforme as regras do mapeamento, e uma nova anotação e uma nova tarefa
                      são criadas no negócio.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={send}>Enviar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button size="sm" disabled={!!busy} onClick={send}>
                <Send className="mr-2 h-4 w-4" />
                {busy === "send" ? "Enviando…" : last?.status === "erro" ? "Tentar de novo" : "Enviar ao CRM"}
              </Button>
            )
          )}
          {choosing && <Button variant="ghost" size="sm" onClick={() => setChoosing(false)}>Cancelar</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
