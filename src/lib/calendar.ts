import { supabase } from "@/integrations/supabase/client";
import { supportSession } from "@/lib/support";

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

/** Evento da agenda principal, com a gravação ligada a ele (tela Minha agenda). */
export interface AgendaItem {
  id: string;
  title: string;
  start: string;
  end: string;
  joinUrl: string | null;
  webLink: string | null;
  declined: boolean;
  attendees: Attendee[];
  lead: { name: string | null; email: string } | null;
  externo: boolean;
  meeting: {
    id: string;
    title: string;
    status: string;
    overall_score: number | null;
    temperature: string | null;
  } | null;
}

export const CALENDAR_NAME: Record<CalendarProvider, string> = {
  google: "Google Agenda",
  microsoft: "Outlook",
};

async function call<T>(body: Record<string, unknown>, readOnlyResult?: T): Promise<T> {
  // A agenda pertence ao operador, não à empresa visitada. Não chamar a
  // função no modo "Ver conta", que bloqueia inclusive leituras da agenda.
  const support = await supportSession();
  if (support && !support.canEdit) {
    if (readOnlyResult !== undefined) return readOnlyResult;
    throw new Error("Indisponível no modo suporte (só leitura).");
  }
  const { data, error } = await supabase.functions.invoke("calendar", { body });
  if (error) {
    // A mensagem útil vem no corpo da resposta, não no erro genérico do cliente.
    const ctx = (error as { context?: Response }).context;
    const detail = await ctx?.json?.().catch(() => null);
    // A sessão de suporte pode mudar entre a checagem e a resposta.
    if (ctx?.status === 403 && detail?.code === "SUPPORT_READ_ONLY" && readOnlyResult !== undefined) {
      return readOnlyResult;
    }
    if (ctx?.status === 401) {
      // Login expirado no servidor: sai e volta para a tela de login.
      await supabase.auth.signOut().catch(() => {});
      throw new Error("Sua sessão expirou. Entre novamente.");
    }
    throw new Error(detail?.error ?? "Não foi possível falar com a agenda agora.");
  }
  return data as T;
}

export const calendarApi = {
  status: () => call<{ connection: CalendarConnection | null; providers: CalendarProvider[] }>({ action: "status" }, { connection: null, providers: [] }),
  connect: (provider: CalendarProvider) =>
    call<{ url: string }>({ action: "connect", provider, returnTo: `${window.location.origin}/agendas` }),
  disconnect: () => call<{ ok: boolean }>({ action: "disconnect" }),
  events: (from: Date, to: Date) =>
    call<{ connected: boolean; events: AgendaItem[] }>({ action: "events", from: from.toISOString(), to: to.toISOString() }, { connected: false, events: [] }),
};
