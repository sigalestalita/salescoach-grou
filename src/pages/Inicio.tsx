import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarCheck, CalendarX2, Check, Copy, Dumbbell, Flame,
  Lightbulb, Megaphone, RefreshCw, Sparkles, Trophy, Users, Video,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { temperatureLabels, useOrgConfig } from "@/hooks/useOrgConfig";
import { useOnboarding } from "@/components/hub/useOnboarding";
import { HINTS } from "@/components/hub/content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AgendaItem, calendarApi, CalendarConnection } from "@/lib/calendar";
import { addDays, sameDay, startOfDay, startOfWeek } from "@/lib/agendaLayout";
import { DailyTip, fetchDailyTip } from "@/lib/dailyTip";
import {
  alertasDoTime, criteriosDoTime, DAY, doDia, InicioAnalysis, InicioMeeting, needsRetry, porVendedor, ritmo,
  saudacao, semGravacao,
} from "@/lib/inicio";

/**
 * Início: a primeira tela de todo mundo. "Seu dia" (agenda de hoje,
 * pendências automáticas, ritmo e a dica do dia escrita pela IA) para todos
 * os papéis, porque admin e gestor também gravam as próprias reuniões; e
 * "Seu time" para admin e gestor, só com as reuniões gravadas do time (nunca
 * a agenda dos vendedores). Nada aqui pede para a pessoa marcar ou preencher.
 */

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const diaCurto = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" }).replace(".", "");
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const MEETING_COLS = "id, title, status, overall_score, temperature, created_at, updated_at, seller_id";

export default function Inicio() {
  const { user, role, profile } = useAuth();
  const { config } = useOrgConfig();
  const onboarding = useOnboarding();
  const navigate = useNavigate();
  const mgmt = role === "admin" || role === "gestor";
  const now = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeek(now), [now]);
  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0];

  const [meus, setMeus] = useState<InicioMeeting[] | null>(null);
  const [cal, setCal] = useState<{ conn: CalendarConnection | null; events: AgendaItem[]; erro: boolean } | null>(null);
  const [tip, setTip] = useState<DailyTip | null>(null);
  const [tipErro, setTipErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const desde = new Date(now.getTime() - 60 * DAY).toISOString();
    supabase.from("meetings").select(MEETING_COLS).eq("seller_id", user.id).gte("created_at", desde)
      .then(({ data }) => setMeus((data ?? []) as InicioMeeting[]));
    (async () => {
      try {
        const st = await calendarApi.status();
        if (!st.connection || st.connection.status !== "conectado") {
          setCal({ conn: st.connection, events: [], erro: false });
          return;
        }
        // A semana que passou (reuniões sem gravação) e o dia de hoje.
        const r = await calendarApi.events(addDays(startOfDay(now), -7), addDays(startOfDay(now), 1));
        setCal({ conn: st.connection, events: r.events, erro: false });
      } catch {
        setCal({ conn: null, events: [], erro: true });
      }
    })();
    fetchDailyTip().then(setTip).catch((e) => setTipErro((e as Error).message));
  }, [user, now]);

  const hoje = useMemo(
    () => (cal?.events ?? []).filter((e) => sameDay(new Date(e.start), now)).sort((a, b) => a.start.localeCompare(b.start)),
    [cal, now],
  );
  const comCliente = hoje.filter((e) => e.externo && !e.declined);
  const proxima = hoje.find((e) => !e.declined && new Date(e.end) > now);
  const passadas = useMemo(() => semGravacao(cal?.events ?? [], now, addDays(startOfDay(now), -7)), [cal, now]);
  const erros = (meus ?? []).filter((m) => needsRetry(m, now) && new Date(m.created_at).getTime() > now.getTime() - 30 * DAY);
  // Só os passos que o sistema detecta sozinho: os de marcar à mão ficariam pendentes para sempre aqui.
  const passosFaltando = onboarding.loaded ? onboarding.steps.filter((s) => s.auto && !s.done) : [];
  const meuRitmo = meus ? ritmo(meus, now, weekStart) : null;
  const hint = doDia(HINTS.filter((h) => !h.roles || (role && h.roles.includes(role))), now);

  const resumo = !cal
    ? null
    : !cal.conn
      ? "Conecte a sua agenda para ver o seu dia aqui."
      : hoje.length === 0
        ? "Nenhuma reunião na sua agenda hoje."
        : `Hoje você tem ${hoje.length} ${hoje.length === 1 ? "reunião" : "reuniões"}${comCliente.length ? `, ${comCliente.length} com cliente` : ""}.`;

  return (
    <div className="space-y-6">
      <div data-tour="inicio-titulo">
        <p className="text-sm text-muted-foreground">
          {maiuscula(now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }))}
        </p>
        <h1 className="text-2xl font-bold text-foreground">
          {saudacao(now)}{firstName ? `, ${firstName}` : ""}.
        </h1>
        {resumo ? <p className="mt-1 text-muted-foreground">{resumo}</p> : <Skeleton className="mt-2 h-4 w-64" />}
      </div>

      {mgmt && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Seu dia</h2>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <HojeCard cal={cal} hoje={hoje} proxima={proxima} now={now} />
          <PendenciasCard
            loading={!meus || !cal || !onboarding.loaded}
            erros={erros}
            passadas={passadas}
            passos={passosFaltando}
            onOpen={(id) => navigate(`/agendas/${id}`)}
          />
        </div>
        <div className="min-w-0 space-y-6">
          <DicaCard tip={tip} erro={tipErro} />
          <RitmoCard r={meuRitmo} />
          <NovidadesCard role={role} now={now} />
          {hint && (
            <Card>
              <CardContent className="space-y-2 p-5">
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Lightbulb className="h-4 w-4 text-warning" /> Você sabia?
                </p>
                <p className="text-sm">{hint.text}</p>
                {hint.route && (
                  <Link to={hint.route} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                    {hint.cta ?? "Ver"} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {mgmt && <SeuTime now={now} weekStart={weekStart} config={config} />}
    </div>
  );
}

function HojeCard({ cal, hoje, proxima, now }: {
  cal: { conn: CalendarConnection | null; events: AgendaItem[]; erro: boolean } | null;
  hoje: AgendaItem[];
  proxima: AgendaItem | undefined;
  now: Date;
}) {
  return (
    <Card data-tour="inicio-hoje">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="h-5 w-5 text-primary" /> Hoje
        </CardTitle>
        {cal?.conn && (
          <Link to="/agendas?visao=agenda" className="text-sm font-medium text-primary hover:underline">Ver a semana</Link>
        )}
      </CardHeader>
      <CardContent>
        {!cal ? (
          <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        ) : cal.erro ? (
          <p className="text-sm text-muted-foreground">Não foi possível ler a sua agenda agora. Confira a conexão em Agendas.</p>
        ) : !cal.conn || cal.conn.status !== "conectado" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">
              {cal.conn ? "A conexão com a sua agenda expirou." : "Conecte o Google Agenda ou o Outlook e as suas reuniões do dia aparecem aqui, com o botão para entrar e gravar."}
            </p>
            <Button asChild size="sm" variant="outline"><Link to="/agendas">{cal.conn ? "Reconectar" : "Conectar a agenda"}</Link></Button>
          </div>
        ) : hoje.length === 0 ? (
          <p className="text-sm text-muted-foreground">Agenda livre hoje. Bom dia para treinar uma objeção no Modo de treino.</p>
        ) : (
          <ul className="divide-y divide-border">
            {hoje.map((e) => {
              const passou = new Date(e.end) < now;
              const agora = new Date(e.start) <= now && !passou;
              const destaque = proxima?.id === e.id;
              return (
                <li key={e.id} className={cn("flex items-center gap-3 py-2.5", (passou || e.declined) && "opacity-60")}>
                  <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">{hora(e.start)}</span>
                  <span className={cn("h-8 w-1 shrink-0 rounded-full", e.meeting ? "bg-success" : e.externo ? "bg-primary" : "bg-muted-foreground/30")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm font-medium", e.declined && "line-through")}>{e.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {agora ? "Acontecendo agora · " : ""}
                      {e.lead ? (e.lead.name ?? e.lead.email) : e.externo ? "Com cliente" : "Interna"}
                    </span>
                  </span>
                  {e.meeting ? (
                    <Button asChild size="sm" variant="ghost"><Link to={`/agendas/${e.meeting.id}`}>
                      {e.meeting.overall_score != null ? `Score ${e.meeting.overall_score}` : "Ver"}
                    </Link></Button>
                  ) : e.joinUrl && !passou && !e.declined ? (
                    <Button asChild size="sm" variant={destaque ? "default" : "outline"} aria-label={e.externo ? "Entrar e gravar" : "Entrar"}>
                      <a href={e.joinUrl} target="_blank" rel="noopener noreferrer">
                        <Video className="h-4 w-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">{e.externo ? "Entrar e gravar" : "Entrar"}</span>
                      </a>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PendenciasCard({ loading, erros, passadas, passos, onOpen }: {
  loading: boolean;
  erros: InicioMeeting[];
  passadas: AgendaItem[];
  passos: { id: string; title: string; cta: string; route: string }[];
  onOpen: (id: string) => void;
}) {
  const total = erros.length + passadas.length + passos.length;
  return (
    <Card data-tour="inicio-pendencias">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-warning" /> Pendências
          {!loading && total > 0 && <span className="rounded-full bg-warning/15 px-2 text-xs text-warning">{total}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : total === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Check className="h-4 w-4 text-success" /> Tudo em dia.</p>
        ) : (
          <>
            {erros.length > 0 && (
              <Grupo titulo="Análises para tentar de novo">
                {erros.slice(0, 4).map((m) => (
                  <Linha key={m.id} onClick={() => onOpen(m.id)} icone={<RefreshCw className="h-4 w-4 text-destructive" />}
                    texto={m.title} detalhe={m.status === "erro" ? "Deu erro na análise" : "Parada no processamento"} acao="Abrir" />
                ))}
              </Grupo>
            )}
            {passadas.length > 0 && (
              <Grupo titulo="Reuniões com cliente que passaram sem gravação">
                {passadas.slice(0, 4).map((e) => (
                  <Linha key={e.id} icone={<CalendarX2 className="h-4 w-4 text-muted-foreground" />}
                    texto={e.title} detalhe={`${diaCurto(e.start)}, ${hora(e.start)}${e.lead ? ` · ${e.lead.name ?? e.lead.email}` : ""}`} />
                ))}
                <p className="text-xs text-muted-foreground">
                  Nas próximas, clique em Gravar no cartão do Sales Coach ao entrar na chamada.
                </p>
              </Grupo>
            )}
            {passos.length > 0 && (
              <Grupo titulo="Primeiros passos">
                {passos.slice(0, 4).map((s) => (
                  <Linha key={s.id} to={s.route} icone={<Sparkles className="h-4 w-4 text-primary" />} texto={s.title} acao={s.cta} />
                ))}
              </Grupo>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      {children}
    </div>
  );
}

function Linha({ icone, texto, detalhe, acao, to, onClick }: {
  icone: React.ReactNode; texto: string; detalhe?: string; acao?: string; to?: string; onClick?: () => void;
}) {
  const corpo = (
    <>
      <span className="shrink-0">{icone}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{texto}</span>
        {detalhe && <span className="block truncate text-xs text-muted-foreground">{detalhe}</span>}
      </span>
      {acao && <span className="hidden shrink-0 text-sm font-medium text-primary sm:inline">{acao}</span>}
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left";
  if (to) return <Link to={to} className={cn(cls, "hover:bg-muted/60")}>{corpo}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cn(cls, "hover:bg-muted/60")}>{corpo}</button>;
  return <div className={cls}>{corpo}</div>;
}

function DicaCard({ tip, erro }: { tip: DailyTip | null; erro: string | null }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async (t: string) => {
    try { await navigator.clipboard.writeText(t); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* segue visível */ }
  };
  return (
    <Card className="border-primary/30 bg-primary/5" data-tour="inicio-dica">
      <CardContent className="space-y-3 p-5">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
          <Sparkles className="h-4 w-4" /> {tip?.tipo === "gestao" ? "Dica de gestão do dia" : "Dica do dia"}
        </p>
        {erro ? (
          <p className="text-sm text-muted-foreground">A dica de hoje não carregou. Tente de novo mais tarde.</p>
        ) : !tip ? (
          <div className="space-y-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div>
        ) : (
          <>
            <h3 className="text-lg font-semibold leading-snug">{tip.titulo}</h3>
            <p className="text-sm">{tip.dica}</p>
            {tip.frase_pronta && (
              <div className="rounded-lg border border-border bg-background p-3 text-sm">
                <p className="italic">"{tip.frase_pronta}"</p>
                <button type="button" onClick={() => copiar(tip.frase_pronta!)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copiado ? "Copiado" : "Copiar"}
                </button>
              </div>
            )}
            {tip.porque && <p className="text-xs text-muted-foreground">{tip.porque}</p>}
            {tip.tipo === "vendedor" && (
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link to="/treino"><Dumbbell className="mr-2 h-4 w-4" />Treinar {tip.foco ? tip.foco.toLowerCase() : "isso"}</Link>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Tendencia({ v }: { v: number | null }) {
  if (v == null || v === 0) return null;
  const sobe = v > 0;
  return (
    <span className={cn("inline-flex items-center text-xs font-medium", sobe ? "text-success" : "text-destructive")}>
      {sobe ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {sobe ? "+" : ""}{v}
    </span>
  );
}

/** Novidades da plataforma publicadas nos últimos 30 dias para o papel da pessoa (as mesmas do e-mail semanal). */
function NovidadesCard({ role, now }: { role: string | null; now: Date }) {
  const [itens, setItens] = useState<{ id: string; title: string; body: string; cta_label: string | null; cta_path: string | null }[]>([]);
  useEffect(() => {
    if (!role) return;
    const desde = new Date(now.getTime() - 30 * DAY).toISOString();
    // Tabela nova (migração das novidades): sem ela, o quadro só não aparece.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("product_updates")
      .select("id, title, body, cta_label, cta_path")
      .eq("status", "publicado").contains("audience", [role]).gte("published_at", desde)
      .order("published_at", { ascending: false }).limit(3)
      .then(({ data }: { data: typeof itens | null }) => setItens(data ?? []));
  }, [role, now]);
  if (!itens.length) return null;
  return (
    <Card data-tour="inicio-novidades">
      <CardContent className="space-y-3 p-5">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Megaphone className="h-4 w-4 text-primary" /> Novidades
        </p>
        <ul className="space-y-3">
          {itens.map((n) => (
            <li key={n.id} className="space-y-1">
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="line-clamp-3 text-sm text-muted-foreground">{n.body}</p>
              {n.cta_path && (
                <Link to={n.cta_path} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  {n.cta_label ?? "Ver"} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RitmoCard({ r }: { r: ReturnType<typeof ritmo> | null }) {
  return (
    <Card data-tour="inicio-ritmo">
      <CardContent className="space-y-3 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Seu ritmo</p>
        {!r ? <Skeleton className="h-12 w-full" /> : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="flex items-baseline gap-2 text-2xl font-bold tabular-nums">
                {r.media30 ?? "—"} <Tendencia v={r.tendencia} />
              </p>
              <p className="text-xs text-muted-foreground">score médio em 30 dias{r.analisadas30 ? ` (${r.analisadas30})` : ""}</p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{r.gravadasSemana}</p>
              <p className="text-xs text-muted-foreground">{r.gravadasSemana === 1 ? "reunião gravada" : "reuniões gravadas"} nesta semana</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Seu time (admin e gestor) ──

function SeuTime({ now, weekStart, config }: {
  now: Date;
  weekStart: Date;
  config: ReturnType<typeof useOrgConfig>["config"];
}) {
  const { user, role, profile } = useAuth();
  const navigate = useNavigate();
  const [dados, setDados] = useState<{
    meetings: InicioMeeting[];
    pessoas: { id: string; nome: string }[];
    vendedores: Set<string>;
    analyses: InicioAnalysis[];
  } | null>(null);

  useEffect(() => {
    const desde = new Date(now.getTime() - 60 * DAY).toISOString();
    (async () => {
      const [ms, profs, roles] = await Promise.all([
        supabase.from("meetings").select(MEETING_COLS).gte("created_at", desde),
        supabase.from("profiles").select("user_id, full_name, team_id"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const meetings = (ms.data ?? []) as InicioMeeting[];
      // Gestor com equipe acompanha a própria equipe; admin, a empresa toda.
      const daEquipe = (p: { team_id: string | null }) => role !== "gestor" || !profile?.team_id || p.team_id === profile.team_id;
      const pessoas = (profs.data ?? []).filter(daEquipe).map((p) => ({ id: p.user_id, nome: p.user_id === user?.id ? "Você" : p.full_name || "Sem nome" }));
      const ids = new Set(pessoas.map((p) => p.id));
      const vendedores = new Set((roles.data ?? []).filter((r) => r.role === "vendedor" && ids.has(r.user_id)).map((r) => r.user_id));
      const recentes = meetings.filter((m) => m.status === "completo" && new Date(m.created_at).getTime() > now.getTime() - 30 * DAY).map((m) => m.id);
      const an = recentes.length
        ? await supabase.from("analysis_results").select("meeting_id, bant_score, methodology, created_at").in("meeting_id", recentes.slice(0, 300))
        : { data: [] };
      setDados({ meetings: meetings.filter((m) => ids.has(m.seller_id)), pessoas, vendedores, analyses: (an.data ?? []) as InicioAnalysis[] });
    })();
  }, [now, role, profile?.team_id, user?.id]);

  const tempLabels = { ...config.allLevelLabels, ...temperatureLabels(config.temperatureLevels) };
  const quentesKeys = new Set(config.temperatureLevels.slice(Math.ceil(config.temperatureLevels.length / 2)).map((l) => l.key));

  const vs = useMemo(() => (dados ? porVendedor(dados.meetings, dados.pessoas, now, weekStart) : []), [dados, now, weekStart]);
  const ativos = vs.filter((v) => v.ultima);
  const alertas = dados ? alertasDoTime(vs, dados.vendedores, now) : [];
  const semana = (dados?.meetings ?? []).filter((m) => new Date(m.created_at) >= addDays(startOfDay(now), -7));
  const melhor = semana.filter((m) => m.status === "completo" && m.overall_score != null).sort((a, b) => Number(b.overall_score) - Number(a.overall_score))[0];
  const quentes = semana.filter((m) => m.temperature && quentesKeys.has(m.temperature));
  const errosTime = semana.filter((m) => needsRetry(m, now) && m.seller_id !== user?.id);
  const criterios = dados ? criteriosDoTime(dados.analyses, config.criteria, config.maxCriterionScore) : [];
  const fraco = criterios.find((c) => c.n >= 2) ?? criterios[0];
  const nome = (id: string) => dados?.pessoas.find((p) => p.id === id)?.nome ?? "—";

  return (
    <section className="space-y-4" data-tour="inicio-time">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Users className="h-4 w-4" /> Seu time
        </h2>
        <Link to="/visao-geral" className="text-sm font-medium text-primary hover:underline">Abrir a Visão geral</Link>
      </div>
      {!dados ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5 text-warning" /> Atenção</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {alertas.length === 0 && errosTime.length === 0 ? (
                <p className="flex items-center gap-2 text-muted-foreground"><Check className="h-4 w-4 text-success" /> Nada pedindo atenção.</p>
              ) : (
                <>
                  {alertas.map((a) => (
                    <p key={`${a.tipo}-${a.vendedor.id}`} className="flex items-start gap-2">
                      {a.tipo === "queda" ? <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <CalendarX2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                      <span>
                        <b>{a.vendedor.nome}</b>{" "}
                        {a.tipo === "queda"
                          ? `caiu ${Math.abs(a.vendedor.tendencia!)} pontos no score (30 dias: ${a.vendedor.media30}).`
                          : a.dias == null ? "ainda não gravou nenhuma reunião." : `não grava há ${a.dias} dias.`}
                      </span>
                    </p>
                  ))}
                  {errosTime.length > 0 && (
                    <p className="flex items-start gap-2">
                      <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <span>{errosTime.length} {errosTime.length === 1 ? "análise do time deu erro" : "análises do time deram erro"} nesta semana. <Link to="/agendas" className="text-primary hover:underline">Ver em Agendas</Link></span>
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-5 w-5 text-warning" /> Destaques da semana</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {melhor ? (
                <button type="button" onClick={() => navigate(`/agendas/${melhor.id}`)} className="block w-full rounded-lg bg-success/10 p-3 text-left hover:bg-success/15">
                  <span className="block text-xs text-muted-foreground">Melhor reunião · vale ouvir com o time</span>
                  <span className="block truncate font-medium">{melhor.title}</span>
                  <span className="text-xs text-muted-foreground">{nome(melhor.seller_id)} · score {melhor.overall_score}</span>
                </button>
              ) : <p className="text-muted-foreground">Sem reuniões analisadas nos últimos 7 dias.</p>}
              {quentes.length > 0 && (
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Flame className="h-3.5 w-3.5 text-destructive" /> {quentes.length} {quentes.length === 1 ? "lead quente" : "leads quentes"}</p>
                  {quentes.slice(0, 3).map((m) => (
                    <Link key={m.id} to={`/agendas/${m.id}`} className="block rounded-md py-0.5 hover:bg-muted/60">
                      <span className="block truncate">{m.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{nome(m.seller_id)} · {tempLabels[m.temperature!] ?? m.temperature}</span>
                    </Link>
                  ))}
                </div>
              )}
              {fraco && (
                <div className="rounded-lg bg-muted/60 p-3">
                  <span className="block text-xs text-muted-foreground">Pauta para o próximo treino do time</span>
                  <span className="font-medium">{fraco.label}</span>
                  <span className="text-muted-foreground"> ficou em {fraco.pct}% nas reuniões dos últimos 30 dias.</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-primary" /> Por pessoa</CardTitle></CardHeader>
            <CardContent>
              {ativos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ninguém do time gravou reuniões nos últimos 60 dias.</p>
              ) : (
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Pessoa</th>
                      <th className="w-16 pb-2 text-right font-medium">Semana</th>
                      <th className="w-24 pb-2 text-right font-medium">Score 30d</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ativos.slice(0, 8).map((v) => (
                      <tr key={v.id} className="border-t border-border">
                        <td className="truncate py-1.5 pr-2">{v.nome}</td>
                        <td className="py-1.5 text-right tabular-nums">{v.semana}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {v.media30 ?? "—"} <Tendencia v={v.tendencia} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
