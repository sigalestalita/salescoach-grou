// Robô de reunião (protótipo): o vendedor manda o robô da Recall para uma
// reunião da agenda, em vez de gravar pela extensão.
//
// POST com o token do usuário:
//   { action: "listar", from, to }   robôs do vendedor no período e se o robô está ativo
//   { action: "enviar", eventId, meetingUrl, title, start, lead, attendees, meetingType? }
//   { action: "cancelar", id }       tira da agenda ou faz o robô sair da chamada
//   { action: "pular", eventId, meetingUrl, title, start }
//                                    "não gravar esta reunião" (exceção do modo automático)
//   { action: "modo", modo }         robô automático: desligado | clientes | todas
// POST do agendador (pg_cron), com x-cron-secret = ROBO_CRON_SECRET e { action: "cron" }:
//   agenda, remarca ou tira os robôs automáticos das próximas 24 horas.
//
// A gravação pronta chega pela função meeting-bot-webhook.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { json, preflight } from "../_shared/cors.ts";
import { adminClient, assertQuota, getCaller, HttpError, isInternalCall } from "../_shared/tenant.ts";
import { cancelarRobo, criarRobo, plataformaDe, recallAtivo, RecallError } from "../_shared/recall.ts";
import { agendaEvents } from "../_shared/calendar.ts";
import { Acao, JANELA_HORAS, ModoRobo, MODOS_ROBO, planejar, RoboExistente } from "../_shared/robo.ts";

const ATIVOS = ["agendado", "entrando", "sala_de_espera", "na_chamada", "gravando", "processando"];
const ORGS_ATIVAS = ["trial", "active", "past_due"];
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;
const agoraIso = () => new Date().toISOString();

interface Dono { orgId: string; userId: string; primeiroNome: string }
interface DadosReuniao {
  eventId: string | null; meetingUrl: string; title: string | null; inicio: Date | null;
  lead?: { name?: unknown; email?: unknown }; leadCompany?: unknown; attendees?: unknown[] | null; meetingType?: unknown;
}

const nomeDoRobo = (primeiro: string) => (primeiro ? `Sales Coach · gravando para ${primeiro}` : "Sales Coach · gravando");

async function primeiroNome(admin: SupabaseClient, userId: string, email?: string | null): Promise<string> {
  const { data: perfil } = await admin.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
  return String(perfil?.full_name ?? email ?? "").trim().split(/[\s@]+/)[0];
}

/** Grava a linha em meeting_bots e agenda o robô na Recall. */
async function agendar(admin: SupabaseClient, dono: Dono, d: DadosReuniao, automatico: boolean): Promise<string> {
  const lead = d.lead ?? {};
  const { data: linha, error: errIns } = await admin.from("meeting_bots").insert({
    org_id: dono.orgId, user_id: dono.userId, calendar_event_id: d.eventId, meeting_url: d.meetingUrl,
    title: d.title, start_at: d.inicio ? d.inicio.toISOString() : agoraIso(),
    meeting_type: txt(d.meetingType, 80), lead_name: txt(lead.name, 200), lead_email: txt(lead.email, 200),
    lead_company: txt(d.leadCompany, 200), attendees: d.attendees ?? null, automatico,
  }).select("id").single();
  if (errIns || !linha) throw errIns ?? new Error("meeting_bots: insert");

  try {
    const bot = await criarRobo({
      meetingUrl: d.meetingUrl, nome: nomeDoRobo(dono.primeiroNome), inicio: d.inicio,
      metadata: { bot_row: linha.id, org_id: dono.orgId, user_id: dono.userId },
    });
    await admin.from("meeting_bots").update({ provider_bot_id: bot.id, updated_at: agoraIso() }).eq("id", linha.id);
  } catch (e) {
    await admin.from("meeting_bots").update({ status: "erro", status_detail: e instanceof Error ? e.message : "Falha ao agendar.", updated_at: agoraIso() }).eq("id", linha.id);
    throw e;
  }
  return linha.id;
}

/** Tira o robô da Recall sem travar quando ele já não existe lá. */
async function desmarcar(providerBotId: string | null) {
  if (!providerBotId) return;
  try { await cancelarRobo(providerBotId, false); } catch (e) {
    if (!(e instanceof RecallError && e.status === 404)) throw e;
  }
}

/**
 * Aplica o modo automático na agenda de um vendedor (próximas 24 horas).
 * Robô automático tirado pelo sistema some da tabela, para voltar se a reunião
 * voltar a valer; o do vendedor fica cancelado, com o motivo.
 */
async function aplicarModo(admin: SupabaseClient, dono: Omit<Dono, "primeiroNome">, modo: ModoRobo) {
  const agora = new Date(), fim = new Date(agora.getTime() + JANELA_HORAS * 3600_000);
  const itens = await agendaEvents(admin, dono.userId, null, new Date(agora.getTime() - 30 * 60_000), fim);
  const res = { criados: 0, remarcados: 0, tirados: 0, falhas: 0 };
  if (!itens) return res;

  const { data: robos } = await admin.from("meeting_bots")
    .select("id, calendar_event_id, meeting_url, start_at, status, automatico, provider_bot_id")
    .eq("user_id", dono.userId)
    .gte("start_at", new Date(agora.getTime() - 2 * 86400_000).toISOString())
    .lte("start_at", new Date(fim.getTime() + 2 * 86400_000).toISOString())
    .order("created_at", { ascending: false }).limit(500);
  const eventos = itens.map((e) => ({
    id: e.id, title: e.title, start: e.start, end: e.end, joinUrl: e.joinUrl, declined: e.declined, externo: e.externo, gravada: !!e.meeting,
  }));
  const acoes: Acao[] = planejar(eventos, (robos ?? []) as RoboExistente[], modo, agora, fim);
  if (!acoes.length) return res;

  const nome = await primeiroNome(admin, dono.userId);
  const porId = new Map(itens.map((e) => [e.id, e]));
  for (const a of acoes) {
    try {
      if (a.tipo === "tirar") {
        await desmarcar(a.robo.provider_bot_id);
        if (a.robo.automatico) await admin.from("meeting_bots").delete().eq("id", a.robo.id);
        else await admin.from("meeting_bots").update({ status: "cancelado", status_detail: a.motivo, updated_at: agoraIso() }).eq("id", a.robo.id);
        res.tirados++;
      } else if (a.tipo === "remarcar") {
        await desmarcar(a.robo.provider_bot_id);
        const inicio = new Date(a.ev.start);
        const bot = await criarRobo({
          meetingUrl: a.ev.joinUrl!, nome: nomeDoRobo(nome), inicio,
          metadata: { bot_row: a.robo.id, org_id: dono.orgId, user_id: dono.userId },
        });
        await admin.from("meeting_bots").update({
          provider_bot_id: bot.id, meeting_url: a.ev.joinUrl, start_at: inicio.toISOString(), title: a.ev.title,
          status: "agendado", status_detail: null, updated_at: agoraIso(),
        }).eq("id", a.robo.id);
        res.remarcados++;
      } else {
        const ev = porId.get(a.ev.id)!;
        try {
          await assertQuota(admin, dono.orgId, "analise", 1);
        } catch (e) {
          // Fica registrado na reunião (e não tenta de novo a cada rodada).
          await admin.from("meeting_bots").insert({
            org_id: dono.orgId, user_id: dono.userId, calendar_event_id: ev.id, meeting_url: ev.joinUrl, title: ev.title,
            start_at: ev.start, automatico: true, status: "erro",
            status_detail: e instanceof HttpError ? e.message : "Não foi possível agendar o robô.",
          });
          res.falhas++;
          continue;
        }
        await agendar(admin, { ...dono, primeiroNome: nome }, {
          eventId: ev.id, meetingUrl: ev.joinUrl!, title: ev.title, inicio: new Date(ev.start),
          lead: ev.lead ?? undefined, attendees: ev.attendees,
        }, true);
        res.criados++;
      }
    } catch (e) {
      console.error("meeting-bot: robô automático", dono.userId, a.tipo, e);
      res.falhas++;
    }
  }
  return res;
}

function segredoDoAgendador(req: Request): boolean {
  const esperado = Deno.env.get("ROBO_CRON_SECRET");
  const recebido = req.headers.get("x-cron-secret");
  if (esperado && recebido && esperado.length === recebido.length) {
    let diff = 0;
    for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
    if (diff === 0) return true;
  }
  return isInternalCall(req);
}

/** Rodada do agendador: todos que ligaram o robô automático, em empresas ativas. */
async function rodadaAutomatica() {
  const admin = adminClient();
  const { data: prefs } = await admin.from("meeting_bot_prefs").select("user_id, org_id, modo").neq("modo", "desligado").limit(2000);
  const orgIds = [...new Set((prefs ?? []).map((p) => p.org_id))];
  const { data: orgs } = orgIds.length
    ? await admin.from("organizations").select("id, status, demo_ends_at").in("id", orgIds)
    : { data: [] };
  const ativas = new Set((orgs ?? [])
    .filter((o) => ORGS_ATIVAS.includes(o.status) && !(o.demo_ends_at && new Date(o.demo_ends_at) <= new Date()))
    .map((o) => o.id));
  const total = { pessoas: 0, criados: 0, remarcados: 0, tirados: 0, falhas: 0 };
  for (const p of prefs ?? []) {
    if (!ativas.has(p.org_id)) continue;
    total.pessoas++;
    try {
      const r = await aplicarModo(admin, { orgId: p.org_id, userId: p.user_id }, p.modo as ModoRobo);
      total.criados += r.criados; total.remarcados += r.remarcados; total.tirados += r.tirados; total.falhas += r.falhas;
    } catch (e) {
      // Agenda desconectada ou com o acesso expirado: segue para a próxima pessoa.
      console.error("meeting-bot: agenda de", p.user_id, e instanceof Error ? e.message : e);
      total.falhas++;
    }
  }
  return total;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const body = await req.clone().json().catch(() => ({}));
    if (body.action === "cron") {
      if (!segredoDoAgendador(req)) throw new HttpError(401, "Não autorizado.");
      if (!recallAtivo()) return json(req, { ok: true, ativo: false });
      return json(req, { ok: true, ...(await rodadaAutomatica()) });
    }

    const ctx = await getCaller(req);
    const action = body.action;

    if (action === "listar") {
      const from = new Date(String(body.from ?? "")), to = new Date(String(body.to ?? ""));
      if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) throw new HttpError(400, "Período inválido.");
      const { data, error } = await ctx.admin.from("meeting_bots")
        .select("id, calendar_event_id, meeting_url, title, start_at, status, status_detail, meeting_id, automatico, created_at")
        .eq("user_id", ctx.userId)
        .gte("start_at", new Date(from.getTime() - 86400_000).toISOString())
        .lte("start_at", new Date(to.getTime() + 86400_000).toISOString())
        .order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      const { data: pref } = await ctx.admin.from("meeting_bot_prefs").select("modo").eq("user_id", ctx.userId).maybeSingle();
      return json(req, { ativo: recallAtivo(), modo: pref?.modo ?? "desligado", robos: data ?? [] });
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

      const id = await agendar(ctx.admin, { orgId: ctx.orgId, userId: ctx.userId, primeiroNome: await primeiroNome(ctx.admin, ctx.userId, ctx.email) }, {
        eventId, meetingUrl, title: txt(body.title, 300), inicio,
        lead: body.lead && typeof body.lead === "object" ? body.lead : {}, leadCompany: body.leadCompany,
        attendees: Array.isArray(body.attendees) ? body.attendees.slice(0, 50) : null, meetingType: body.meetingType,
      }, false);
      return json(req, { ok: true, id });
    }

    if (action === "cancelar") {
      const id = txt(body.id, 64);
      const { data: r } = await ctx.admin.from("meeting_bots").select("id, provider_bot_id, status")
        .eq("id", id).eq("user_id", ctx.userId).maybeSingle();
      if (!r) throw new HttpError(404, "Robô não encontrado.");
      if (!ATIVOS.includes(r.status)) return json(req, { ok: true });
      if (r.provider_bot_id) await cancelarRobo(r.provider_bot_id, r.status !== "agendado");
      await ctx.admin.from("meeting_bots").update({ status: "cancelado", status_detail: "Você tirou o robô desta reunião.", updated_at: agoraIso() }).eq("id", r.id);
      return json(req, { ok: true });
    }

    if (action === "pular") {
      const eventId = txt(body.eventId, 300), meetingUrl = txt(body.meetingUrl, 2000);
      const inicio = body.start ? new Date(String(body.start)) : null;
      if (!eventId || !meetingUrl || !inicio || isNaN(inicio.getTime())) throw new HttpError(400, "Reunião inválida.");
      const { data: ja } = await ctx.admin.from("meeting_bots").select("id").eq("user_id", ctx.userId)
        .eq("calendar_event_id", eventId).in("status", ATIVOS).limit(1);
      if (ja?.length) throw new HttpError(409, "O robô já está marcado para esta reunião. Use Cancelar robô.");
      const { error } = await ctx.admin.from("meeting_bots").insert({
        org_id: ctx.orgId, user_id: ctx.userId, calendar_event_id: eventId, meeting_url: meetingUrl,
        title: txt(body.title, 300), start_at: inicio.toISOString(), automatico: true,
        status: "cancelado", status_detail: "Você tirou o robô desta reunião.",
      });
      if (error) throw error;
      return json(req, { ok: true });
    }

    if (action === "modo") {
      const modo = body.modo as ModoRobo;
      if (!MODOS_ROBO.includes(modo)) throw new HttpError(400, "Modo inválido.");
      const { error } = await ctx.admin.from("meeting_bot_prefs").upsert({
        user_id: ctx.userId, org_id: ctx.orgId, modo, updated_at: agoraIso(),
      }, { onConflict: "user_id" });
      if (error) throw error;
      // Aplica já nas próximas 24 horas, sem esperar o agendador.
      const r = await aplicarModo(ctx.admin, { orgId: ctx.orgId, userId: ctx.userId }, modo)
        .catch((e) => { console.error("meeting-bot: modo", e); return null; });
      return json(req, { ok: true, modo, aplicado: r });
    }

    throw new HttpError(400, "Ação desconhecida.");
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    if (e instanceof RecallError) return json(req, { error: e.message }, 502);
    console.error("meeting-bot:", e);
    return json(req, { error: "Erro inesperado." }, 500);
  }
});
