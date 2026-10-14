// Fila de envio ao CRM. Só aceita chamada interna.
//
// POST { meetingId }  — chamado pela analyze-meeting quando a análise termina:
//                       põe a reunião na fila e envia na hora.
// POST {}             — chamado pelo agendador (a cada 10 minutos): envia o
//                       que está pendente e renova os tokens parados há mais de
//                       7 dias (o refresh token do RD Station morre com 14 dias
//                       sem uso, e a conexão cairia num cliente que passa duas
//                       semanas sem reunião).

import { json, preflight } from "../_shared/cors.ts";
import { adminClient, isInternalCall } from "../_shared/tenant.ts";
import { ConnectionRow, refreshConnection } from "../_shared/crm/connection.ts";
import { enqueueMeeting, JobRow, processJob } from "../_shared/crm/sync.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (!isInternalCall(req)) return json(req, { error: "Não autorizado" }, 401);

  const admin = adminClient();
  const body = await req.json().catch(() => ({}));

  if (body.meetingId) {
    const { data: meeting } = await admin.from("meetings").select("id, org_id, status").eq("id", body.meetingId).maybeSingle();
    if (!meeting || meeting.status !== "completo") return json(req, { skipped: true });
    const jobId = await enqueueMeeting(admin, meeting.org_id, meeting.id);
    if (!jobId) return json(req, { skipped: true });
    const { data: job } = await admin.from("crm_sync_jobs").select("*").eq("id", jobId).single();
    return json(req, { result: await processJob(admin, job as JobRow) });
  }

  // Envio que caiu no meio (função encerrada) fica preso em "enviando": depois
  // de 15 minutos volta para a fila. As etapas feitas não se repetem.
  await admin.from("crm_sync_jobs")
    .update({ status: "pendente", updated_at: new Date().toISOString() })
    .eq("status", "enviando")
    .lt("updated_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());

  // Pendentes vencidos, os mais antigos primeiro.
  const { data: due } = await admin
    .from("crm_sync_jobs")
    .select("*")
    .eq("status", "pendente")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(20);
  const results = [];
  for (const job of (due ?? []) as JobRow[]) {
    results.push({ id: job.id, ...(await processJob(admin, job)) });
  }

  // Manutenção dos tokens.
  const limite = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: stale } = await admin
    .from("crm_credentials")
    .select("connection_id, refresh_token_enc, crm_connections!inner(id, org_id, provider, status, account_label, settings)")
    .lt("refreshed_at", limite)
    .limit(50);
  let renovadas = 0;
  for (const row of stale ?? []) {
    const conn = (row as unknown as { crm_connections: ConnectionRow }).crm_connections;
    // Token de longa duração (Kommo) não tem refresh: nada a renovar.
    if (conn.status === "desconectado" || !(row as { refresh_token_enc?: string | null }).refresh_token_enc) continue;
    try {
      await refreshConnection(admin, conn);
      renovadas++;
    } catch (e) {
      console.error("crm-sync: renovação falhou", conn.id, e);
    }
  }

  return json(req, { enviados: results, renovadas });
});
