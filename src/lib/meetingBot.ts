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
  created_at: string;
}

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
    call<{ ativo: boolean; robos: MeetingBot[] }>({ action: "listar", from: from.toISOString(), to: to.toISOString() }),
  enviar: (ev: { id: string; joinUrl: string; title: string; start: string; lead: { name: string | null; email: string } | null; attendees: unknown[] }) =>
    call<{ ok: boolean; id: string }>({ action: "enviar", eventId: ev.id, meetingUrl: ev.joinUrl, title: ev.title, start: ev.start, lead: ev.lead, attendees: ev.attendees }),
  cancelar: (id: string) => call<{ ok: boolean }>({ action: "cancelar", id }),
};
