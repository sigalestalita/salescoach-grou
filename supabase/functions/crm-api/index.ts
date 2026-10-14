// O que o app pede sobre o CRM conectado. Uma ação por chamada:
//
//   status            conexão, mapeamento e catálogo de dados (todos)
//   fields            campos do negócio no CRM (admin)
//   create_fields     cria no CRM os campos do Sales Coach e já mapeia (admin)
//   save_mapping      liga (ou desliga) um dado do Sales Coach a um campo (admin)
//   meeting           vínculo da reunião com o negócio e histórico de envios
//   settings          preferências de envio (admin)
//   disconnect        desliga o CRM e apaga os tokens (admin)
//   search_deals      busca negócio por nome (quem vê a reunião)
//   suggest_deals     negócios do e-mail do lead da reunião
//   link_deal         vincula a reunião a um negócio e envia
//   unlink_deal       desfaz o vínculo
//   send              envia (ou reenvia) a reunião agora

import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { json, preflight } from "../_shared/cors.ts";
import { ANON_KEY, CallerContext, getCaller, HttpError, requireRole, SUPABASE_URL } from "../_shared/tenant.ts";
import { loadTemplate } from "../_shared/analysis-template.ts";
import { activeConnection, connectorFor } from "../_shared/crm/connection.ts";
import { sourceCatalog } from "../_shared/crm/mapping.ts";
import { enqueueMeeting, processJob } from "../_shared/crm/sync.ts";
import { CrmError } from "../_shared/crm/types.ts";

/** Reunião que o usuário enxerga pela RLS (vendedor: as dele; gestão: as do escopo). */
async function visibleMeeting(req: Request, meetingId: string) {
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } },
  });
  const { data } = await userClient.from("meetings").select("id, org_id, lead_email, crm_provider, crm_deal_id").eq("id", meetingId).maybeSingle();
  if (!data) throw new HttpError(404, "Reunião não encontrada.");
  return data;
}

async function requireConnection(ctx: CallerContext) {
  const conn = await activeConnection(ctx.admin, ctx.orgId);
  if (!conn) throw new HttpError(409, "Nenhum CRM conectado. Um administrador conecta em Configurações.");
  return conn;
}

/** Tipo do campo a criar no CRM para cada dado do Sales Coach. */
const FIELD_TYPE: Record<string, "number" | "text" | "date" | "option" | "hyperlink"> = {
  number: "number", text: "text", date: "date", option: "option", url: "hyperlink",
};

async function sendNow(ctx: CallerContext, meetingId: string) {
  const jobId = await enqueueMeeting(ctx.admin, ctx.orgId, meetingId, { createdBy: ctx.userId, manual: true });
  if (!jobId) throw new HttpError(409, "Nenhum CRM conectado.");
  const { data: job } = await ctx.admin.from("crm_sync_jobs").select("*").eq("id", jobId).single();
  return processJob(ctx.admin, job);
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const ctx = await getCaller(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    switch (action) {
      case "status": {
        const { data: conn } = await ctx.admin.from("crm_connections")
          .select("id, provider, status, account_label, connected_at, last_error, settings")
          .eq("org_id", ctx.orgId).neq("status", "desconectado").maybeSingle();
        const { data: mappings } = await ctx.admin.from("crm_field_mappings").select("*").eq("org_id", ctx.orgId);
        const template = await loadTemplate(ctx.admin, ctx.orgId);
        return json(req, { connection: conn ?? null, mappings: mappings ?? [], catalog: sourceCatalog(template.qualification_criteria) });
      }

      case "fields": {
        requireRole(ctx, "admin");
        const crm = await connectorFor(ctx.admin, await requireConnection(ctx));
        return json(req, { fields: await crm.listDealFields() });
      }

      case "create_fields": {
        requireRole(ctx, "admin");
        const conn = await requireConnection(ctx);
        const crm = await connectorFor(ctx.admin, conn);
        const template = await loadTemplate(ctx.admin, ctx.orgId);
        const catalog = sourceCatalog(template.qualification_criteria);
        const wanted: string[] = Array.isArray(body.sources) ? body.sources : [];
        const existing = await crm.listDealFields();
        const created: string[] = [];
        for (const key of wanted) {
          const src = catalog.find((s) => s.key === key);
          if (!src) continue;
          const label = `Sales Coach · ${src.label.replace(/^Critério: /, "")}`;
          const options = src.key === "temperatura" ? template.temperature_levels.map((l) => l.label) : undefined;
          const field = existing.find((f) => f.label === label) ??
            await crm.createDealField(label, FIELD_TYPE[src.type], options);
          await ctx.admin.from("crm_field_mappings").upsert({
            org_id: ctx.orgId, provider: conn.provider, source_key: src.key, target_entity: "deal",
            target_field: field.key, target_label: field.label, target_type: field.type, target_options: field.options,
            mode: "sempre", updated_at: new Date().toISOString(),
          }, { onConflict: "org_id,provider,source_key" });
          created.push(field.label);
        }
        return json(req, { created });
      }

      case "save_mapping": {
        requireRole(ctx, "admin");
        const conn = await requireConnection(ctx);
        const template = await loadTemplate(ctx.admin, ctx.orgId);
        const sourceKey = String(body.source_key ?? "");
        if (!sourceCatalog(template.qualification_criteria).some((s) => s.key === sourceKey)) {
          throw new HttpError(400, "Dado desconhecido.");
        }
        if (!body.target_field) {
          await ctx.admin.from("crm_field_mappings").delete()
            .eq("org_id", ctx.orgId).eq("provider", conn.provider).eq("source_key", sourceKey);
          return json(req, { ok: true });
        }
        // O tipo e as opções vêm do próprio CRM, não do navegador.
        const crm = await connectorFor(ctx.admin, conn);
        const field = (await crm.listDealFields()).find((f) => f.key === String(body.target_field));
        if (!field) throw new HttpError(404, "Campo não encontrado no CRM.");
        await ctx.admin.from("crm_field_mappings").upsert({
          org_id: ctx.orgId, provider: conn.provider, source_key: sourceKey, target_entity: "deal",
          target_field: field.key, target_label: field.label, target_type: field.type, target_options: field.options,
          mode: body.mode === "sempre" ? "sempre" : "se_vazio", updated_at: new Date().toISOString(),
        }, { onConflict: "org_id,provider,source_key" });
        return json(req, { ok: true });
      }

      case "meeting": {
        const meeting = await visibleMeeting(req, String(body.meetingId));
        const conn = await activeConnection(ctx.admin, ctx.orgId);
        const { data: full } = await ctx.admin.from("meetings")
          .select("crm_provider, crm_deal_id, crm_deal_name, crm_linked_at").eq("id", meeting.id).single();
        const { data: jobs } = await ctx.admin.from("crm_sync_jobs")
          .select("id, status, attempts, deal_id, last_error, sent, created_at, updated_at")
          .eq("meeting_id", meeting.id).order("created_at", { ascending: false }).limit(10);
        return json(req, {
          connection: conn ? { provider: conn.provider, status: conn.status, account_label: conn.account_label } : null,
          link: full?.crm_deal_id ? { provider: full.crm_provider, id: full.crm_deal_id, name: full.crm_deal_name, at: full.crm_linked_at } : null,
          lead_email: meeting.lead_email ?? null,
          jobs: jobs ?? [],
        });
      }

      case "settings": {
        requireRole(ctx, "admin");
        const conn = await requireConnection(ctx);
        const s = body.settings ?? {};
        const settings = {
          ...conn.settings,
          ...(typeof s.criar_anotacao === "boolean" ? { criar_anotacao: s.criar_anotacao } : {}),
          ...(typeof s.criar_tarefa === "boolean" ? { criar_tarefa: s.criar_tarefa } : {}),
          ...(typeof s.envio_automatico === "boolean" ? { envio_automatico: s.envio_automatico } : {}),
          ...(Number.isInteger(s.dias_tarefa) && s.dias_tarefa >= 0 && s.dias_tarefa <= 30 ? { dias_tarefa: s.dias_tarefa } : {}),
        };
        await ctx.admin.from("crm_connections").update({ settings, updated_at: new Date().toISOString() }).eq("id", conn.id);
        return json(req, { settings });
      }

      case "disconnect": {
        requireRole(ctx, "admin");
        const conn = await requireConnection(ctx);
        await ctx.admin.from("crm_credentials").delete().eq("connection_id", conn.id);
        await ctx.admin.from("crm_connections").update({ status: "desconectado", updated_at: new Date().toISOString() }).eq("id", conn.id);
        await ctx.admin.from("audit_log").insert({
          org_id: ctx.orgId, actor_user_id: ctx.userId, action: "crm_desconectado", entity: "crm_connections", entity_id: conn.id,
        }).then(() => {}, () => {});
        return json(req, { ok: true });
      }

      case "search_deals": {
        const term = String(body.term ?? "").trim();
        if (term.length < 2) return json(req, { deals: [] });
        const crm = await connectorFor(ctx.admin, await requireConnection(ctx));
        const deals = await crm.searchDeals(term);
        return json(req, { deals: deals.map(({ id, name, status }) => ({ id, name, status })) });
      }

      case "suggest_deals": {
        const meeting = await visibleMeeting(req, String(body.meetingId));
        if (!meeting.lead_email) return json(req, { deals: [] });
        const crm = await connectorFor(ctx.admin, await requireConnection(ctx));
        const deals = await crm.dealsForEmail(meeting.lead_email);
        return json(req, { deals: deals.map(({ id, name, status }) => ({ id, name, status })) });
      }

      case "link_deal": {
        const meeting = await visibleMeeting(req, String(body.meetingId));
        const conn = await requireConnection(ctx);
        const crm = await connectorFor(ctx.admin, conn);
        const deal = await crm.getDeal(String(body.dealId)); // confirma que existe nesta conta
        await ctx.admin.from("meetings").update({
          crm_provider: conn.provider, crm_deal_id: deal.id, crm_deal_name: deal.name,
          crm_linked_by: ctx.userId, crm_linked_at: new Date().toISOString(),
        }).eq("id", meeting.id).eq("org_id", ctx.orgId);
        const result = body.send === false ? null : await sendNow(ctx, meeting.id);
        return json(req, { deal: { id: deal.id, name: deal.name }, result });
      }

      case "unlink_deal": {
        const meeting = await visibleMeeting(req, String(body.meetingId));
        await ctx.admin.from("meetings").update({
          crm_provider: null, crm_deal_id: null, crm_deal_name: null, crm_linked_by: null, crm_linked_at: null,
        }).eq("id", meeting.id).eq("org_id", ctx.orgId);
        return json(req, { ok: true });
      }

      case "send": {
        const meeting = await visibleMeeting(req, String(body.meetingId));
        return json(req, { result: await sendNow(ctx, meeting.id) });
      }

      default:
        throw new HttpError(400, "Ação desconhecida.");
    }
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message }, e.status);
    if (e instanceof CrmError) return json(req, { error: e.message }, e.kind === "auth" ? 409 : e.kind === "not_found" ? 404 : 502);
    console.error("crm-api:", e);
    return json(req, { error: "Erro inesperado na integração com o CRM." }, 500);
  }
});
