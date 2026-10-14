import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Link2, Plug, RefreshCw } from "lucide-react";
import {
  compatible, CRM_NAME, crmApi, CrmConnection, CrmField, CrmMapping, CrmProvider, CrmSettings as Prefs, CrmSource,
} from "@/lib/crm";

/**
 * Integração com CRM (admin). Conecta o CRM (RD Station, HubSpot ou Pipedrive) por OAuth e define em
 * qual campo do negócio cada dado do Sales Coach é gravado ao fim da análise.
 */

const NAO_ENVIAR = "__nao_enviar__";
/** CRMs que já conectam, com o que a pessoa vai ver ao clicar. */
const DISPONIVEIS: [CrmProvider, string][] = [
  ["rdstation", "Você autoriza no RD Station e volta para cá."],
  ["hubspot", "Você escolhe a conta do HubSpot, autoriza e volta para cá."],
  ["pipedrive", "Você entra no Pipedrive, escolhe a empresa, autoriza e volta para cá."],
];

/** Dados que valem um campo próprio no CRM; o resto já vai na anotação. */
const SUGERIDOS = ["nota", "temperatura", "proximo_passo", "data_proximo_passo", "link_analise"];

export function CrmSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<CrmConnection | null>(null);
  const [mappings, setMappings] = useState<CrmMapping[]>([]);
  const [catalog, setCatalog] = useState<CrmSource[]>([]);
  const [fields, setFields] = useState<CrmField[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await crmApi.status();
      setConnection(s.connection);
      setMappings(s.mappings);
      setCatalog(s.catalog);
      if (s.connection) {
        const f = await crmApi.fields().catch(() => null);
        setFields(f?.fields ?? null);
      }
    } catch (e) {
      toast({ title: "Não foi possível carregar a integração", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Volta do OAuth: ?crm=conectado ou ?crm=erro&motivo=...
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("crm");
    if (!r) return;
    if (r === "conectado") toast({ title: "CRM conectado", description: "Agora escolha em quais campos cada dado é gravado." });
    else toast({ title: "Não foi possível conectar o CRM", description: q.get("motivo") ?? undefined, variant: "destructive" });
    q.delete("crm"); q.delete("motivo");
    window.history.replaceState(null, "", `${window.location.pathname}${q.toString() ? `?${q}` : ""}`);
  }, [toast]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) {
      toast({ title: "Algo deu errado", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const connect = (provider: CrmProvider) => run(`connect:${provider}`, async () => {
    const { url } = await crmApi.connect(provider);
    window.location.assign(url);
  });

  const savePrefs = (p: Prefs) => run("prefs", async () => {
    const { settings } = await crmApi.saveSettings(p);
    setConnection((c) => (c ? { ...c, settings } : c));
  });

  const setMapping = (source: CrmSource, target: string, mode: "sempre" | "se_vazio") =>
    run(`map:${source.key}`, async () => {
      await crmApi.saveMapping(source.key, target === NAO_ENVIAR ? null : target, mode);
      const s = await crmApi.status();
      setMappings(s.mappings);
    });

  const createFields = () => run("create", async () => {
    const wanted = catalog.filter((s) => SUGERIDOS.includes(s.key) || s.key.startsWith("criterio:")).map((s) => s.key);
    const { created } = await crmApi.createFields(wanted);
    toast({ title: `${created.length} campos prontos no ${connection ? CRM_NAME[connection.provider] : "CRM"}`, description: "O mapeamento já foi preenchido." });
    await load();
  });

  const disconnect = () => run("disconnect", async () => {
    await crmApi.disconnect();
    setConnection(null); setFields(null);
    toast({ title: "CRM desconectado" });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Plug className="h-5 w-5" />
          Integração com CRM
        </CardTitle>
        <CardDescription>
          Ao fim de cada análise, o Sales Coach grava nota, temperatura, critérios e próximos passos no negócio do CRM (RD Station CRM, HubSpot ou Pipedrive),
          cria uma anotação com o resumo e uma tarefa com o próximo passo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !connection ? (
          <div className="space-y-3">
            {DISPONIVEIS.map(([provider, hint]) => (
              <div key={provider} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4">
                <div>
                  <p className="font-medium">{CRM_NAME[provider]}</p>
                  <p className="text-sm text-muted-foreground">{hint}</p>
                </div>
                <Button onClick={() => connect(provider)} disabled={!!busy}>
                  <Link2 className="mr-2 h-4 w-4" />
                  {busy === `connect:${provider}` ? "Abrindo…" : "Conectar"}
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">O Kommo chega em seguida. Uma empresa usa um CRM por vez.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{CRM_NAME[connection.provider]}</p>
                  <Badge variant={connection.status === "ativo" ? "secondary" : "destructive"}>
                    {connection.status === "ativo" ? "Conectado" : "Precisa reconectar"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Desde {new Date(connection.connected_at).toLocaleDateString("pt-BR")}
                  {connection.last_error ? ` · ${connection.last_error}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {connection.status !== "ativo" && (
                  <Button onClick={() => connect(connection.provider)} disabled={!!busy}>Reconectar</Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={busy === "disconnect"}>Desconectar</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Desconectar o CRM?</AlertDialogTitle>
                      <AlertDialogDescription>
                        As próximas análises deixam de ir para o {CRM_NAME[connection.provider]}. O que já foi enviado continua lá.
                        O mapeamento de campos fica salvo para quando reconectar. Para trocar de CRM, desconecte e conecte o outro.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={disconnect}>Desconectar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {([
                ["envio_automatico", "Enviar ao fim de cada análise", "Desligado, o envio é feito pelo botão na reunião."],
                ["criar_anotacao", "Criar anotação com o resumo", "Nota, critérios, dores e próximos passos."],
                ["criar_tarefa", "Criar tarefa do próximo passo", "Com a data combinada ou em 2 dias úteis."],
              ] as const).map(([key, label, hint]) => (
                <div key={key} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div>
                    <Label htmlFor={`crm-${key}`}>{label}</Label>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                  <Switch
                    id={`crm-${key}`}
                    checked={connection.settings?.[key] !== false}
                    disabled={busy === "prefs"}
                    onCheckedChange={(v) => savePrefs({ [key]: v })}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-medium">Campos do negócio</p>
                  <p className="text-sm text-muted-foreground">
                    Escolha o campo do CRM para cada dado. "Só se vazio" não apaga o que o vendedor já preencheu.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => run("reload", load)} disabled={!!busy}>
                    <RefreshCw className="mr-2 h-4 w-4" />Atualizar campos
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" disabled={!!busy}>Criar campos do Sales Coach</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Criar campos no {CRM_NAME[connection.provider]}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Cria no negócio os campos "Sales Coach · Nota da reunião", "Temperatura", "Próximo passo",
                          "Data do próximo passo", "Link da análise" e um por critério da metodologia, e já liga cada um.
                          Campos com o mesmo nome são reaproveitados.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={createFields}>Criar campos</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {fields === null ? (
                <p className="text-sm text-muted-foreground">Não foi possível ler os campos do CRM agora. Tente "Atualizar campos".</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dado do Sales Coach</TableHead>
                      <TableHead>Campo no CRM</TableHead>
                      <TableHead className="w-44">Regra</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalog.map((src) => {
                      const m = mappings.find((x) => x.source_key === src.key);
                      const options = fields.filter((f) => compatible(src.type, f.type));
                      const current = m?.target_field ?? NAO_ENVIAR;
                      return (
                        <TableRow key={src.key}>
                          <TableCell>
                            <p className="font-medium">{src.label}</p>
                            <p className="text-xs text-muted-foreground">{src.description}</p>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={current}
                              disabled={busy === `map:${src.key}`}
                              onValueChange={(v) => setMapping(src, v, m?.mode ?? "se_vazio")}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NAO_ENVIAR}>Não enviar</SelectItem>
                                {m && !options.some((f) => f.key === m.target_field) && (
                                  <SelectItem value={m.target_field}>{m.target_label ?? m.target_field}</SelectItem>
                                )}
                                {options.map((f) => (
                                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={m?.mode ?? "se_vazio"}
                              disabled={!m || busy === `map:${src.key}`}
                              onValueChange={(v) => m && setMapping(src, m.target_field, v as "sempre" | "se_vazio")}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="se_vazio">Só se vazio</SelectItem>
                                <SelectItem value="sempre">Sempre</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
