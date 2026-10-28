// Robô automático: em quais reuniões da agenda o robô entra sem o vendedor
// mandar. O agendador (pg_cron, de 10 em 10 minutos) lê a agenda das próximas
// 24 horas de quem ligou o modo automático e decide, evento a evento, o que
// fazer com o robô. Só regras aqui, sem banco nem Recall, para testar.
//
// Exceções do vendedor ficam em meeting_bots: um robô cancelado por ele (ou uma
// reunião marcada como "não gravar") não volta a ser agendado.

import { plataformaDe } from "./recall.ts";

export type ModoRobo = "desligado" | "clientes" | "todas";
export const MODOS_ROBO: ModoRobo[] = ["desligado", "clientes", "todas"];

/** Até onde o agendador olha a agenda. */
export const JANELA_HORAS = 24;
/** Reunião que começou há pouco ainda recebe o robô (o agendador pode ter rodado depois). */
const TOLERANCIA_INICIO_MS = 20 * 60_000;

export interface EventoAgenda {
  id: string;
  title: string;
  start: string;
  end: string;
  joinUrl: string | null;
  declined: boolean;
  externo: boolean;
  /** Já tem gravação ligada (a extensão gravou, por exemplo). */
  gravada: boolean;
}

export interface RoboExistente {
  id: string;
  calendar_event_id: string | null;
  meeting_url: string;
  start_at: string | null;
  status: string;
  automatico: boolean;
  provider_bot_id: string | null;
}

export type Acao =
  | { tipo: "criar"; ev: EventoAgenda }
  | { tipo: "remarcar"; robo: RoboExistente; ev: EventoAgenda }
  | { tipo: "tirar"; robo: RoboExistente; motivo: string };

/** O evento é do tipo que o modo escolhido grava (sem olhar o horário). */
export function modoInclui(ev: EventoAgenda, modo: ModoRobo): boolean {
  if (modo === "desligado" || ev.declined || !ev.joinUrl || !plataformaDe(ev.joinUrl)) return false;
  return modo === "todas" || ev.externo;
}

/** Ainda dá tempo de mandar o robô para esta reunião. */
export function aTempo(ev: EventoAgenda, agora: Date): boolean {
  const ini = new Date(ev.start).getTime(), fim = new Date(ev.end).getTime();
  return fim > agora.getTime() && ini > agora.getTime() - TOLERANCIA_INICIO_MS;
}

/**
 * O que fazer na agenda de um vendedor. `robos` vem do mais novo para o mais
 * antigo: vale o último robô de cada evento.
 */
export function planejar(eventos: EventoAgenda[], robos: RoboExistente[], modo: ModoRobo, agora: Date, fimJanela: Date): Acao[] {
  const acoes: Acao[] = [];
  const vistos = new Set<string>();
  for (const ev of eventos) {
    vistos.add(ev.id);
    const r = robos.find((x) => x.calendar_event_id === ev.id);
    if (r) {
      if (r.status !== "agendado") continue; // já entrou, terminou, deu erro ou o vendedor tirou
      if (ev.declined || !ev.joinUrl || !plataformaDe(ev.joinUrl)) {
        acoes.push({ tipo: "tirar", robo: r, motivo: "Você recusou o convite ou a reunião ficou sem link." });
      } else if (r.automatico && !modoInclui(ev, modo)) {
        acoes.push({ tipo: "tirar", robo: r, motivo: "O robô automático não grava este tipo de reunião." });
      } else if (ev.joinUrl !== r.meeting_url || !r.start_at || Math.abs(new Date(ev.start).getTime() - new Date(r.start_at).getTime()) > 60_000) {
        acoes.push({ tipo: "remarcar", robo: r, ev });
      }
      continue;
    }
    if (!ev.gravada && modoInclui(ev, modo) && aTempo(ev, agora)) acoes.push({ tipo: "criar", ev });
  }
  // Robô agendado para um evento que sumiu da janela: a reunião foi apagada ou mudou de dia.
  for (const r of robos) {
    if (r.status !== "agendado" || !r.calendar_event_id || vistos.has(r.calendar_event_id) || !r.start_at) continue;
    const t = new Date(r.start_at).getTime();
    if (t < agora.getTime() || t > fimJanela.getTime()) continue;
    vistos.add(r.calendar_event_id);
    acoes.push({ tipo: "tirar", robo: r, motivo: "A reunião saiu da agenda ou mudou de dia. Envie o robô de novo, se quiser." });
  }
  return acoes;
}
