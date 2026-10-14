// Ciclo de vida do bot que entra na reunião. Só roda com a service role.
//
//   agendar (link ou agenda) → entrando → sala de espera → gravando
//   → processando → concluído (gravação no bucket e análise disparada)
//
// Cada bot tem uma reunião (meetings) desde o agendamento, com status
// "agendado", para o vendedor ver o que vai ser gravado.

import { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  BOT_STATUS, botConfig, CalendarEvent, eventTitle, externalLead, friendlyBotError, isMeetingUrl, joinAtFor, recall, RecallError,
  shouldRecord,
} from "./recall.ts";

type Json = Record<string, unknown>;

export interface CalendarConnection {
  id: string;
  org_id: string;
  user_id: string;
  provider: string;
  recall_calendar_id: string;
  email: string | null;
  status: string;
  mode: string;
}

async function productName(admin: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await admin.from("organization_branding").select("product_name").eq("org_id", orgId).maybeSingle();
  return data?.product_name ?? "Sales Coach";
}

async function teamOf(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("profiles").select("team_id").eq("user_id", userId).maybeSingle();
  return data?.team_id ?? null;
}

// ── Envio manual (link) ─────────────────────────────────────────────────────

export interface ManualBotInput {
  meetingUrl: string;
  startAt?: string | null;
  title: string;
  meetingType?: string | null;
  leadName?: string | null;
  leadCompany?: string | null;
  leadEmail?: string | null;
}

export async function scheduleManualBot(admin: SupabaseClient, orgId: string, userId: string, input: ManualBotInput) {
  const url = input.meetingUrl.trim();
  if (!isMeetingUrl(url)) throw new RecallError("Use um link do Google Meet, do Microsoft Teams ou do Zoom.", 400);
  const start = input.startAt ? new Date(input.startAt) : new Date();
  if (Number.isNaN(start.getTime())) throw new RecallError("Data e hora inválidas.", 400);
  if (start.getTime() < Date.now() - 3 * 3600_000) throw new RecallError("Essa reunião já passou.", 400);

  const { data: meeting, error } = await admin.from("meetings").insert({
    org_id: orgId,
    seller_id: userId,
    team_id: await teamOf(admin, userId),
    title: input.title.trim() || "Reunião",
    meeting_type: input.meetingType || null,
    lead_name: input.leadName || null,
    lead_company: input.leadCompany || null,
    lead_email: input.leadEmail || null,
    status: "agendado",
    meeting_date: start.toISOString(),
  }).select("id").single();
  if (error || !meeting) throw new RecallError(`Não foi possível criar a reunião: ${error?.message}`, 500);

  try {
    const joinAt = joinAtFor(start);
    const bot = await recall("POST", "/api/v1/bot/", {
      meeting_url: url,
      ...botConfig({ orgId, meetingId: meeting.id, userId }, await productName(admin, orgId)),
      ...(joinAt ? { join_at: joinAt } : {}),
    });
    await admin.from("meeting_bots").insert({
      org_id: orgId, meeting_id: meeting.id, user_id: userId, recall_bot_id: String(bot.id),
      meeting_url: url, join_at: joinAt ?? new Date().toISOString(), status: "agendado",
    });
    return { meetingId: meeting.id, botId: String(bot.id), joinAt: joinAt ?? null };
  } catch (e) {
    await admin.from("meetings").delete().eq("id", meeting.id);
    throw e;
  }
}

// ── Cancelar ────────────────────────────────────────────────────────────────

export async function cancelBot(admin: SupabaseClient, row: Json): Promise<void> {
  const botId = String(row.recall_bot_id);
  if (row.status === "agendado") {
    try {
      if (row.calendar_event_id) await recall("DELETE", `/api/v2/calendar-events/${row.calendar_event_id}/bot/`);
      else await recall("DELETE", `/api/v1/bot/${botId}/`);
    } catch (e) {
      // Já começou a entrar: tira da chamada.
      if (!(e instanceof RecallError) || e.status === 404) { /* nada agendado */ } else {
        await recall("POST", `/api/v1/bot/${botId}/leave_call/`).catch(() => {});
      }
    }
  } else if (["entrando", "sala_de_espera", "gravando"].includes(String(row.status))) {
    await recall("POST", `/api/v1/bot/${botId}/leave_call/`);
  }
  await admin.from("meeting_bots").update({ status: "cancelado", updated_at: new Date().toISOString() }).eq("id", row.id);
  // Reunião que nunca chegou a ser gravada sai da lista.
  await admin.from("meetings").delete().eq("id", row.meeting_id).eq("status", "agendado");
}

// ── Agenda conectada ────────────────────────────────────────────────────────

/** Bot por organização e reunião: dois vendedores da mesma empresa na mesma chamada = um bot. */
const dedupKey = (orgId: string, ev: CalendarEvent) => `${orgId}|${ev.start_time}|${ev.meeting_url}`;

export async function syncCalendar(admin: SupabaseClient, conn: CalendarConnection, sinceIso: string): Promise<{ agendados: number; removidos: number }> {
  let agendados = 0, removidos = 0;
  if (conn.status !== "conectado") return { agendados, removidos };
  const q = new URLSearchParams({ calendar_id: conn.recall_calendar_id, updated_at__gte: sinceIso });
  let next: string | null = `/api/v2/calendar-events/?${q}`;
  const product = await productName(admin, conn.org_id);

  while (next) {
    const page = await recall("GET", next);
    next = (page.next as string) || null;
    for (const ev of (page.results ?? []) as CalendarEvent[]) {
      try {
        const r = await syncEvent(admin, conn, ev, product);
        if (r === "agendado") agendados++;
        if (r === "removido") removidos++;
      } catch (e) {
        console.error("agenda: evento", ev.id, e);
      }
    }
  }
  return { agendados, removidos };
}

async function syncEvent(admin: SupabaseClient, conn: CalendarConnection, ev: CalendarEvent, product: string): Promise<string> {
  const { data: existing } = await admin.from("meeting_bots").select("*")
    .eq("org_id", conn.org_id).eq("calendar_event_id", ev.id).neq("status", "cancelado").maybeSingle();

  if (!shouldRecord(ev, conn.email ?? "", conn.mode)) {
    if (existing && existing.status === "agendado") {
      await cancelBot(admin, existing);
      return "removido";
    }
    return "ignorado";
  }

  const start = new Date(ev.start_time);
  const lead = externalLead(ev, conn.email ?? "");
  let meetingId = existing?.meeting_id as string | undefined;

  if (existing) {
    if (existing.status !== "agendado") return "ignorado";
    await admin.from("meetings").update({ title: eventTitle(ev), meeting_date: start.toISOString(), updated_at: new Date().toISOString() })
      .eq("id", meetingId!);
  } else {
    // Outro vendedor da mesma empresa já tem bot para esta reunião.
    const { data: twin } = await admin.from("meeting_bots").select("id")
      .eq("org_id", conn.org_id).eq("meeting_url", ev.meeting_url!).eq("join_at", new Date(start.getTime() - 60_000).toISOString())
      .neq("status", "cancelado").maybeSingle();
    if (twin) return "ignorado";

    const { data: meeting, error } = await admin.from("meetings").insert({
      org_id: conn.org_id,
      seller_id: conn.user_id,
      team_id: await teamOf(admin, conn.user_id),
      title: eventTitle(ev),
      lead_name: lead?.name ?? null,
      lead_email: lead?.email ?? null,
      status: "agendado",
      meeting_date: start.toISOString(),
    }).select("id").single();
    if (error || !meeting) throw new Error(`reunião: ${error?.message}`);
    meetingId = meeting.id;
  }

  const key = dedupKey(conn.org_id, ev);
  let resp: Json;
  try {
    resp = await recall("POST", `/api/v2/calendar-events/${ev.id}/bot/`, {
      deduplication_key: key,
      bot_config: botConfig({ orgId: conn.org_id, meetingId: meetingId!, userId: conn.user_id }, product, {
        join_at: new Date(start.getTime() - 60_000).toISOString(),
      }),
    });
  } catch (e) {
    if (!existing) await admin.from("meetings").delete().eq("id", meetingId!);
    throw e;
  }
  const bots = (resp.bots ?? []) as { bot_id: string; deduplication_key?: string }[];
  const bot = bots.find((b) => b.deduplication_key === key) ?? bots[bots.length - 1];
  if (!bot) throw new Error("agendamento sem bot na resposta");

  if (existing) {
    await admin.from("meeting_bots").update({
      recall_bot_id: bot.bot_id, join_at: new Date(start.getTime() - 60_000).toISOString(), meeting_url: ev.meeting_url, updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    const { error } = await admin.from("meeting_bots").insert({
      org_id: conn.org_id, meeting_id: meetingId, user_id: conn.user_id, recall_bot_id: bot.bot_id,
      calendar_event_id: ev.id, meeting_url: ev.meeting_url, join_at: new Date(start.getTime() - 60_000).toISOString(), status: "agendado",
    });
    // O bot já pertence a outra reunião (deduplicado): esta sai.
    if (error) { await admin.from("meetings").delete().eq("id", meetingId!); return "ignorado"; }
  }
  return "agendado";
}

// ── Status do bot ───────────────────────────────────────────────────────────

export async function handleBotEvent(admin: SupabaseClient, event: string, payload: Json): Promise<"processar" | "ok"> {
  const data = (payload.data ?? {}) as Json;
  const botId = String((data.bot as Json)?.id ?? "");
  const inner = (data.data ?? {}) as Json;
  const status = BOT_STATUS[event];
  if (!botId || !status) return "ok";

  const { data: row } = await admin.from("meeting_bots").select("*").eq("recall_bot_id", botId).maybeSingle();
  if (!row || row.status === "concluido" || row.status === "cancelado") return "ok";

  const now = new Date().toISOString();
  const detail = event === "bot.fatal" || event === "bot.recording_permission_denied"
    ? friendlyBotError(inner.sub_code as string | null) : (inner.sub_code as string | null) ?? null;
  await admin.from("meeting_bots").update({ status, status_detail: detail, updated_at: now }).eq("id", row.id);

  if (status === "gravando") {
    await admin.from("meetings").update({ status: "gravando", updated_at: now }).eq("id", row.meeting_id).eq("status", "agendado");
  }
  if (status === "erro") {
    await admin.from("meetings").update({ status: "erro", error_message: detail, updated_at: now })
      .eq("id", row.meeting_id).in("status", ["agendado", "gravando"]);
  }
  return event === "bot.done" ? "processar" : "ok";
}

/** Baixa o áudio da Recall para o bucket e dispara a análise. Idempotente. */
export async function processDoneBot(admin: SupabaseClient, botId: string): Promise<void> {
  // Trava: só um processamento por bot, mesmo com o webhook repetido.
  const { data: row } = await admin.from("meeting_bots")
    .update({ status: "concluido", updated_at: new Date().toISOString() })
    .eq("recall_bot_id", botId).not("status", "in", "(concluido,cancelado)")
    .select("*").maybeSingle();
  if (!row) return;

  const fail = async (msg: string) => {
    await admin.from("meeting_bots").update({ status: "erro", status_detail: msg, updated_at: new Date().toISOString() }).eq("id", row.id);
    await admin.from("meetings").update({ status: "erro", error_message: msg }).eq("id", row.meeting_id);
  };

  try {
    const bot = await recall("GET", `/api/v1/bot/${botId}/`);
    const rec = ((bot.recordings ?? []) as Json[])[0];
    const audio = ((rec?.media_shortcuts as Json)?.audio_mixed as Json)?.data as Json | undefined;
    const url = audio?.download_url as string | undefined;
    if (!url) return await fail("A reunião terminou sem gravação de áudio (ninguém falou ou o bot não foi admitido).");

    const started = rec?.started_at ? Date.parse(String(rec.started_at)) : NaN;
    const ended = rec?.completed_at ? Date.parse(String(rec.completed_at)) : NaN;
    const seconds = Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, Math.round((ended - started) / 1000)) : null;

    // Copia o arquivo em fluxo, sem carregar na memória da função.
    const media = await fetch(url);
    if (!media.ok || !media.body) return await fail(`Não foi possível baixar a gravação (HTTP ${media.status}).`);
    const path = `${row.user_id}/${Date.now()}-bot.mp3`;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const put = await fetch(`${supabaseUrl}/storage/v1/object/meeting-files/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "audio/mpeg", "x-upsert": "false" },
      body: media.body,
      // @ts-ignore: necessário para enviar um stream no Deno
      duplex: "half",
    });
    if (put.ok) {
      await admin.from("meetings").update({
        file_url: path, file_type: "mp3", status: "enviado", duration_seconds: seconds, error_message: null,
        updated_at: new Date().toISOString(),
      }).eq("id", row.meeting_id);
    } else {
      // Arquivo acima do limite do bucket (ou falha no Storage): a análise lê
      // direto do link da Recall, que vale por algumas horas. A reunião fica
      // sem o player de áudio, mas com a análise.
      console.error("bot: falha ao guardar o áudio", put.status, await put.text().catch(() => ""));
      await admin.from("meetings").update({
        youtube_url: url, file_type: "mp3", status: "enviado", duration_seconds: seconds, error_message: null,
        updated_at: new Date().toISOString(),
      }).eq("id", row.meeting_id);
    }

    if (seconds) {
      await admin.from("api_usage_logs").insert({
        org_id: row.org_id, meeting_id: row.meeting_id, operation_type: "bot_gravacao", model_used: "recall/bot",
        provider: "recall", quantity: Math.ceil(seconds / 60), unit: "minutos",
      }).then(() => {}, (e: unknown) => console.error("uso do bot", e));
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/analyze-meeting`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
      },
      body: JSON.stringify({ meetingId: row.meeting_id }),
    });
    if (!res.ok) console.error("bot: análise não iniciou", await res.text());
  } catch (e) {
    console.error("bot: processamento", botId, e);
    await fail(e instanceof Error ? e.message : "Falha ao processar a gravação do bot.");
  }
}

// ── Agenda: status da conexão ───────────────────────────────────────────────

export async function refreshCalendarStatus(admin: SupabaseClient, recallCalendarId: string): Promise<void> {
  const cal = await recall("GET", `/api/v2/calendars/${recallCalendarId}/`);
  if (cal.status === "disconnected") {
    const changes = (cal.status_changes ?? []) as Json[];
    const reason = String(changes[changes.length - 1]?.reason ?? "A autorização da agenda foi revogada.");
    await admin.from("calendar_connections").update({ status: "desconectado", last_error: reason, updated_at: new Date().toISOString() })
      .eq("recall_calendar_id", recallCalendarId);
  }
}
