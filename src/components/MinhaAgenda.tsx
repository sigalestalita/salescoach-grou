import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Bot, ChevronLeft, ChevronRight, ExternalLink, Info, RefreshCw, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AgendaItem, CALENDAR_NAME, calendarApi, CalendarProvider } from "@/lib/calendar";
import {
  BOT_ATIVOS, BOT_LABEL, entraSozinho, MeetingBot, meetingBotApi, MODO_LABEL, ModoRobo, robotAceita,
} from "@/lib/meetingBot";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  addDays, agendaKind, AgendaKind, hourRange, layoutDay, Placed, sameDay, startOfDay, startOfWeek,
} from "@/lib/agendaLayout";

/**
 * Minha agenda: a agenda principal do vendedor (Google Agenda ou Outlook),
 * só leitura, com a gravação de cada reunião. Os eventos são lidos na hora
 * pela função calendar e cada pessoa vê só a própria agenda.
 */

const HOUR_PX = 48;

const KIND_STYLE: Record<AgendaKind, string> = {
  gravada: "border-success/60 border-l-success bg-success/15 text-foreground",
  cliente: "border-primary/50 border-l-primary bg-primary/15 text-foreground",
  "nao-gravada": "border-dashed border-muted-foreground/40 border-l-muted-foreground/60 bg-background text-muted-foreground",
  interna: "border-border border-l-muted-foreground/30 bg-muted text-muted-foreground",
};
const KIND_DOT: Record<AgendaKind, string> = {
  gravada: "bg-success",
  cliente: "bg-primary",
  "nao-gravada": "border border-dashed border-muted-foreground bg-background",
  interna: "bg-muted-foreground/40",
};
const KIND_LABEL: Record<AgendaKind, string> = {
  cliente: "Com cliente",
  gravada: "Gravada",
  "nao-gravada": "Com cliente, não gravada",
  interna: "Interna",
};

/** Explicação curta atrás de um "i". Abre no clique, para funcionar também no celular. */
function Dica({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex shrink-0 rounded-full text-muted-foreground hover:text-foreground" aria-label={`Ajuda: ${titulo}`}>
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-80 space-y-2 text-xs leading-relaxed">
        <p className="text-sm font-medium">{titulo}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}

const MODO_DICA: Record<ModoRobo, string> = {
  desligado: "Você manda o robô reunião por reunião.",
  clientes: "Reuniões com alguém de fora da empresa.",
  todas: "Inclui as internas, como dailies e 1:1.",
};

const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const diaLongo = (d: Date) => maiuscula(d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }));

function rotuloSemana(ini: Date): string {
  const fim = addDays(ini, 6);
  const mes = (d: Date) => d.toLocaleDateString("pt-BR", { month: "long" });
  if (ini.getMonth() === fim.getMonth()) return `${ini.getDate()} a ${fim.getDate()} de ${mes(ini)} de ${fim.getFullYear()}`;
  const curto = (d: Date) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
  return `${curto(ini)} a ${curto(fim)} de ${fim.getFullYear()}`;
}

interface Props {
  provider: CalendarProvider;
  statusLabels: Record<string, string>;
  tempLabels: Record<string, string>;
}

export function MinhaAgenda({ provider, statusLabels, tempLabels }: Props) {
  const navigate = useNavigate();
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [mode, setMode] = useState<"semana" | "dia">("semana");
  const [cache, setCache] = useState<Record<string, AgendaItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AgendaItem | null>(null);
  const [now, setNow] = useState(() => new Date());
  // Robô de reunião (protótipo): só aparece quando a chave da Recall está configurada.
  const [robos, setRobos] = useState<{ ativo: boolean; modo: ModoRobo; lista: MeetingBot[] }>({ ativo: false, modo: "desligado", lista: [] });
  const [salvandoModo, setSalvandoModo] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const key = week.toISOString();
  const load = useCallback(async (inicio: Date) => {
    setLoading(true);
    setError(null);
    try {
      const [r, b] = await Promise.all([
        calendarApi.events(inicio, addDays(inicio, 7)),
        meetingBotApi.listar(inicio, addDays(inicio, 7)).catch(() => null),
      ]);
      setCache((c) => ({ ...c, [inicio.toISOString()]: r.events }));
      if (b) setRobos((atual) => ({ ativo: b.ativo, modo: b.modo ?? "desligado", lista: [...b.robos, ...atual.lista.filter((x) => !b.robos.some((y) => y.id === x.id))] }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  const cached = key in cache;
  useEffect(() => { if (!cached) load(week); }, [cached, load, week]);

  const events = useMemo(() => cache[key] ?? [], [cache, key]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const gridDays = useMemo(() => (mode === "semana" ? weekDays : [day]), [mode, weekDays, day]);
  const placed = useMemo(() => gridDays.map((d) => layoutDay(events, d)), [events, gridDays]);
  const [h0, h1] = hourRange(placed.flat());

  // Robô de cada reunião: o último pedido para o evento (a lista vem do mais novo).
  const roboDe = useCallback((ev: AgendaItem) => robos.lista.find((r) => r.calendar_event_id === ev.id) ?? null, [robos.lista]);
  const comRobo = useCallback((ev: AgendaItem) => {
    if (!robos.ativo) return false;
    const r = roboDe(ev);
    return r ? BOT_ATIVOS.includes(r.status) : entraSozinho(ev, robos.modo, now);
  }, [robos.ativo, robos.modo, roboDe, now]);
  const recarregarRobos = async () => {
    const b = await meetingBotApi.listar(week, addDays(week, 7)).catch(() => null);
    if (b) setRobos({ ativo: b.ativo, modo: b.modo ?? "desligado", lista: b.robos });
  };
  const trocarModo = async (modo: ModoRobo) => {
    setSalvandoModo(true);
    try {
      await meetingBotApi.modo(modo);
      setRobos((r) => ({ ...r, modo }));
      toast({
        title: modo === "desligado" ? "Robô automático desligado" : "Robô automático ligado",
        description: modo === "desligado"
          ? "O robô só entra nas reuniões para onde você mandar."
          : `Ele entra sozinho em: ${MODO_LABEL[modo].toLowerCase()}. Para pular uma reunião, abra a reunião e clique em Não gravar esta reunião.`,
      });
    } catch (e) {
      toast({ title: "Não foi possível mudar o robô automático", description: (e as Error).message, variant: "destructive" });
    }
    await recarregarRobos();
    setSalvandoModo(false);
  };

  // Reuniões com cliente que já passaram: quantas foram gravadas.
  const passadas = events.filter((e) => e.externo && !e.declined && new Date(e.end) < now);
  const gravadas = passadas.filter((e) => e.meeting).length;

  const go = (n: number) => {
    if (mode === "dia") {
      const nd = addDays(day, n);
      setDay(nd);
      setWeek(startOfWeek(nd));
    } else {
      setWeek(addDays(week, 7 * n));
      setDay(addDays(day, 7 * n));
    }
  };
  const hoje = () => {
    setWeek(startOfWeek(new Date()));
    setDay(startOfDay(new Date()));
  };

  return (
    <Card data-tour="minha-agenda">
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={hoje}>Hoje</Button>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => go(-1)} aria-label="Anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => go(1)} aria-label="Próximo">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="text-base font-semibold md:text-lg">
            {mode === "dia" ? <span className="hidden md:inline">{diaLongo(day)}</span> : null}
            <span className={cn(mode === "dia" && "md:hidden")}>{rotuloSemana(week)}</span>
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost" size="icon" className="h-8 w-8" onClick={() => load(week)} disabled={loading}
              aria-label="Atualizar"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <div className="hidden rounded-lg border border-border p-0.5 md:flex">
              {(["semana", "dia"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm capitalize",
                    mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {(["cliente", "gravada", "nao-gravada", "interna"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", KIND_DOT[k])} />
              {KIND_LABEL[k]}
            </span>
          ))}
          {robos.ativo && (
            <span className="flex items-center gap-1.5">
              <Bot className="h-3 w-3 text-primary" />
              Com robô
            </span>
          )}
          {passadas.length > 0 && (
            <span className="ml-auto font-medium text-foreground">
              {gravadas} de {passadas.length} {passadas.length === 1 ? "reunião com cliente gravada" : "reuniões com cliente gravadas"} nesta semana
            </span>
          )}
        </div>

        {robos.ativo && (
          <div data-tour="robo-automatico" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
            <Bot className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-medium">Robô automático</span>
            <Dica titulo="Robô automático">
              <p>
                O robô de reunião entra na chamada do Meet, Teams ou Zoom como um participante e grava áudio e vídeo.
                Quem grava são os servidores do Sales Coach: o seu computador não grava nada.
              </p>
              <p>Escolha em quais reuniões da sua agenda ele entra sozinho:</p>
              <ul className="list-disc space-y-1 pl-4">
                <li><strong>Só quando eu mandar:</strong> você abre a reunião e clica em Enviar o robô.</li>
                <li><strong>Reuniões com cliente:</strong> toda reunião com alguém de fora da empresa.</li>
                <li><strong>Todas as reuniões com link:</strong> inclui as internas.</li>
              </ul>
              <p>Para pular uma reunião, abra a reunião e clique em Não gravar esta reunião. A escolha vale só para a sua agenda.</p>
            </Dica>
            <Select value={robos.modo} onValueChange={(v) => trocarModo(v as ModoRobo)} disabled={salvandoModo}>
              <SelectTrigger className="h-8 w-[220px]" aria-label="Em quais reuniões o robô entra sozinho">
                <SelectValue>{MODO_LABEL[robos.modo]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(["desligado", "clientes", "todas"] as const).map((m) => (
                  <SelectItem key={m} value={m} className="py-2">
                    <span className="block">{MODO_LABEL[m]}</span>
                    <span className="block text-xs text-muted-foreground">{MODO_DICA[m]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {robos.modo === "desligado"
                ? "O robô entra só nas reuniões para onde você mandar."
                : "Ele entra sozinho nas reuniões marcadas com o robô. Para pular uma, abra a reunião."}
            </span>
          </div>
        )}

        {error && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            <span className="flex-1">
              {error} Se o quadro Sua agenda pedir Reconectar, clique lá e autorize de novo.
            </span>
            <Button variant="outline" size="sm" onClick={() => load(week)}>Tentar de novo</Button>
          </div>
        )}

        {/* Computador: grade da semana (ou do dia), como no Google Agenda */}
        <div className="hidden md:block">
          <div className="grid border-b border-border pb-2" style={{ gridTemplateColumns: `56px repeat(${gridDays.length}, minmax(0, 1fr))` }}>
            <div />
            {gridDays.map((d) => {
              const isToday = sameDay(d, now);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => { setDay(d); setMode("dia"); }}
                  className="flex flex-col items-center gap-0.5 rounded-md py-1 hover:bg-muted/60"
                  title="Ver o dia"
                >
                  <span className={cn("text-[11px] uppercase tracking-wide", isToday ? "text-primary" : "text-muted-foreground")}>
                    {d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                  </span>
                  <span
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-full text-lg",
                      isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                    )}
                  >
                    {d.getDate()}
                  </span>
                </button>
              );
            })}
          </div>
          <div className={cn("max-h-[68vh] overflow-y-auto transition-opacity", loading && !cached && "opacity-50")}>
            <div
              className="relative grid"
              style={{ gridTemplateColumns: `56px repeat(${gridDays.length}, minmax(0, 1fr))`, height: (h1 - h0) * HOUR_PX }}
            >
              {Array.from({ length: h1 - h0 }, (_, i) => (
                <div key={i} className="pointer-events-none absolute right-0 border-t border-border/60" style={{ top: i * HOUR_PX, left: 56 }}>
                  <span className="absolute -top-2 -translate-x-full pr-2 text-[11px] text-muted-foreground" style={{ left: 0 }}>
                    {i > 0 ? `${String(h0 + i).padStart(2, "0")}:00` : ""}
                  </span>
                </div>
              ))}
              <div />
              {gridDays.map((d, i) => (
                <DayColumn
                  key={d.toISOString()}
                  day={d}
                  placed={placed[i]}
                  h0={h0}
                  now={now}
                  comRobo={comRobo}
                  onOpen={setOpen}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Celular: os dias da semana e a lista do dia escolhido */}
        <div className="space-y-3 md:hidden">
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((d) => {
              const sel = sameDay(d, day);
              const tem = layoutDay(events, d).length > 0;
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => setDay(d)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-lg py-1.5",
                    sel ? "bg-primary text-primary-foreground" : sameDay(d, now) ? "text-primary" : "text-foreground",
                  )}
                >
                  <span className="text-[10px] uppercase">{d.toLocaleDateString("pt-BR", { weekday: "short" }).slice(0, 3)}</span>
                  <span className="text-base font-medium">{d.getDate()}</span>
                  <span className={cn("h-1 w-1 rounded-full", tem ? (sel ? "bg-primary-foreground" : "bg-primary") : "bg-transparent")} />
                </button>
              );
            })}
          </div>
          <p className="text-sm font-medium">{diaLongo(day)}</p>
          <DayList events={events} day={day} now={now} loading={loading && !cached} comRobo={comRobo} onOpen={setOpen} />
        </div>

        <EventDialog
          ev={open}
          now={now}
          provider={provider}
          statusLabels={statusLabels}
          tempLabels={tempLabels}
          onClose={() => setOpen(null)}
          onAnalysis={(id) => navigate(`/agendas/${id}`)}
          roboAtivo={robos.ativo}
          modo={robos.modo}
          robo={open ? roboDe(open) : null}
          onEnviarRobo={async (ev) => {
            try {
              await meetingBotApi.enviar({ id: ev.id, joinUrl: ev.joinUrl!, title: ev.title, start: ev.start, lead: ev.lead, attendees: ev.attendees });
              toast({ title: "Robô agendado", description: "Ele entra na chamada na hora da reunião. Aceite a entrada dele se ficar na sala de espera." });
            } catch (e) {
              toast({ title: "Não foi possível agendar o robô", description: (e as Error).message, variant: "destructive" });
            }
            await recarregarRobos();
          }}
          onCancelarRobo={async (id) => {
            try { await meetingBotApi.cancelar(id); } catch (e) {
              toast({ title: "Não foi possível cancelar o robô", description: (e as Error).message, variant: "destructive" });
            }
            await recarregarRobos();
          }}
          onPularRobo={async (ev) => {
            try { await meetingBotApi.pular({ id: ev.id, joinUrl: ev.joinUrl!, title: ev.title, start: ev.start }); } catch (e) {
              toast({ title: "Não foi possível tirar o robô", description: (e as Error).message, variant: "destructive" });
            }
            await recarregarRobos();
          }}
        />
      </CardContent>
    </Card>
  );
}

function DayColumn({ day, placed, h0, now, comRobo, onOpen }: {
  day: Date; placed: Placed[]; h0: number; now: Date; comRobo: (ev: AgendaItem) => boolean; onOpen: (ev: AgendaItem) => void;
}) {
  const isToday = sameDay(day, now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return (
    <div className="relative border-l border-border/60">
      {isToday && nowMin >= h0 * 60 && (
        <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: (nowMin - h0 * 60) * (HOUR_PX / 60) }}>
          <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-destructive" />
          <span className="h-0.5 flex-1 bg-destructive" />
        </div>
      )}
      {placed.map((p) => {
        const kind = agendaKind(p.ev, now);
        const altura = (p.end - p.start) * (HOUR_PX / 60) - 2;
        const curto = altura < 34;
        return (
          <button
            key={p.ev.id}
            type="button"
            onClick={() => onOpen(p.ev)}
            className={cn(
              "absolute z-10 overflow-hidden rounded-md border border-l-4 px-1.5 py-0.5 text-left text-xs leading-tight shadow-sm transition hover:z-30 hover:shadow-md",
              KIND_STYLE[kind],
              p.ev.declined && "opacity-50 line-through",
            )}
            style={{
              top: (p.start - h0 * 60) * (HOUR_PX / 60) + 1,
              height: altura,
              left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
              width: `calc(${100 / p.cols}% - 4px)`,
            }}
            title={p.ev.title}
          >
            {curto ? (
              <span className="block truncate">
                {comRobo(p.ev) && <Bot className="mr-0.5 inline h-3 w-3 align-[-2px] text-primary" aria-label="Com robô" />}
                <span className="font-medium">{hora(new Date(p.ev.start))}</span> {p.ev.title}
              </span>
            ) : (
              <>
                <span className="flex items-start justify-between gap-1">
                  <span className="line-clamp-2 font-medium">{p.ev.title}</span>
                  {p.ev.meeting?.overall_score != null && (
                    <span className="shrink-0 rounded bg-success/20 px-1 text-[10px] font-semibold tabular-nums text-success">
                      {p.ev.meeting.overall_score}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1 truncate opacity-80">
                  {comRobo(p.ev) && <Bot className="h-3 w-3 shrink-0 text-primary" aria-label="Com robô" />}
                  {hora(new Date(p.ev.start))} – {hora(new Date(p.ev.end))}
                </span>
                {p.ev.lead && altura > 60 && (
                  <span className="block truncate opacity-80">{p.ev.lead.name ?? p.ev.lead.email}</span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DayList({ events, day, now, loading, comRobo, onOpen }: {
  events: AgendaItem[]; day: Date; now: Date; loading: boolean; comRobo: (ev: AgendaItem) => boolean; onOpen: (ev: AgendaItem) => void;
}) {
  const doDia = layoutDay(events, day).sort((a, b) => a.start - b.start);
  if (loading) return <p className="py-6 text-center text-sm text-muted-foreground">Carregando a agenda…</p>;
  if (!doDia.length) return <p className="py-6 text-center text-sm text-muted-foreground">Nada na agenda neste dia.</p>;
  return (
    <ul className="space-y-2">
      {doDia.map(({ ev }) => {
        const kind = agendaKind(ev, now);
        return (
          <li key={ev.id}>
            <button
              type="button"
              onClick={() => onOpen(ev)}
              className={cn(
                "flex w-full items-stretch gap-3 rounded-lg border border-l-4 p-3 text-left",
                KIND_STYLE[kind],
                ev.declined && "opacity-50",
              )}
            >
              <span className="w-12 shrink-0 text-xs tabular-nums">
                <span className="block font-semibold text-foreground">{hora(new Date(ev.start))}</span>
                <span className="block text-muted-foreground">{hora(new Date(ev.end))}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm font-medium text-foreground", ev.declined && "line-through")}>{ev.title}</span>
                <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  {comRobo(ev) && <Bot className="h-3 w-3 shrink-0 text-primary" aria-label="Com robô" />}
                  {ev.lead ? (ev.lead.name ?? ev.lead.email) : KIND_LABEL[kind]}
                </span>
              </span>
              {ev.meeting?.overall_score != null && (
                <span className="self-center rounded-md bg-success/15 px-2 py-1 text-sm font-semibold tabular-nums text-success">
                  {ev.meeting.overall_score}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function EventDialog({ ev, now, provider, statusLabels, tempLabels, onClose, onAnalysis, roboAtivo, modo, robo, onEnviarRobo, onCancelarRobo, onPularRobo }: {
  ev: AgendaItem | null;
  now: Date;
  provider: CalendarProvider;
  statusLabels: Record<string, string>;
  tempLabels: Record<string, string>;
  onClose: () => void;
  onAnalysis: (id: string) => void;
  roboAtivo: boolean;
  modo: ModoRobo;
  robo: MeetingBot | null;
  onEnviarRobo: (ev: AgendaItem) => Promise<void>;
  onCancelarRobo: (id: string) => Promise<void>;
  onPularRobo: (ev: AgendaItem) => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);
  if (!ev) return null;
  const ini = new Date(ev.start);
  const fim = new Date(ev.end);
  const kind = agendaKind(ev, now);
  const aindaVai = fim > now;
  const m = ev.meeting;
  const roboVem = roboAtivo && (robo ? BOT_ATIVOS.includes(robo.status) : entraSozinho(ev, modo, now));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">{ev.title}</DialogTitle>
          <DialogDescription>
            {diaLongo(ini)} · {hora(ini)} – {hora(fim)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {m ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-3">
              <Badge className="rounded-full bg-success/15 text-success hover:bg-success/15">Gravada</Badge>
              <span className="text-muted-foreground">{statusLabels[m.status] ?? m.status}</span>
              {m.overall_score != null && <span className="font-semibold tabular-nums">Score {m.overall_score}</span>}
              {m.temperature && <span className="text-muted-foreground">· {tempLabels[m.temperature] ?? m.temperature}</span>}
              <Button size="sm" className="ml-auto" onClick={() => onAnalysis(m.id)}>Ver análise</Button>
            </div>
          ) : (
            <p className="rounded-lg bg-muted/60 p-3 text-muted-foreground">
              {ev.declined
                ? "Você recusou este convite."
                : kind === "interna"
                  ? "Reunião interna: ninguém de fora da empresa foi convidado."
                  : kind === "nao-gravada"
                    ? "Esta reunião com cliente passou sem gravação."
                    : roboVem
                      ? "Reunião com cliente. O robô grava esta reunião."
                      : "Reunião com cliente. Ao entrar na chamada, clique em Gravar no cartão do Sales Coach."}
            </p>
          )}

          {roboAtivo && !m && ev.joinUrl && aindaVai && !ev.declined && robotAceita(ev.joinUrl) && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Gravação desta reunião
                <Dica titulo="Robô ou extensão?">
                  <p><strong>Robô:</strong> entra na chamada como participante e grava áudio e vídeo sem pesar no seu computador. O cliente vê o robô entre os participantes.</p>
                  <p><strong>Extensão do Chrome:</strong> grava pelo seu navegador, sem participante a mais, e mostra as dicas ao vivo.</p>
                  <p>Use um dos dois. Com o robô na reunião, não clique em Gravar na extensão, senão a reunião é gravada duas vezes.</p>
                  <p>Se a reunião tiver sala de espera, aceite a entrada do robô: ele espera até 15 minutos.</p>
                </Dica>
              </div>
              {robo && (BOT_ATIVOS.includes(robo.status) || robo.status === "erro") ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <span className="min-w-0 flex-1">
                    {BOT_LABEL[robo.status] ?? robo.status}
                    {robo.status_detail && <span className="block text-xs text-muted-foreground">{robo.status_detail}</span>}
                  </span>
                  {BOT_ATIVOS.includes(robo.status) && robo.status !== "processando" && (
                    <Button size="sm" variant="outline" disabled={ocupado}
                      onClick={async () => { setOcupado(true); await onCancelarRobo(robo.id); setOcupado(false); }}>
                      Cancelar robô
                    </Button>
                  )}
                </div>
              ) : null}
              {robo?.status === "cancelado" && robo.status_detail && (
                <p className="text-xs text-muted-foreground">{robo.status_detail}</p>
              )}
              {!robo && entraSozinho(ev, modo, now) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <span className="min-w-0 flex-1">
                    O robô automático entra nesta reunião
                    <span className="block text-xs text-muted-foreground">Ele é agendado nas 24 horas antes. Seu computador não grava nada.</span>
                  </span>
                  <Button size="sm" variant="outline" disabled={ocupado}
                    onClick={async () => { setOcupado(true); await onPularRobo(ev); setOcupado(false); }}>
                    Não gravar esta reunião
                  </Button>
                </div>
              ) : !robo || !BOT_ATIVOS.includes(robo.status) ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" disabled={ocupado}
                    onClick={async () => { setOcupado(true); await onEnviarRobo(ev); setOcupado(false); }}>
                    <Bot className="mr-2 h-4 w-4" />
                    {robo?.status === "erro" ? "Enviar o robô de novo" : "Enviar o robô"}
                  </Button>
                  <span className="text-xs text-muted-foreground">Ele entra na chamada e grava. Seu computador não grava nada.</span>
                </div>
              ) : null}
            </div>
          )}

          {(ev.joinUrl && aindaVai) || ev.webLink ? (
            <div className="flex flex-wrap gap-2">
              {ev.joinUrl && aindaVai && (
                <Button asChild size="sm">
                  <a href={ev.joinUrl} target="_blank" rel="noopener noreferrer">
                    <Video className="mr-2 h-4 w-4" />
                    Entrar na reunião
                  </a>
                </Button>
              )}
              {ev.webLink && (
                <Button asChild size="sm" variant="outline">
                  <a href={ev.webLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir no {CALENDAR_NAME[provider]}
                  </a>
                </Button>
              )}
            </div>
          ) : null}

          {ev.attendees.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Participantes ({ev.attendees.length})
              </h3>
              <ul className="space-y-1.5">
                {ev.attendees.map((a) => (
                  <li key={a.email} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{a.name ?? a.email}</span>
                      {a.name && <span className="block truncate text-xs text-muted-foreground">{a.email}</span>}
                    </span>
                    {ev.lead?.email === a.email ? (
                      <Badge className="rounded-full">Lead</Badge>
                    ) : a.externo ? (
                      <Badge variant="outline" className="rounded-full">Cliente</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
