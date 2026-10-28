// Robô de reunião (protótipo): o vendedor manda o robô da Recall para uma
// reunião da agenda, em vez de gravar pela extensão.
//
// POST com o token do usuário:
//   { action: "listar", from, to }   robôs do vendedor no período e se o robô está ativo
//   { action: "enviar", eventId, meetingUrl, title, start, lead, attendees, meetingType? }
//   { action: "cancelar", id }       tira da agenda ou faz o robô sair da chamada
//
// A gravação pronta chega pela função meeting-bot-webhook.

import { json, preflight } from "../_shared/cors.ts";
import { assertQuota, getCaller, HttpError } from "../_shared/tenant.ts";
import { cancelarRobo, criarRobo, plataformaDe, recallAtivo, RecallError } from "../_shared/recall.ts";

const ATIVOS = ["agendado", "entrando", "sala_de_espera", "na_chamada", "gravando", "processando"];
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const ctx = await getCaller(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "listar") {
      const from = new Date(String(body.from ?? "")), to = new Date(String(body.to ?? ""));
      if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) throw new HttpError(400, "Período inválido.");
      const { data, error } = await ctx.admin.from("meeting_bots")
        .select("id, calendar_event_id, meeting_url, title, start_at, status, status_detail, meeting_id, created_at")
        .eq("user_id", ctx.userId)
        .gte("start_at", new Date(from.getTime() - 86400_000).toISOString())
        .lte("start_at", new Date(to.getTime() + 86400_000).toISOString())
        .order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return json(req, { ativo: recallAtivo(), robos: data ?? [] });
    }

    if (!recallAtivo()) throw new HttpError(503, "O robô de reunião ainda não está ativo nesta conta.");

    if (action === "enviar") {
      const meetingUrl = txt(body.meetingUrl, 2000);
      if (!meetingUrl || !plataformaDe(meetingUrl)) throw new HttpError(400, "O robô entra só em reuniões do Google Meet, Microsoft Teams ou Zoom.");
      const eventId = txt(body.eventId, 300);
      const inicio = body.start ? new Date(String(body.start)) : null;
      if (inicio && isNaN(inicio.getTime())) throw new HttpError(400, "Horário inválido.");
      if (inicio && inicio.getTime() < Date.now() - 3 * 3600_000) throw new HttpError(400, "Essa reunião já passou.");

      if (eventId) {
        const { data: ja } = await ctx.admin.from("meeting_bots").select("id")
          .eq("user_id", ctx.userId).eq("calendar_event_id", eventId).in("status", ATIVOS).limit(1);
        if (ja?.length) throw new HttpError(409, "O robô já está marcado para esta reunião.");
      }
      await assertQuota(ctx.admin, ctx.orgId, "analise", 1);

      const { data: perfil } = await ctx.admin.from("profiles").select("full_name").eq("user_id", ctx.userId).maybeSingle();
      const primeiro = String(perfil?.full_name ?? ctx.email ?? "").trim().split(/[\s@]+/)[0];
      const lead = body.lead && typeof body.lead === "object" ? body.lead : {};
      const attendees = Array.isArray(body.attendees) ? body.attendees.slice(0, 50) : null;

      const { data: linha, error: errIns } = await ctx.admin.from("meeting_bots").insert({
        org_id: ctx.orgId, user_id: ctx.userId, calendar_event_id: eventId, meeting_url: meetingUrl,
        title: txt(body.title, 300), start_at: inicio ? inicio.toISOString() : new Date().toISOString(),
        meeting_type: txt(body.meetingType, 80), lead_name: txt(lead.name, 200), lead_email: txt(lead.email, 200),
        lead_company: txt(body.leadCompany, 200), attendees,
      }).select("id").single();
      if (errIns || !linha) throw errIns ?? new Error("meeting_bots: insert");

      try {
        const bot = await criarRobo({
          meetingUrl,
          nome: primeiro ? `Sales Coach · gravando para ${primeiro}` : "Sales Coach · gravando",
          inicio,
          metadata: { bot_row: linha.id, org_id: ctx.orgId, user_id: ctx.userId },
        });
        await ctx.admin.from("meeting_bots").update({ provider_bot_id: bot.id, updated_at: new Date().toISOString() }).eq("id", linha.id);
      } catch (e) {
        await ctx.admin.from("meeting_bots").update({ status: "erro", status_detail: e instanceof Error ? e.message : "Falha ao agendar.", updated_at: new Date().toISOString() }).eq("id", linha.id);
        throw e;
      }
      return json(req, { ok: true, id: linha.id });
    }

    if (action === "cancelar") {
      const id = txt(body.id, 64);
      const { data: r } = await ctx.admin.from("meeting_bots").select("id, provider_bot_id, status")
        .eq("id", id).eq("user_id", ctx.userId).maybeSingle();
      if (!r) throw new HttpError(404, "Robô não encontrado.");
      if (!ATIVOS.includes(r.status)) return json(req, { ok: true });
      if (r.provider_bot_id) await cancelarRobo(r.provider_bot_id, r.status !== "agendado");
      await ctx.admin.from("meeting_bots").update({ status: "cancelado", updated_at: new Date().toISOString() }).eq("id", r.id);
      return json(req, { ok: true });
    }

    throw new HttpError(400, "Ação desconhecida.");
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    if (e instanceof RecallError) return json(req, { error: e.message }, 502);
    console.error("meeting-bot:", e);
    return json(req, { error: "Erro inesperado." }, 500);
  }
});
