import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bot, Dumbbell, FileAudio, LogIn, RefreshCw, Search, Settings2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  haQuanto, normalizaPessoa, saudePorEmpresa, TIPOS,
  type EmpresaSaude, type Evento, type PessoaAtividade, type TipoEvento,
} from "@/lib/atividade";
import { desatualizada } from "@/lib/extensaoVersao";

/**
 * Atividade dos usuários de todas as empresas (tela Plataforma): linha do
 * tempo, resumo por pessoa, saúde de cada empresa e erros recentes. Só
 * metadados (quem, o quê, quando, custo); o conteúdo das reuniões continua
 * só no modo suporte. Dados da função platform-orgs (ações activity e
 * activity_people).
 */

const PAGINA = 100;
const TODAS = "_todas";
const PERIODOS = [
  { key: "1", label: "Últimas 24 horas" },
  { key: "7", label: "Últimos 7 dias" },
  { key: "30", label: "Últimos 30 dias" },
  { key: "90", label: "Últimos 90 dias" },
];
const ICONE: Record<TipoEvento, typeof Activity> = {
  login: LogIn, reuniao: FileAudio, analise: Sparkles, erro: AlertTriangle, treino: Dumbbell, assistente: Bot, admin: Settings2,
};
const COR: Record<TipoEvento, string> = {
  login: "text-sky-600", reuniao: "text-indigo-600", analise: "text-emerald-600", erro: "text-destructive",
  treino: "text-amber-600", assistente: "text-violet-600", admin: "text-muted-foreground",
};
const PAPEL: Record<string, string> = { admin: "Admin", gestor: "Gestor", vendedor: "Executivo" };
const SAUDE: Record<EmpresaSaude["saude"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  saudavel: { label: "Saudável", variant: "secondary" },
  atencao: { label: "Atenção", variant: "outline" },
  sem_uso: { label: "Sem uso", variant: "destructive" },
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("platform-orgs", { body });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dolar = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const desde = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();

export function Atividade({ orgs }: { orgs: { id: string; name: string }[] }) {
  const [aba, setAba] = useState("linha");
  const [periodo, setPeriodo] = useState("7");
  const [org, setOrg] = useState(TODAS);
  const [tipo, setTipo] = useState(TODAS);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [pessoas, setPessoas] = useState<PessoaAtividade[] | null>(null);
  // Versão atual da extensão na loja: abaixo dela, a pessoa vê o aviso no app.
  const [extensaoAtual, setExtensaoAtual] = useState<string | null>(null);
  const [extensaoCampo, setExtensaoCampo] = useState("");
  const [salvandoExtensao, setSalvandoExtensao] = useState(false);
  const [erros, setErros] = useState<Evento[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const filtros = useMemo(() => ({
    desde: desde(Number(periodo)),
    org_id: org === TODAS ? null : org,
    tipo: tipo === TODAS ? null : tipo,
    busca: buscaAplicada || null,
  }), [periodo, org, tipo, buscaAplicada]);

  const carregarEventos = useCallback(async (offset = 0) => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await call<{ events: Evento[] }>({ action: "activity", ...filtros, limite: PAGINA, offset });
      setEventos((prev) => (offset && prev ? [...prev, ...r.events] : r.events));
      setTemMais(r.events.length === PAGINA);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  const carregarPessoas = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await call<{ people: PessoaAtividade[]; extensao_atual?: string | null }>({ action: "activity_people", desde: desde(Number(periodo)) });
      setPessoas(r.people.map(normalizaPessoa));
      setExtensaoAtual(r.extensao_atual ?? null);
      setExtensaoCampo(r.extensao_atual ?? "");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  const carregarErros = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await call<{ events: Evento[] }>({ action: "activity", desde: desde(14), tipo: "erro", limite: 300 });
      setErros(r.events);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { if (aba === "linha") carregarEventos(0); }, [aba, carregarEventos]);
  useEffect(() => { if (aba === "pessoas" || aba === "empresas") carregarPessoas(); }, [aba, carregarPessoas]);
  useEffect(() => { if (aba === "erros") carregarErros(); }, [aba, carregarErros]);

  const recarregar = () => (aba === "linha" ? carregarEventos(0) : aba === "erros" ? carregarErros() : carregarPessoas());

  const salvarExtensaoAtual = async () => {
    setSalvandoExtensao(true);
    setErro(null);
    try {
      const r = await call<{ extensao_atual: string | null }>({ action: "set_extensao_atual", versao: extensaoCampo.trim() });
      setExtensaoAtual(r.extensao_atual);
      setExtensaoCampo(r.extensao_atual ?? "");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvandoExtensao(false);
    }
  };

  /** Abre a linha do tempo já filtrada pela empresa ou pela pessoa. */
  const verNaLinha = (f: { org?: string; email?: string }) => {
    setOrg(f.org ?? TODAS);
    setBusca(f.email ?? "");
    setBuscaAplicada(f.email ?? "");
    setTipo(TODAS);
    setAba("linha");
  };

  const pessoasFiltradas = useMemo(() => {
    if (!pessoas) return null;
    const q = buscaAplicada.toLowerCase();
    return pessoas
      .filter((p) => (org === TODAS || p.org_id === org) && (!q || p.email.toLowerCase().includes(q) || (p.nome ?? "").toLowerCase().includes(q)))
      .sort((a, b) => (b.ultima_atividade ?? "").localeCompare(a.ultima_atividade ?? ""));
  }, [pessoas, org, buscaAplicada]);
  const empresas = useMemo(() => (pessoas ? saudePorEmpresa(pessoas) : null), [pessoas]);
  const errosPorEmpresa = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of erros ?? []) m.set(e.org_nome ?? "—", (m.get(e.org_nome ?? "—") ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [erros]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-5 w-5" /> Atividade dos usuários</CardTitle>
          <CardDescription>
            Quem entrou, gravou, treinou ou teve erro, em todas as empresas. Só metadados: o conteúdo das reuniões não aparece aqui.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={recarregar} disabled={carregando}>
          <RefreshCw className={`mr-2 h-4 w-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs value={aba} onValueChange={setAba}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <TabsList>
              <TabsTrigger value="linha">Linha do tempo</TabsTrigger>
              <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
              <TabsTrigger value="empresas">Empresas</TabsTrigger>
              <TabsTrigger value="erros">Erros</TabsTrigger>
            </TabsList>
            {aba !== "erros" && (
              <Select value={periodo} onValueChange={setPeriodo}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>{PERIODOS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {(aba === "linha" || aba === "pessoas") && (
              <>
                <Select value={org} onValueChange={setOrg}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Empresa" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODAS}>Todas as empresas</SelectItem>
                    {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <form className="relative" onSubmit={(e) => { e.preventDefault(); setBuscaAplicada(busca.trim()); }}>
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="w-[220px] pl-8" placeholder="Pessoa (nome ou e-mail)" value={busca}
                    onChange={(e) => { setBusca(e.target.value); if (!e.target.value) setBuscaAplicada(""); }}
                    onBlur={() => setBuscaAplicada(busca.trim())}
                  />
                </form>
              </>
            )}
            {aba === "linha" && (
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todos os tipos</SelectItem>
                  {TIPOS.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {erro && <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{erro}</p>}

          <TabsContent value="linha" className="mt-0">
            {eventos === null ? <Carregando /> : eventos.length === 0 ? (
              <Vazio texto="Nenhuma atividade com esses filtros." />
            ) : (
              <>
                <ul className="divide-y rounded-md border">
                  {eventos.map((e, i) => {
                    const Icone = ICONE[e.tipo] ?? Activity;
                    return (
                      <li key={`${e.tipo}-${e.ref ?? ""}-${e.em}-${i}`} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                        <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${COR[e.tipo] ?? ""}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-medium">{e.titulo}</span>
                            {e.detalhe && <span className={`truncate text-xs ${e.tipo === "erro" ? "text-destructive" : "text-muted-foreground"}`}>{e.detalhe}</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <button className="hover:underline" onClick={() => verNaLinha({ org: e.org_id ?? undefined, email: e.email ?? undefined })}>
                              {e.nome || e.email || "Sistema"}
                            </button>
                            {e.org_nome && (
                              <> · <button className="hover:underline" onClick={() => e.org_id && verNaLinha({ org: e.org_id })}>{e.org_nome}</button></>
                            )}
                          </div>
                        </div>
                        <time className="shrink-0 text-xs tabular-nums text-muted-foreground" title={new Date(e.em).toLocaleString("pt-BR")}>{quando(e.em)}</time>
                      </li>
                    );
                  })}
                </ul>
                {temMais && (
                  <div className="mt-3 text-center">
                    <Button variant="ghost" size="sm" disabled={carregando} onClick={() => carregarEventos(eventos.length)}>Carregar mais</Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="pessoas" className="mt-0">
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="font-medium">Versão atual da extensão na loja</span>
              <Input
                value={extensaoCampo}
                onChange={(e) => setExtensaoCampo(e.target.value)}
                placeholder="ex.: 1.13.1"
                className="h-8 w-28"
                aria-label="Versão atual da extensão na loja"
              />
              <Button size="sm" variant="outline" disabled={salvandoExtensao || extensaoCampo.trim() === (extensaoAtual ?? "")} onClick={salvarExtensaoAtual}>
                Salvar
              </Button>
              <span className="text-xs text-muted-foreground">
                {extensaoAtual
                  ? `Quem estiver abaixo da ${extensaoAtual} vê o aviso de extensão desatualizada.${
                    pessoasFiltradas ? ` Aqui: ${pessoasFiltradas.filter((p) => desatualizada(p.extensao_versao, extensaoAtual)).length} desatualizada(s).` : ""}`
                  : "Vazio: ninguém recebe o aviso. Preencha quando a loja aprovar uma versão nova."}
              </span>
            </div>
            {pessoasFiltradas === null ? <Carregando /> : pessoasFiltradas.length === 0 ? <Vazio texto="Nenhuma pessoa encontrada." /> : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pessoa</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Último acesso</TableHead>
                      <TableHead>Extensão</TableHead>
                      <TableHead className="text-right">Logins</TableHead>
                      <TableHead className="text-right">Reuniões</TableHead>
                      <TableHead className="text-right">Análises</TableHead>
                      <TableHead className="text-right">Erros</TableHead>
                      <TableHead className="text-right">Treinos</TableHead>
                      <TableHead className="text-right">Assistente</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pessoasFiltradas.map((p) => (
                      <TableRow key={`${p.org_id}-${p.user_id}`} className="cursor-pointer" onClick={() => verNaLinha({ org: p.org_id, email: p.email })}>
                        <TableCell>
                          <div className="font-medium">{p.nome || p.email}</div>
                          <div className="text-xs text-muted-foreground">{p.nome ? `${p.email} · ` : ""}{PAPEL[p.papel ?? ""] ?? "Sem papel"}</div>
                        </TableCell>
                        <TableCell className="text-sm">{p.org_nome}</TableCell>
                        <TableCell className="text-sm" title={p.ultima_atividade ? new Date(p.ultima_atividade).toLocaleString("pt-BR") : ""}>
                          {haQuanto(p.ultima_atividade)}
                        </TableCell>
                        <TableCell
                          className="whitespace-nowrap text-sm"
                          title={p.extensao_vista_em ? `Vista ${haQuanto(p.extensao_vista_em)} (${new Date(p.extensao_vista_em).toLocaleString("pt-BR")})` : "Nunca vista: a pessoa ainda não abriu o Sales Coach com a extensão instalada"}
                        >
                          {p.extensao_versao ? (
                            <>
                              <span className="tabular-nums">{p.extensao_versao}</span>
                              {desatualizada(p.extensao_versao, extensaoAtual) && (
                                <Badge variant="outline" className="ml-1.5 border-amber-400 text-amber-900">desatualizada</Badge>
                              )}
                            </>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.logins}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.reunioes}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.analises}</TableCell>
                        <TableCell className={`text-right tabular-nums ${p.erros ? "font-medium text-destructive" : ""}`}>{p.erros}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.treinos}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.assistente}</TableCell>
                        <TableCell className="text-right tabular-nums">{dolar(p.custo)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Clique numa pessoa para ver a linha do tempo dela. "Último acesso" considera login, reunião, treino e assistente. "Extensão" é a versão vista quando a pessoa abriu o Sales Coach no Chrome (passe o mouse para ver quando).</p>
          </TabsContent>

          <TabsContent value="empresas" className="mt-0">
            {empresas === null ? <Carregando /> : empresas.length === 0 ? <Vazio texto="Nenhuma empresa com usuários." /> : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Saúde</TableHead>
                      <TableHead className="text-right">Ativos 7 dias</TableHead>
                      <TableHead className="text-right">Ativos 30 dias</TableHead>
                      <TableHead className="text-right">Reuniões</TableHead>
                      <TableHead className="text-right">Erros</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                      <TableHead>Última atividade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {empresas.map((e) => (
                      <TableRow key={e.org_id} className="cursor-pointer" onClick={() => verNaLinha({ org: e.org_id })}>
                        <TableCell className="font-medium">{e.org_nome}</TableCell>
                        <TableCell>
                          <Badge variant={SAUDE[e.saude].variant}>{SAUDE[e.saude].label}</Badge>
                          <div className="mt-1 text-xs text-muted-foreground">{e.motivo}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{e.ativos7}/{e.pessoas}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.ativos30}/{e.pessoas}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.reunioes}</TableCell>
                        <TableCell className={`text-right tabular-nums ${e.erros ? "text-destructive" : ""}`}>
                          {e.erros}{e.taxaErro !== null && e.erros ? ` (${Math.round(e.taxaErro * 100)}%)` : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{dolar(e.custo)}</TableCell>
                        <TableCell className="text-sm">{haQuanto(e.ultima)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Sem uso: ninguém ativo em 30 dias. Atenção: menos de um terço do time ativo na semana ou mais de 20% das reuniões com erro no período.
              Reuniões, erros e custo valem para o período escolhido.
            </p>
          </TabsContent>

          <TabsContent value="erros" className="mt-0">
            {erros === null ? <Carregando /> : erros.length === 0 ? <Vazio texto="Nenhuma análise com erro nos últimos 14 dias." /> : (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  {errosPorEmpresa.map(([nome, n]) => <Badge key={nome} variant="outline">{nome}: {n}</Badge>)}
                </div>
                <ul className="divide-y rounded-md border">
                  {erros.map((e, i) => (
                    <li key={`${e.ref}-${i}`} className="px-3 py-2.5 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium">{e.org_nome ?? "—"} · {e.nome || e.email || "—"}</span>
                        <time className="shrink-0 text-xs tabular-nums text-muted-foreground">{quando(e.em)}</time>
                      </div>
                      <p className="mt-0.5 break-words font-mono text-xs text-destructive">{e.detalhe || "Sem mensagem de erro."}</p>
                      {e.ref && <p className="mt-0.5 text-xs text-muted-foreground">Reunião {e.ref}</p>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Últimos 14 dias. A reunião fica em erro até alguém tentar de novo; para ver o conteúdo, entre na empresa pelo modo suporte.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

const Carregando = () => <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>;
const Vazio = ({ texto }: { texto: string }) => <p className="py-8 text-center text-sm text-muted-foreground">{texto}</p>;
