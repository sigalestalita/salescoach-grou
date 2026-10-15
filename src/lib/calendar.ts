import { supabase } from "@/integrations/supabase/client";

/** Agenda do vendedor (função calendar). Só leitura: título, participantes e lead das reuniões. */
export type CalendarProvider = "google" | "microsoft";

export interface CalendarConnection {
  provider: CalendarProvider;
  email: string | null;
  status: "conectado" | "erro";
  last_error: string | null;
  connected_at: string;
}

export interface Attendee {
  name: string | null;
  email: string;
  externo: boolean;
}

export const CALENDAR_NAME: Record<CalendarProvider, string> = {
  google: "Google Agenda",
  microsoft: "Outlook",
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("calendar", { body });
  if (error) {
    // A mensagem útil vem no corpo da resposta, não no erro genérico do cliente.
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? "Não foi possível falar com a agenda agora.");
  }
  return data as T;
}

export const calendarApi = {
  status: () => call<{ connection: CalendarConnection | null; providers: CalendarProvider[] }>({ action: "status" }),
  connect: (provider: CalendarProvider) =>
    call<{ url: string }>({ action: "connect", provider, returnTo: `${window.location.origin}/agendas` }),
  disconnect: () => call<{ ok: boolean }>({ action: "disconnect" }),
};
