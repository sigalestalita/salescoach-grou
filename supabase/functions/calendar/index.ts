// Agenda do vendedor (Google Agenda e Outlook).
//
// POST com o token do usuário:
//   { action: "status" }                      conexão atual e agendas disponíveis
//   { action: "connect", provider, returnTo } endereço de autorização
//   { action: "disconnect" }                  remove a conexão e os tokens
//   { action: "lookup", meetingUrl, title }   evento da reunião aberta agora,
//                                             o robô dela e como o vendedor
//                                             escolheu gravar (usado pela extensão)
//   { action: "events", from, to }            eventos da agenda principal no
//                                             período, com a gravação de cada
//                                             um (tela Minha agenda)
// GET ?code&state: volta do Google/Microsoft depois da autorização.
//
// verify_jwt = false (config.toml): o GET vem do navegador, sem token do
// Supabase; a autenticidade vem do "state" assinado. O POST valida o usuário
// em getCaller.

import { json, preflight } from "../_shared/cors.ts";
import { adminClient, getCaller, HttpError } from "../_shared/tenant.ts";
import { signState, verifyState } from "../_shared/crm/crypto.ts";
import { backTo, safeReturn } from "../_shared/redirect.ts";
import {
  AGENDA_MAX_DAYS, agendaEvents, authorizeUrl, availableProviders, CalendarError, CalendarProvider, exchangeCode,
  lookupMeeting, meetingKeys, saveAccount,
} from "../_shared/calendar.ts";
import { ROBO_ATIVO, roboDaChamada } from "../_shared/robo.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  // ── Volta do OAuth ──
  if (req.method === "GET") {
    const url = new URL(req.url);
    const state = await verifyState(url.searchParams.get("state") ?? "");
    if (!state) return new Response("Link de autorização inválido ou expirado. Volte ao Sales Coach e tente de novo.", { status: 400 });
    const returnTo = safeReturn(state.returnTo, "/agendas");
    const code = url.searchParams.get("code");
    if (!code) return backTo(returnTo, { agenda: "erro", motivo: "Autorização cancelada." });

    try {
      const provider = state.provider as CalendarProvider;
      const tokens = await exchangeCode(provider, code);
      const admin = adminClient();
      // Quem iniciou ainda precisa pertencer à mesma organização.
      const { data: profile } = await admin.from("profiles").select("org_id").eq("user_id", state.userId).maybeSingle();
      if (profile?.org_id !== state.orgId) return backTo(returnTo, { agenda: "erro", motivo: "Usuário fora da empresa." });

      await saveAccount(admin, { orgId: state.orgId, userId: state.userId, provider, email: tokens.email, tokens });
      await admin.from("audit_log").insert({
        org_id: state.orgId, actor_user_id: state.userId, action: "agenda_conectada", entity: "calendar_accounts", metadata: { provider },
      }).then(() => {}, () => {});
      return backTo(returnTo, { agenda: "conectada" });
    } catch (e) {
      console.error("calendar callback:", e);
      const motivo = e instanceof CalendarError ? e.message : "Não foi possível conectar a agenda.";
      return backTo(returnTo, { agenda: "erro", motivo });
    }
  }

  try {
    const ctx = await getCaller(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "status");

    if (action === "status") {
      const { data: connection } = await ctx.admin.from("calendar_accounts")
        .select("provider, email, status, last_error, connected_at").eq("user_id", ctx.userId).maybeSingle();
      return json(req, { connection: connection ?? null, providers: availableProviders() });
    }

    if (action === "connect") {
      const provider = String(body.provider ?? "");
      const state = await signState({
        orgId: ctx.orgId, userId: ctx.userId, provider, returnTo: safeReturn(body.returnTo, "/agendas"), issuedAt: Date.now(),
      });
      return json(req, { url: authorizeUrl(provider, state) });
    }

    if (action === "disconnect") {
      await ctx.admin.from("calendar_accounts").delete().eq("user_id", ctx.userId);
      return json(req, { ok: true });
    }

    if (action === "lookup") {
      const meetingUrl = typeof body.meetingUrl === "string" ? body.meetingUrl.slice(0, 2000) : null;
      const title = typeof body.title === "string" ? body.title.slice(0, 300) : null;
      let event = null, reconnect = false;
      try {
        event = await lookupMeeting(ctx.admin, ctx.userId, ctx.email, { meetingUrl, title });
      } catch (e) {
        // A gravação não depende da agenda: falha aqui vira "sem evento".
        console.error("calendar lookup:", e);
        reconnect = e instanceof CalendarError && e.reconnect;
      }
      // Robô desta chamada (com ou sem agenda conectada): com ele, a extensão
      // oferece só o coach ao vivo; com "Não gravar", não oferece a gravação.
      let robo = null, escolha = null;
      try {
        const agora = Date.now();
        const { data: robos } = await ctx.admin.from("meeting_bots")
          .select("id, calendar_event_id, meeting_url, status, escolha")
          .eq("user_id", ctx.userId)
          .gte("start_at", new Date(agora - 6 * 3600_000).toISOString())
          .lte("start_at", new Date(agora + 3 * 3600_000).toISOString())
          .order("created_at", { ascending: false }).limit(50);
        const r = roboDaChamada(robos ?? [], { eventId: event?.eventId ?? null, chaves: meetingKeys([meetingUrl]), chavesDe: (u) => meetingKeys([u]) });
        if (r && ROBO_ATIVO.includes(r.status)) robo = { id: r.id, status: r.status };
        else if (r?.status === "cancelado") escolha = r.escolha;
      } catch (e) {
        console.error("calendar lookup (robô):", e);
      }
      return json(req, { event, reconnect, robo, escolha });
    }

    if (action === "events") {
      // Só a agenda de quem pede: ninguém vê a agenda de outra pessoa.
      const from = new Date(String(body.from ?? ""));
      const to = new Date(String(body.to ?? ""));
      if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) throw new HttpError(400, "Período inválido.");
      if (to.getTime() - from.getTime() > AGENDA_MAX_DAYS * 86400_000) throw new HttpError(400, "Período longo demais.");
      const events = await agendaEvents(ctx.admin, ctx.userId, ctx.email, from, to);
      return json(req, { connected: events !== null, events: events ?? [] });
    }

    throw new HttpError(400, "Ação desconhecida.");
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    if (e instanceof CalendarError) return json(req, { error: e.message, reconnect: e.reconnect }, e.status);
    console.error("calendar:", e);
    return json(req, { error: "Erro inesperado." }, 500);
  }
});
