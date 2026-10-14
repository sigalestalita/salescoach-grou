// Webhooks da Recall.ai: status do bot e mudanças na agenda conectada.
//
// verify_jwt = false (config.toml): quem chama é a Recall, sem token do
// Supabase. Toda mensagem precisa da assinatura do workspace
// (RECALL_WEBHOOK_SECRET); sem ela, 401.
//
// Responde em menos de 15 s (limite da Recall): o download da gravação e a
// sincronização da agenda continuam em segundo plano.

import { adminClient } from "../_shared/tenant.ts";
import { verifyWebhook } from "../_shared/recall.ts";
import { CalendarConnection, handleBotEvent, processDoneBot, refreshCalendarStatus, syncCalendar } from "../_shared/bots.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const later = (p: Promise<unknown>) => {
  const safe = p.catch((e) => console.error("recall-webhook (segundo plano):", e));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(safe);
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const raw = await req.text();
  if (!(await verifyWebhook(req.headers, raw))) return new Response("assinatura inválida", { status: 401 });

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return new Response("corpo inválido", { status: 400 }); }
  const event = String(body.event ?? "");
  const data = (body.data ?? {}) as Record<string, unknown>;
  const admin = adminClient();

  try {
    if (event.startsWith("bot.")) {
      const next = await handleBotEvent(admin, event, body);
      if (next === "processar") later(processDoneBot(admin, String((data.bot as Record<string, unknown>)?.id)));
    } else if (event === "calendar.sync_events") {
      const { data: conn } = await admin.from("calendar_connections").select("*")
        .eq("recall_calendar_id", String(data.calendar_id)).eq("status", "conectado").maybeSingle();
      if (conn) later(syncCalendar(admin, conn as CalendarConnection, String(data.last_updated_ts)));
    } else if (event === "calendar.update") {
      later(refreshCalendarStatus(admin, String(data.calendar_id)));
    }
  } catch (e) {
    // Erro nosso: 500 faz a Recall reenviar depois.
    console.error("recall-webhook:", event, e);
    return new Response("erro", { status: 500 });
  }
  return new Response("ok");
});
