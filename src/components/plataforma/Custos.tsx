import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, ChevronDown, DollarSign, RefreshCw, RotateCcw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  APIS, CAMPOS_PRECO, PLANOS, comPadroes, dataLocal, intervaloDoPeriodo, MAX_DIAS_PERIODO, PERIODOS, premissasAtuais, projetar, resumir,
  type Api, type PeriodoChave, type Precos, type Premissas, type Uso,
} from "@/lib/custos";

/**
 * Custos de sustentação das APIs (AssemblyAI, Gemini e Recall.ai): quanto o
 * uso atual custa, quanto isso dá por usuário ativo e uma projeção mensal com
 * premissas editáveis. Dados da função platform-orgs (ações custos e
 * salvar_precos); cálculo em src/lib/custos.ts.
 */

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("platform-orgs", { body });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

type RecallConta = { segundos: number; desde: string; ate: string } | { erro: string } | null;

const diaMes = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const dolares = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
const horas = (min: number) => `${(min / 60).toLocaleString("pt-BR", { maximumFractionDigits: min < 600 ? 1 : 0 })} h`;

function usoDaApi(api: Api, v: number) {
  if (api === "gemini") return `${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi tokens`;
  return horas(v);
}

function Tile({ label, valor, detalhe }: { label: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{valor}</div>
      {detalhe && <div className="mt-0.5 text-xs text-muted-foreground">{detalhe}</div>}
    </div>
  );
}

export function Custos() {
  const { toast } = useToast();
  const [periodo, setPeriodo] = useState<PeriodoChave>("30");
  const [de, setDe] = useState(() => dataLocal(new Date(Date.now() - 30 * 864e5)));
  const [ate, setAte] = useState(() => dataLocal(new Date()));
  // Período do último carregamento (o que os números mostram).
  const [carregado, setCarregado] = useState<{ desde: Date; ate: Date; dias: number } | null>(null);
  const [uso, setUso] = useState<Uso | null>(null);
  const [recall, setRecall] = useState<RecallConta>(null);
  const [precos, setPrecos] = useState<Precos>(comPadroes(null));
  const [precosAtualizados, setPrecosAtualizados] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [premissas, setPremissas] = useState<Premissas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const intervalo = intervaloDoPeriodo(periodo, de, ate);
    if (!intervalo) {
      setErro(`Escolha um período válido: a data inicial antes da final, sem datas futuras e com até ${MAX_DIAS_PERIODO} dias.`);
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const r = await call<{ uso: Uso; recall?: RecallConta; precos: Record<string, unknown> | null; precos_atualizados_em: string | null }>({
        action: "custos", desde: intervalo.desde.toISOString(), ate: intervalo.ate.toISOString(),
      });
      setUso(r.uso);
      setRecall(r.recall ?? null);
      setCarregado(intervalo);
      const p = comPadroes(r.precos);
      setPrecos(p);
      setRascunho(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])));
      setPrecosAtualizados(r.precos_atualizados_em);
      setPremissas(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [periodo, de, ate]);

  useEffect(() => { carregar(); }, [carregar]);

  const dias = carregado?.dias ?? 30;
  const resumo = useMemo(() => (uso ? resumir(uso, precos, dias, recall && "segundos" in recall ? recall.segundos : null) : null), [uso, precos, dias, recall]);
  const atuais = useMemo(() => (resumo ? premissasAtuais(resumo.base) : null), [resumo]);
  const pr = premissas ?? atuais;
  const projecao = useMemo(() => (resumo && pr ? projetar(pr, resumo.base, precos) : null), [resumo, pr, precos]);

  const mes = 30 / Math.max(dias, 1);
  const rotuloPeriodo = carregado
    ? `${diaMes(carregado.desde)} a ${diaMes(new Date(carregado.ate.getTime() - 1))}`
    : "";
  const brl = (usd: number) => reais(usd * precos.cambio);
  const ativos = resumo?.base.usuariosAtivos ?? 0;

  const salvarPrecos = async () => {
    const novos: Record<string, number> = {};
    for (const c of CAMPOS_PRECO) {
      const n = Number(String(rascunho[c.key] ?? "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0) {
        toast({ title: "Preço inválido", description: c.label, variant: "destructive" });
        return;
      }
      novos[c.key] = n;
    }
    setSalvando(true);
    try {
      await call({ action: "salvar_precos", precos: novos });
      setPrecos(comPadroes(novos));
      setPrecosAtualizados(new Date().toISOString());
      toast({ title: "Preços salvos" });
    } catch (e) {
      toast({ title: "Não foi possível salvar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const mudaPremissa = (k: keyof Premissas, v: string, pct = false) => {
    if (!pr) return;
    const n = Number(v.replace(",", "."));
    setPremissas({ ...pr, [k]: Number.isFinite(n) ? (pct ? n / 100 : n) : 0 });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5" /> Custos de API
          </CardTitle>
          <CardDescription>
            Sustentação do Sales Coach: as APIs cobradas por uso (AssemblyAI, Gemini, Recall.ai) e os planos mensais (Lovable, Resend, ElevenLabs), com o gasto atual e a projeção pelo número de usuários e pela utilização.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {periodo === "personalizado" && (
            <div className="flex items-center gap-1.5">
              <Input type="date" aria-label="De" className="w-[150px]" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} />
              <span className="text-sm text-muted-foreground">até</span>
              <Input type="date" aria-label="Até" className="w-[150px]" value={ate} min={de || undefined} max={dataLocal(new Date())} onChange={(e) => setAte(e.target.value)} />
            </div>
          )}
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoChave)}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={carregar} disabled={carregando} title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {erro && <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{erro}</p>}
        {!resumo && carregando && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {resumo && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile
                label={`Gasto no período (${rotuloPeriodo})`}
                valor={brl(resumo.totalComPlanosUsd)}
                detalhe={`APIs ${brl(resumo.totalUsd)} + planos ${brl(resumo.planosUsd)}`}
              />
              <Tile
                label="Por usuário ativo / mês"
                valor={ativos ? brl((resumo.totalComPlanosUsd / ativos) * mes) : "—"}
                detalhe={ativos ? `só APIs: ${brl((resumo.totalUsd / ativos) * mes)}` : "sem usuários ativos no período"}
              />
              <Tile label="Usuários ativos" valor={inteiro(ativos)} detalhe={`de ${inteiro(resumo.base.usuarios)} com acesso hoje`} />
              <Tile label="Reuniões" valor={inteiro(resumo.base.reunioes)} detalhe={horas(resumo.base.minutos)} />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Por API</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>API</TableHead>
                    <TableHead className="text-right">Uso no período</TableHead>
                    <TableHead className="text-right">Custo no período</TableHead>
                    <TableHead className="text-right">Por usuário ativo / mês</TableHead>
                    <TableHead className="text-right">Projeção / mês</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {APIS.map((a) => (
                    <TableRow key={a.key}>
                      <TableCell className="font-medium">{a.nome}</TableCell>
                      <TableCell className="text-right">{usoDaApi(a.key, resumo.usoPorApi[a.key])}</TableCell>
                      <TableCell className="text-right">{brl(resumo.porApi[a.key])}</TableCell>
                      <TableCell className="text-right">{ativos ? brl((resumo.porApi[a.key] / ativos) * mes) : "—"}</TableCell>
                      <TableCell className="text-right font-medium">{projecao ? brl(projecao.porApi[a.key]) : "—"}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold">{brl(resumo.totalUsd)}</TableCell>
                    <TableCell className="text-right font-semibold">{ativos ? brl((resumo.totalUsd / ativos) * mes) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{projecao ? brl(projecao.totalUsd) : "—"}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-muted-foreground">
                {resumo.recallFonte === "conta" && recall && "segundos" in recall
                  ? `Recall: horas de robô da conta na Recall de ${diaMes(new Date(recall.desde))} a ${diaMes(new Date(new Date(recall.ate).getTime() - 1))} (dias inteiros, em UTC), divididas entre as empresas pelo tempo dos robôs de cada uma.`
                  : `Recall: tempo dos robôs registrado no Sales Coach${recall && "erro" in recall ? ` (a conta na Recall não respondeu: ${recall.erro})` : ""}.`}
              </p>
              <h3 className="mb-2 mt-6 text-sm font-semibold">Planos mensais</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead className="text-right">Uso no período</TableHead>
                    <TableHead className="text-right">No período</TableHead>
                    <TableHead className="text-right">Por usuário ativo / mês</TableHead>
                    <TableHead className="text-right">Por mês</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PLANOS.map((x) => {
                    const porMes = precos[x.preco];
                    const usoTexto =
                      x.key === "elevenlabs" ? `${inteiro(resumo.voz.elevenlabs)} caracteres`
                      : x.key === "resend" ? (resumo.emails != null ? `${inteiro(resumo.emails)} e-mails` : "—")
                      : "—";
                    return (
                      <TableRow key={x.key}>
                        <TableCell className="font-medium">{x.nome}</TableCell>
                        <TableCell className="text-right">{usoTexto}</TableCell>
                        <TableCell className="text-right">{brl(porMes * (dias / 30))}</TableCell>
                        <TableCell className="text-right">{ativos ? brl(porMes / ativos) : "—"}</TableCell>
                        <TableCell className="text-right font-medium">{porMes > 0 ? brl(porMes) : <span className="text-muted-foreground">preencha</span>}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow>
                    <TableCell className="font-semibold">Total com planos</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-semibold">{brl(resumo.totalComPlanosUsd)}</TableCell>
                    <TableCell className="text-right font-semibold">{ativos ? brl((resumo.totalComPlanosUsd / ativos) * mes) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{projecao ? brl(projecao.totalComPlanosUsd) : "—"}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-muted-foreground">
                Valor mensal de cada plano em "Preços usados no cálculo", só a parte que cabe ao Sales Coach (a assinatura da Lovable e a
                conta da Resend são divididas com outros produtos). O Gemini passa pelo gateway da Lovable e já está em "Por API"; não some de
                novo no Lovable Cloud. E-mails: os registrados pelo Sales Coach (novidades); convites e troca de senha não entram.
                {resumo.voz.outras > 0 && ` Vozes de reserva (fora da ElevenLabs): ${inteiro(resumo.voz.outras)} caracteres.`}
              </p>
              {resumo.outrosChamadas > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {inteiro(resumo.outrosChamadas)} chamadas de outros serviços (CRMs, voz, armazenamento) não têm custo por uso nesta tabela; a voz entra nos planos.
                </p>
              )}
            </div>

            {pr && projecao && (
              <div className="rounded-xl border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold"><Calculator className="h-4 w-4" /> Projeção mensal</h3>
                  <div className="flex items-center gap-2">
                    {resumo.base.estimada && <Badge variant="outline">Sem uso no período: base estimada</Badge>}
                    <Button variant="ghost" size="sm" onClick={() => setPremissas(null)} disabled={!premissas}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Voltar ao uso atual
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  {([
                    ["usuarios", "Usuários ativos", pr.usuarios, false],
                    ["reunioesPorUsuarioMes", "Reuniões por usuário / mês", pr.reunioesPorUsuarioMes, false],
                    ["minutosPorReuniao", "Minutos por reunião", pr.minutosPorReuniao, false],
                    ["pctRobo", "% gravadas pelo robô", Math.round(pr.pctRobo * 100), true],
                    ["pctAoVivo", "% com coach ao vivo", Math.round(pr.pctAoVivo * 100), true],
                  ] as [keyof Premissas, string, number, boolean][]).map(([k, label, v, pct]) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <Input type="number" min={0} max={pct ? 100 : undefined} value={v} onChange={(e) => mudaPremissa(k, e.target.value, pct)} />
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Tile
                    label="Custo por mês"
                    valor={brl(projecao.totalComPlanosUsd)}
                    detalhe={`APIs ${brl(projecao.totalUsd)} + planos ${brl(projecao.planosUsd)}`}
                  />
                  <Tile
                    label="Por usuário / mês"
                    valor={brl(projecao.porUsuarioComPlanosUsd)}
                    detalhe={`só APIs: ${brl(projecao.porUsuarioUsd)}`}
                  />
                  <Tile label="Por ano" valor={brl(projecao.totalComPlanosUsd * 12)} />
                  <Tile label="Horas de reunião / mês" valor={inteiro(projecao.minutosMes / 60)} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  As premissas começam com o uso real do período. O consumo de IA por minuto de reunião, as trilhas do coach ao vivo
                  e o uso fora das reuniões (assistente, treinos, dica do dia) vêm do período escolhido.
                </p>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-semibold">Por empresa</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="text-right">Ativos / com acesso</TableHead>
                    <TableHead className="text-right">Reuniões</TableHead>
                    <TableHead className="text-right">Horas</TableHead>
                    <TableHead className="text-right">Custo no período</TableHead>
                    <TableHead className="text-right">Por ativo / mês</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumo.porEmpresa.filter((e) => e.usd > 0 || e.reunioes > 0 || e.usuarios_ativos > 0).map((e) => (
                    <TableRow key={e.org_id}>
                      <TableCell className="font-medium">{e.nome}</TableCell>
                      <TableCell className="text-right">{inteiro(e.usuarios_ativos)} / {inteiro(e.usuarios)}</TableCell>
                      <TableCell className="text-right">{inteiro(e.reunioes)}</TableCell>
                      <TableCell className="text-right">{horas(e.minutos)}</TableCell>
                      <TableCell className="text-right">{brl(e.usd)}</TableCell>
                      <TableCell className="text-right">{e.usuarios_ativos ? brl((e.usd / e.usuarios_ativos) * mes) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  Preços usados no cálculo <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {CAMPOS_PRECO.map((c) => (
                    <div key={c.key} className="space-y-1">
                      <Label className="text-xs">{c.label} <span className="text-muted-foreground">({c.unidade})</span></Label>
                      <Input
                        inputMode="decimal"
                        value={rascunho[c.key] ?? ""}
                        onChange={(e) => setRascunho((r) => ({ ...r, [c.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" onClick={salvarPrecos} disabled={salvando}>
                    <Save className="mr-1 h-3.5 w-3.5" /> Salvar preços
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {precosAtualizados
                      ? `Atualizados em ${new Date(precosAtualizados).toLocaleDateString("pt-BR")}.`
                      : "Usando os preços de tabela de nov/2026 (Recall no plano Startup)."}{" "}
                    Confira com as faturas de cada fornecedor.
                  </span>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  );
}
