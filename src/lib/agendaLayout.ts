import type { AgendaItem } from "@/lib/calendar";

/** Contas de data e posição da tela Minha agenda (semana de domingo a sábado, no fuso do navegador). */

export const DAY_MS = 86_400_000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Domingo da semana de `d`, à meia-noite. */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Como o evento aparece: gravado, com cliente (a gravar), com cliente que passou sem gravação, ou interno. */
export type AgendaKind = "gravada" | "cliente" | "nao-gravada" | "interna";

export function agendaKind(ev: AgendaItem, now: Date): AgendaKind {
  if (ev.meeting) return "gravada";
  if (!ev.externo) return "interna";
  return new Date(ev.end).getTime() < now.getTime() ? "nao-gravada" : "cliente";
}

export interface Placed {
  ev: AgendaItem;
  /** Minutos desde a meia-noite do dia, cortados ao dia. */
  start: number;
  end: number;
  col: number;
  cols: number;
}

/**
 * Eventos de um dia com a coluna de cada um: os que se sobrepõem dividem a
 * largura, como no Google Agenda.
 */
export function layoutDay(events: AgendaItem[], day: Date): Placed[] {
  const d0 = startOfDay(day).getTime();
  const d1 = d0 + DAY_MS;
  const items = events
    .map((ev) => ({ ev, s: new Date(ev.start).getTime(), e: new Date(ev.end).getTime() }))
    .filter((x) => x.s < d1 && Math.max(x.e, x.s + 1) > d0)
    .map((x) => {
      const start = Math.max(0, Math.round((x.s - d0) / 60_000));
      // Mínimo de 20 minutos na tela, para caber o título.
      const end = Math.min(1440, Math.max(start + 20, Math.round((x.e - d0) / 60_000)));
      return { ev: x.ev, start, end, col: 0, cols: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const out: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = -1;
  const close = () => {
    const n = Math.max(...group.map((p) => p.col)) + 1;
    group.forEach((p) => (p.cols = n));
    out.push(...group);
    group = [];
  };
  for (const it of items) {
    if (group.length && it.start >= groupEnd) close();
    const taken = new Set(group.filter((p) => p.end > it.start).map((p) => p.col));
    let col = 0;
    while (taken.has(col)) col++;
    it.col = col;
    group.push(it);
    groupEnd = Math.max(groupEnd, it.end);
  }
  if (group.length) close();
  return out;
}

/** Horas visíveis na grade: 7h às 20h, abrindo para caber eventos fora disso. */
export function hourRange(placed: Placed[]): [number, number] {
  let from = 7;
  let to = 20;
  for (const p of placed) {
    from = Math.min(from, Math.floor(p.start / 60));
    to = Math.max(to, Math.ceil(p.end / 60));
  }
  return [Math.max(0, from), Math.min(24, to)];
}
