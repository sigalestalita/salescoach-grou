// Fila de envio ao CRM: põe a reunião na fila e processa cada envio.
//
// Um envio tem até três passos (campos, anotação, tarefa). O que já deu certo
// fica em `sent.etapas`, para que uma nova tentativa não duplique anotação nem
// tarefa no CRM do cliente.

import { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { loadTemplate } from "../analysis-template.ts";
import { activeConnection, ConnectionRow, connectorFor, refreshConnection } from "./connection.ts";
import { buildFieldUpdate, buildNote, buildTask, FieldMapping, sourceValues, SourceContext } from "./mapping.ts";
import { CrmConnector, CrmDeal, CrmError } from "./types.ts";

export const MAX_ATTEMPTS = 5;

export interface JobRow {
  id: string;
  org_id: string;
  meeting_id: string;
  provider: string;
  status: string;
  attempts: number;
  deal_id: string | null;
  sent: Record<string, unknown> | null;
}

/** Põe a reunião na fila do CRM conectado. Sem conexão ativa, não faz nada. */
export async function enqueueMeeting(
  admin: SupabaseClient,
  orgId: string,
  meetingId: string,
  opts: { createdBy?: string | null; manual?: boolean } = {},
): Promise<string | null> {
  const conn = await activeConnection(admin, orgId);
  if (!conn || conn.status === "desconectado") return null;
  if (!opts.manual && conn.settings?.envio_automatico === false) return null;

  // Um envio em aberto por reunião é reaproveitado: ele guarda as etapas já
  // feitas, e continuar dali não duplica anotação nem tarefa. Um envio já
  // concluído não é reaberto; mandar de novo cria outro, de propósito.
  const { data: open } = await admin
    .from("crm_sync_jobs")
    .select("id, status")
    .eq("meeting_id", meetingId)
    .in("status", ["pendente", "enviando", "aguardando_vinculo", "erro"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) {
    if (opts.manual && open.status !== "enviando") {
      await admin.from("crm_sync_jobs")
        .update({ status: "pendente", attempts: 0, next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", open.id);
    }
    return open.id;
  }

  const { data, error } = await admin
    .from("crm_sync_jobs")
    .insert({ org_id: orgId, meeting_id: meetingId, provider: conn.provider, created_by: opts.createdBy ?? null })
    .select("id")
    .single();
  if (error) throw new Error(`Não foi possível pôr a reunião na fila do CRM: ${error.message}`);
  return data.id;
}

const appUrl = () => (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function withAuthRetry<T>(admin: SupabaseClient, conn: ConnectionRow, run: (c: CrmConnector) => Promise<T>): Promise<T> {
  try {
    return await run(await connectorFor(admin, conn));
  } catch (e) {
    // Token revogado antes de expirar: renova uma vez e tenta de novo.
    if (e instanceof CrmError && e.kind === "auth") {
      await refreshConnection(admin, conn);
      return run(await connectorFor(admin, conn));
    }
    throw e;
  }
}

/** Escolhe o negócio: o vinculado na reunião; senão, o único aberto do e-mail do lead. */
async function resolveDeal(
  admin: SupabaseClient,
  crm: CrmConnector,
  meeting: Record<string, unknown>,
  provider: string,
  fieldKeys: string[],
): Promise<{ deal: CrmDeal | null; reason?: string }> {
  if (meeting.crm_deal_id && meeting.crm_provider === provider) {
    return { deal: await crm.getDeal(String(meeting.crm_deal_id), fieldKeys) };
  }
  const email = String(meeting.lead_email ?? "").trim();
  if (!email) return { deal: null, reason: "A reunião não tem e-mail do lead. Escolha o negócio do CRM na reunião." };

  const deals = await crm.dealsForEmail(email);
  const abertos = deals.filter((d) => !d.status || d.status === "ongoing");
  if (abertos.length === 1) {
    const d = abertos[0];
    await admin.from("meetings").update({
      crm_provider: provider, crm_deal_id: d.id, crm_deal_name: d.name, crm_linked_at: new Date().toISOString(),
    }).eq("id", meeting.id);
    return { deal: await crm.getDeal(d.id, fieldKeys) };
  }
  if (!abertos.length) return { deal: null, reason: `Nenhum negócio aberto no CRM para ${email}. Escolha o negócio na reunião.` };
  return { deal: null, reason: `${abertos.length} negócios abertos para ${email}. Escolha o certo na reunião.` };
}

export interface JobResult {
  status: "enviado" | "erro" | "pendente" | "aguardando_vinculo";
  message?: string;
}

/** Processa um envio. Nunca lança: o resultado fica gravado no próprio envio. */
export async function processJob(admin: SupabaseClient, job: JobRow): Promise<JobResult> {
  const now = new Date().toISOString();
  // Trava otimista: só segue quem conseguir passar o envio para "enviando".
  const { data: claimed } = await admin
    .from("crm_sync_jobs")
    .update({ status: "enviando", attempts: job.attempts + 1, updated_at: now })
    .eq("id", job.id)
    .in("status", ["pendente", "erro", "aguardando_vinculo"])
    .select("id")
    .maybeSingle();
  if (!claimed) return { status: "pendente", message: "Envio já em andamento." };

  const done = ((job.sent?.etapas as string[]) ?? []).slice();
  const sent: Record<string, unknown> = { ...(job.sent ?? {}), etapas: done };
  // Grava o progresso a cada etapa: se a função cair no meio, a retomada sabe
  // o que já foi feito no CRM.
  const progress = () =>
    admin.from("crm_sync_jobs").update({ sent, updated_at: new Date().toISOString() }).eq("id", job.id);
  const finish = async (status: JobResult["status"], extra: Record<string, unknown> = {}) => {
    await admin.from("crm_sync_jobs").update({ status, sent, updated_at: new Date().toISOString(), ...extra }).eq("id", job.id);
  };

  try {
    const conn = await activeConnection(admin, job.org_id);
    if (!conn || conn.provider !== job.provider) throw new CrmError("O CRM desta organização foi desconectado.", "auth");

    const { data: meeting } = await admin.from("meetings").select("*").eq("id", job.meeting_id).eq("org_id", job.org_id).maybeSingle();
    if (!meeting) throw new CrmError("Reunião não encontrada.", "not_found");
    const { data: analysis } = await admin
      .from("analysis_results").select("*").eq("meeting_id", job.meeting_id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!analysis) throw new CrmError("A reunião ainda não tem análise.", "invalid");

    const [template, { data: mappings }] = await Promise.all([
      loadTemplate(admin, job.org_id, meeting.meeting_type ?? null),
      admin.from("crm_field_mappings").select("*").eq("org_id", job.org_id).eq("provider", job.provider),
    ]);

    const ctx: SourceContext = {
      analysis,
      meeting,
      criteria: template.qualification_criteria,
      temperatureLevels: template.temperature_levels,
      analysisUrl: appUrl() ? `${appUrl()}/agendas/${meeting.id}` : null,
    };

    return await withAuthRetry(admin, conn, async (crm) => {
      const fieldKeys = ((mappings ?? []) as FieldMapping[]).map((m) => m.target_field);
      const { deal, reason } = await resolveDeal(admin, crm, meeting, job.provider, fieldKeys);
      if (!deal) {
        await finish("aguardando_vinculo", { last_error: reason, next_attempt_at: now });
        return { status: "aguardando_vinculo" as const, message: reason };
      }
      sent.deal = { id: deal.id, name: deal.name };

      if (!done.includes("campos")) {
        const update = buildFieldUpdate((mappings ?? []) as FieldMapping[], sourceValues(ctx), deal.fields);
        await crm.updateDealFields(deal.id, update.fields);
        sent.campos = update.fields;
        sent.ignorados = update.skipped;
        done.push("campos");
        await progress();
      }
      if (!done.includes("anotacao") && conn.settings?.criar_anotacao !== false) {
        await crm.createNote(deal.id, buildNote({ ...ctx, methodologyLabel: template.methodology_label }));
        done.push("anotacao");
        await progress();
      }
      if (!done.includes("tarefa") && conn.settings?.criar_tarefa !== false) {
        const task = buildTask(ctx, today(), conn.settings?.dias_tarefa ?? 2);
        if (task) {
          await crm.createTask(deal.id, task);
          sent.tarefa = { nome: task.name, vencimento: task.dueDate };
        }
        done.push("tarefa");
      }
      await finish("enviado", { deal_id: deal.id, last_error: null });
      return { status: "enviado" as const };
    });
  } catch (e) {
    const err = e instanceof CrmError ? e : new CrmError(e instanceof Error ? e.message : String(e), "server");
    const attempts = job.attempts + 1;
    const giveUp = err.kind === "auth" || err.kind === "not_found" || attempts >= MAX_ATTEMPTS;
    const waitSec = err.kind === "rate" ? (err.retryAfterSeconds ?? 60) : Math.min(2 ** attempts * 60, 6 * 3600);
    await finish(giveUp ? "erro" : "pendente", {
      last_error: err.message,
      next_attempt_at: new Date(Date.now() + waitSec * 1000).toISOString(),
    });
    return { status: giveUp ? "erro" : "pendente", message: err.message };
  }
}
