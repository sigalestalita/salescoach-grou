// Cliente do bot de reunião e da agenda conectada. Tudo passa pela edge
// function meeting-bot; o app não escreve nas tabelas de bot.
import { supabase } from "@/integrations/supabase/client";

export type CalendarProvider = "google_calendar" | "microsoft_outlook";
export type RecordMode = "externas" | "todas" | "nenhuma";

export const CALENDAR_NAME: Record<CalendarProvider, string> = {
  google_calendar: "Google Agenda",
  microsoft_outlook: "Outlook",
};

export const RECORD_MODE_LABEL: Record<RecordMode, string> = {
  externas: "Reuniões com pessoas de fora da empresa",
  todas: "Todas as reuniões com link de vídeo",
  nenhuma: "Nenhuma: só quando eu enviar o bot",
};

export interface CalendarConnection {
  id: string;
  provider: CalendarProvider;
  email: string | null;
  status: "conectado" | "desconectado";
  mode: RecordMode;
  last_error: string | null;
  created_at: string;
}

export interface MeetingBot {
  status: "agendado" | "entrando" | "sala_de_espera" | "gravando" | "processando" | "concluido" | "erro" | "cancelado";
  status_detail: string | null;
  join_at: string | null;
  meeting_url: string;
  calendar_event_id: string | null;
  updated_at: string;
}

export const BOT_STATUS_LABEL: Record<MeetingBot["status"], string> = {
  agendado: "Bot agendado",
  entrando: "Bot entrando na reunião",
  sala_de_espera: "Bot na sala de espera: admita o participante",
  gravando: "Bot gravando",
  processando: "Processando a gravação",
  concluido: "Gravação recebida",
  erro: "O bot não conseguiu gravar",
  cancelado: "Bot cancelado",
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("meeting-bot", { body });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const payload = await ctx.json().catch(() => null);
      if (payload?.error) message = payload.error;
    }
    throw new Error(message);
  }
  return data as T;
}

export const botApi = {
  schedule: (input: {
    meetingUrl: string; startAt?: string | null; title: string; meetingType?: string | null;
    leadName?: string; leadCompany?: string; leadEmail?: string;
  }) => call<{ meetingId: string; joinAt: string | null }>({ action: "schedule", ...input }),
  cancel: (meetingId: string) => call<{ ok: true }>({ action: "cancel", meetingId }),
  meeting: (meetingId: string) => call<{ bot: MeetingBot | null }>({ action: "meeting", meetingId }),
  calendar: () => call<{ connection: CalendarConnection | null; providers: CalendarProvider[] }>({ action: "calendar" }),
  connectCalendar: (provider: CalendarProvider) =>
    call<{ url: string }>({ action: "calendar_connect", provider, returnTo: `${window.location.origin}/agendas` }),
  setMode: (mode: RecordMode) => call<{ ok: true }>({ action: "calendar_mode", mode }),
  disconnectCalendar: () => call<{ ok: true }>({ action: "calendar_disconnect" }),
};

/** Link de Meet, Teams ou Zoom (a mesma regra da função). */
export function isMeetingUrl(url: string): boolean {
  return [
    /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i,
    /^https:\/\/teams\.microsoft\.com\/(l\/meetup-join|meet)\//i,
    /^https:\/\/teams\.live\.com\/meet\//i,
    /^https:\/\/([a-z0-9-]+\.)?zoom\.us\/(j|my|w)\//i,
  ].some((re) => re.test(url.trim()));
}
