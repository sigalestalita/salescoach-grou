// Ações do app sobre o bot de reunião e a agenda conectada. Uma ação por chamada:
//
//   schedule            envia o bot para um link (agora ou num horário)
//   cancel              cancela o bot de uma reunião agendada ou em andamento
//   meeting             bot de uma reunião (para a página da reunião)
//   calendar            agenda conectada de quem chama
//   calendar_connect    endereço de autorização do Google ou do Outlook
//   calendar_mode       quais reuniões o bot grava (externas, todas, nenhuma)
//   calendar_disconnect desconecta a agenda e cancela os bots dela

import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { json, preflight } from "../_shared/cors.ts";
import { ANON_KEY, assertOrgActive, getCaller, HttpError, SUPABASE_URL } from "../_shared/tenant.ts";
import { signState } from "../_shared/crm/crypto.ts";
import { recall, RecallError } from "../_shared/recall.ts";
import { CalendarConnection, cancelBot, scheduleManualBot, syncCalendar } from "../_shared/bots.ts";
import { authorizeUrl, CALENDAR_PROVIDERS } from "../_shared/calendar-oauth.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

function safeReturn(url: unknown): string {
  const app = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  const fallback = `${app}/agendas`;
  if (typeof url !== "string") return fallback;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const appHost = app ? new URL(app).hostname : "";
    const domains = (Deno.env.get("PLATFORM_DOMAINS") ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
    const extras = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim().toLowerCase()).filter(Boolean);
    const ok = u.protocol === "https:" && (host === appHost || domains.some((d) => host === d || host.endsWith(`.${d}`)) || extras.includes(u.origin.toLowerCase()));
    return ok ? u.toString() : fallback;
  } catch {
    return fallback;
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const ctx = await getCaller(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const admin = ctx.admin;

    switch (action) {
      case "schedule": {
        await assertOrgActive(ctx);
        const r = await scheduleManualBot(admin, ctx.orgId, ctx.userId, {
          meetingUrl: String(body.meetingUrl ?? ""),
          startAt: body.startAt ? String(body.startAt) : null,
          title: String(body.title ?? ""),
          meetingType: body.meetingType ? String(body.meetingType) : null,
          leadName: body.leadName ? String(body.leadName) : null,
          leadCompany: body.leadCompany ? String(body.leadCompany) : null,
          leadEmail: body.leadEmail ? String(body.leadEmail) : null,
        });
        return json(req, r);
      }

      case "cancel": {
        // A reunião precisa estar visível para quem chama (RLS de meetings).
        const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization")! } } });
        const { data: m } = await userClient.from("meetings").select("id").eq("id", String(body.meetingId)).maybeSingle();
        if (!m) throw new HttpError(404, "Reunião não encontrada.");
        const { data: row } = await admin.from("meeting_bots").select("*")
          .eq("meeting_id", m.id).eq("org_id", ctx.orgId).not("status", "in", "(concluido,cancelado)").maybeSingle();
        if (!row) throw new HttpError(409, "Não há bot ativo nesta reunião.");
        await cancelBot(admin, row);
        return json(req, { ok: true });
      }

      case "meeting": {
        const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization")! } } });
        const { data: m } = await userClient.from("meetings").select("id").eq("id", String(body.meetingId)).maybeSingle();
        if (!m) throw new HttpError(404, "Reunião não encontrada.");
        const { data: bot } = await admin.from("meeting_bots").select("status, status_detail, join_at, meeting_url, calendar_event_id, updated_at")
          .eq("meeting_id", m.id).eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(1).maybeSingle();
        return json(req, { bot: bot ?? null });
      }

      case "calendar": {
        const { data } = await admin.from("calendar_connections").select("id, provider, email, status, mode, last_error, created_at")
          .eq("org_id", ctx.orgId).eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
        return json(req, { connection: data ?? null, providers: CALENDAR_PROVIDERS.filter((p) => p.available()).map((p) => p.key) });
      }

      case "calendar_connect": {
        const provider = String(body.provider ?? "");
        const state = await signState({ orgId: ctx.orgId, userId: ctx.userId, provider, returnTo: safeReturn(body.returnTo), issuedAt: Date.now() });
        return json(req, { url: authorizeUrl(provider, state) });
      }

      case "calendar_mode": {
        const mode = String(body.mode ?? "");
        if (!["externas", "todas", "nenhuma"].includes(mode)) throw new HttpError(400, "Opção inválida.");
        const { data: conn } = await admin.from("calendar_connections").update({ mode, updated_at: new Date().toISOString() })
          .eq("org_id", ctx.orgId).eq("user_id", ctx.userId).eq("status", "conectado").select("*").maybeSingle();
        if (!conn) throw new HttpError(409, "Nenhuma agenda conectada.");
        // Reaplica a regra a todos os eventos da janela (próximos 28 dias).
        const job = syncCalendar(admin, conn as CalendarConnection, "2000-01-01T00:00:00Z").catch((e) => console.error("agenda: ressincronizar", e));
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job);
        return json(req, { ok: true, mode });
      }

      case "calendar_disconnect": {
        const { data: conn } = await admin.from("calendar_connections").select("*")
          .eq("org_id", ctx.orgId).eq("user_id", ctx.userId).eq("status", "conectado").maybeSingle();
        if (!conn) throw new HttpError(409, "Nenhuma agenda conectada.");
        // Apagar a agenda na Recall cancela os bots agendados por ela.
        await recall("DELETE", `/api/v2/calendars/${conn.recall_calendar_id}/`).catch((e) => {
          if (!(e instanceof RecallError && e.status === 404)) throw e;
        });
        await admin.from("calendar_connections").update({ status: "desconectado", updated_at: new Date().toISOString() }).eq("id", conn.id);
        const { data: pend } = await admin.from("meeting_bots").select("id, meeting_id")
          .eq("org_id", ctx.orgId).eq("user_id", ctx.userId).eq("status", "agendado").not("calendar_event_id", "is", null);
        for (const p of pend ?? []) {
          await admin.from("meeting_bots").update({ status: "cancelado" }).eq("id", p.id);
          await admin.from("meetings").delete().eq("id", p.meeting_id).eq("status", "agendado");
        }
        return json(req, { ok: true });
      }

      default:
        throw new HttpError(400, "Ação inválida.");
    }
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message }, e.status);
    if (e instanceof RecallError) return json(req, { error: e.message }, e.status >= 500 ? 502 : e.status);
    console.error("meeting-bot:", e);
    return json(req, { error: "Não foi possível concluir. Tente de novo." }, 500);
  }
});
