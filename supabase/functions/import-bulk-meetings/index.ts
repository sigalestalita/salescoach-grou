// Importação de várias gravações por link.
//
// Correção de rota: o arquivo importava `corsHeaders` de
// "https://esm.sh/@supabase/supabase-js@2/cors", que não existe — a função não
// carregava. Agora usa o módulo compartilhado.

import { json, preflight } from "../_shared/cors.ts";
import { assertQuota, getCaller, HttpError, writeAudit } from "../_shared/tenant.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const ctx = await getCaller(req);
    const { links, meeting_type, seller_id } = await req.json();

    if (!links || !Array.isArray(links) || links.length === 0) {
      return json(req, { error: "Nenhum link fornecido" }, 400);
    }

    await assertQuota(ctx.admin, ctx.orgId, "analise", links.length);

    // Importar em nome de outra pessoa exige papel de gestão, e o destinatário
    // precisa ser da mesma organização.
    let effectiveSellerId = ctx.userId;
    if (seller_id && seller_id !== ctx.userId) {
      if (ctx.role !== "admin" && ctx.role !== "gestor") {
        return json(req, { error: "Sem permissão para importar em nome de outro usuário" }, 403);
      }
      const { data: target } = await ctx.admin
        .from("profiles")
        .select("user_id")
        .eq("user_id", seller_id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
      if (!target) {
        return json(req, { error: "Usuário de destino não pertence a esta organização" }, 400);
      }
      effectiveSellerId = seller_id;
    }

    // Tipo de reunião: valida contra os tipos da organização; sem informação,
    // usa o primeiro tipo configurado.
    let effectiveType: string | null = null;
    const { data: orgTypes } = await ctx.admin
      .from("meeting_types")
      .select("key")
      .eq("org_id", ctx.orgId)
      .eq("is_active", true)
      .order("sort_order");

    const validKeys = (orgTypes ?? []).map((t: { key: string }) => t.key);
    if (meeting_type && validKeys.includes(meeting_type)) {
      effectiveType = meeting_type;
    } else if (validKeys.length > 0) {
      effectiveType = validKeys[0];
    }

    const results: {
      link: string;
      meeting_id?: string;
      title?: string;
      status: string;
      error?: string;
    }[] = [];

    for (const link of links) {
      const trimmed = (link as string).trim();
      if (!trimmed) continue;

      let title = "Gravação importada";
      const fileIdMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (fileIdMatch) {
        title = `Gravação ${fileIdMatch[1].substring(0, 8)}`;
      }

      try {
        const { data: meeting, error: insertError } = await ctx.admin
          .from("meetings")
          .insert({
            title,
            org_id: ctx.orgId,
            seller_id: effectiveSellerId,
            team_id: ctx.teamId,
            youtube_url: trimmed,
            meeting_type: effectiveType,
            status: "enviado",
          })
          .select("id, title")
          .single();

        if (insertError) throw insertError;

        const analyzeRes = await fetch(`${supabaseUrl}/functions/v1/analyze-meeting`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
          },
          body: JSON.stringify({ meetingId: meeting.id }),
        });

        if (!analyzeRes.ok) {
          const errText = await analyzeRes.text();
          console.error(`Analysis trigger failed for ${meeting.id}: ${errText}`);
          results.push({ link: trimmed, meeting_id: meeting.id, title: meeting.title, status: "created_no_analysis", error: errText });
        } else {
          results.push({ link: trimmed, meeting_id: meeting.id, title: meeting.title, status: "processing" });
        }
      } catch (err: any) {
        console.error(`Failed to process link ${trimmed}:`, err);
        results.push({ link: trimmed, status: "error", error: err.message });
      }
    }

    await writeAudit(ctx.admin, {
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: "meetings.bulk_import",
      entity: "meeting",
      metadata: { total: results.length, seller_id: effectiveSellerId },
    });

    return json(req, { success: true, results, total: results.length });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return json(req, { error: err.message, code: err.code }, err.status);
    }
    console.error("Bulk import error:", err);
    return json(req, { error: err.message }, 500);
  }
});
