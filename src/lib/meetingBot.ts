import { supabase } from "@/integrations/supabase/client";

/** Robô de reunião (protótipo, função meeting-bot): grava a chamada pelos servidores da Recall. */
export interface MeetingBot {
  id: string;
  calendar_event_id: string | null;
  meeting_url: string;
  title: string | null;
  start_at: string | null;
  status: string;
  status_detail: string | null;
  meeting_id: string | null;
  /** Agendado pelo robô automático. */
  automatico?: boolean;
  created_at: string;
}

/** Robô automático: em quais reuniões da agenda ele entra sozinho. */
export type ModoRobo = "desligado" | "clientes" | "todas";

export const MODO_LABEL: Record<ModoRobo, string> = {
  desligado: "Só quando eu mandar",
  clientes: "Reuniões com cliente",
  todas: "Todas as reuniões com link",
};

export const BOT_ATIVOS = ["agendado", "entrando", "sala_de_espera", "na_chamada", "gravando", "processando"];

export const BOT_LABEL: Record<string, string> = {
  agendado: "Robô agendado: entra na hora da reunião",
  entrando: "Robô entrando na chamada",
  sala_de_espera: "Robô na sala de espera: aceite a entrada dele na chamada",
  na_chamada: "Robô na chamada, esperando para gravar",
  gravando: "Robô gravando",
  processando: "Reunião encerrada: preparando a gravação",
  concluido: "Gravação enviada para análise",
  cancelado: "Robô cancelado",
  erro: "O robô não gravou",
};

/** Só Meet, Teams e Zoom (o mesmo critério da função). */
export function robotAceita(url: string | null): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "meet.google.com" || /(^|\.)teams\.(microsoft|live)\.com$/.test(h) || /(^|\.)zoom\.us$/.test(h);
  } catch {
    return false;
  }
}

/**
 * O robô automático vai entrar nesta reunião (o mesmo critério da função; ela
 * agenda o robô nas 24 horas antes). Reunião já gravada ou que já começou há
 * mais de 20 minutos fica de fora.
 */
export function entraSozinho(
  ev: { joinUrl: string | null; declined: boolean; externo: boolean; start: string; end: string; meeting: unknown },
  modo: ModoRobo,
  now: Date,
): boolean {
  if (modo === "desligado" || ev.declined || ev.meeting || !robotAceita(ev.joinUrl)) return false;
  if (modo === "clientes" && !ev.externo) return false;
  return new Date(ev.end) > now && new Date(ev.start).getTime() > now.getTime() - 20 * 60_000;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("meeting-bot", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detail = await ctx?.json?.().catch(() => null);
    throw new Error(detail?.error ?? "Não foi possível falar com o robô agora.");
  }
  return data as T;
}

export const meetingBotApi = {
  listar: (from: Date, to: Date) =>
    call<{ ativo: boolean; modo?: ModoRobo; robos: MeetingBot[] }>({ action: "listar", from: from.toISOString(), to: to.toISOString() }),
  enviar: (ev: { id: string; joinUrl: string; title: string; start: string; lead: { name: string | null; email: string } | null; attendees: unknown[] }) =>
    call<{ ok: boolean; id: string }>({ action: "enviar", eventId: ev.id, meetingUrl: ev.joinUrl, title: ev.title, start: ev.start, lead: ev.lead, attendees: ev.attendees }),
  cancelar: (id: string) => call<{ ok: boolean }>({ action: "cancelar", id }),
  pular: (ev: { id: string; joinUrl: string; title: string; start: string }) =>
    call<{ ok: boolean }>({ action: "pular", eventId: ev.id, meetingUrl: ev.joinUrl, title: ev.title, start: ev.start }),
  modo: (modo: ModoRobo) => call<{ ok: boolean; modo: ModoRobo }>({ action: "modo", modo }),
};
