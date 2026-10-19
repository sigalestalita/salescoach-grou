// Envio do áudio em partes durante a reunião (extensão).
//
// Protege a reunião quando a aba ou o navegador fecham antes do envio da
// gravação principal. Ver _shared/recording-parts.ts.
//
// Com o token do vendedor dono da reunião:
//   POST ?meetingId=...&part=N, corpo application/octet-stream
//       → guarda a parte N (só com a reunião "ao_vivo")
//   POST { action: "finish", meetingId }
//       → junta as partes e manda o áudio para análise, se a gravação
//         principal não chegou. Pode ser chamado mais de uma vez: com a
//         reunião fora de "ao_vivo", só apaga as partes.

import { json, preflight } from "../_shared/cors.ts";
import { assertQuota, getCaller, HttpError } from "../_shared/tenant.ts";
import { BUCKET, concatParts, listParts, partName, partsPrefix, removeParts } from "../_shared/recording-parts.ts";

const MAX_PART_BYTES = 8 * 1024 * 1024;
// 5 horas em partes de 30 s.
const MAX_PARTS = 600;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const ctx = await getCaller(req);
    const url = new URL(req.url);
    const isPart = (req.headers.get("content-type") ?? "").includes("application/octet-stream");
    const body = isPart ? null : await req.json().catch(() => ({}));
    const meetingId = String((isPart ? url.searchParams.get("meetingId") : body?.meetingId) ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(meetingId)) throw new HttpError(400, "meetingId inválido");

    const { data: meeting } = await ctx.admin.from("meetings")
      .select("id, org_id, seller_id, status").eq("id", meetingId).maybeSingle();
    if (!meeting || meeting.org_id !== ctx.orgId || meeting.seller_id !== ctx.userId) {
      throw new HttpError(403, "Reunião não encontrada");
    }

    if (isPart) {
      const index = Number(url.searchParams.get("part"));
      if (!Number.isInteger(index) || index < 0 || index >= MAX_PARTS) throw new HttpError(400, "Parte inválida");
      if (meeting.status !== "ao_vivo") return json(req, { ok: true, skipped: true });
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (!bytes.byteLength) throw new HttpError(400, "Parte vazia");
      if (bytes.byteLength > MAX_PART_BYTES) throw new HttpError(413, "Parte grande demais");
      const { error } = await ctx.admin.storage.from(BUCKET)
        .upload(`${partsPrefix(ctx.userId, meetingId)}/${partName(index)}`, bytes, { contentType: "audio/webm", upsert: true });
      if (error) throw error;
      return json(req, { ok: true });
    }

    if (body?.action !== "finish") throw new HttpError(400, "Ação inválida");

    // A gravação principal já chegou (ou a reunião foi tratada): só limpa.
    if (meeting.status !== "ao_vivo") {
      await removeParts(ctx.admin, ctx.userId, meetingId);
      return json(req, { ok: true, skipped: true });
    }

    const names = await listParts(ctx.admin, ctx.userId, meetingId);
    if (!names.length) {
      await ctx.admin.from("meetings").update({
        status: "erro",
        error_message: "A aba da reunião foi fechada antes de a gravação ser enviada, e nenhum trecho chegou ao servidor.",
      }).eq("id", meetingId).eq("status", "ao_vivo");
      return json(req, { ok: true, empty: true });
    }

    await assertQuota(ctx.admin, ctx.orgId, "analise", 1);

    const parts: Uint8Array[] = [];
    for (const n of names) {
      const { data, error } = await ctx.admin.storage.from(BUCKET).download(`${partsPrefix(ctx.userId, meetingId)}/${n}`);
      if (error || !data) throw new Error(`Parte ${n} não baixou: ${error?.message ?? "vazia"}`);
      parts.push(new Uint8Array(await data.arrayBuffer()));
    }
    const fileName = `${ctx.userId}/${meetingId}-audio.webm`;
    const { error: upErr } = await ctx.admin.storage.from(BUCKET)
      .upload(fileName, concatParts(parts), { contentType: "audio/webm", upsert: true });
    if (upErr) throw upErr;

    // Só assume a reunião se ela ainda espera a gravação: se a principal
    // chegou enquanto isto rodava, ela vale.
    // Só o áudio chega por aqui: gravou_tela = false (sem a coluna no banco, segue sem ela).
    const assumir = (campos: Record<string, unknown>) => ctx.admin.from("meetings")
      .update({ file_url: fileName, file_type: "webm", status: "enviado", ...campos })
      .eq("id", meetingId).eq("status", "ao_vivo").select("id");
    let assumiu = await assumir({ gravou_tela: false });
    if (assumiu.error && /gravou_tela/.test(assumiu.error.message ?? "")) assumiu = await assumir({});
    const claimed = assumiu.data;
    if (!claimed?.length) {
      await ctx.admin.storage.from(BUCKET).remove([fileName]);
      await removeParts(ctx.admin, ctx.userId, meetingId);
      return json(req, { ok: true, skipped: true });
    }

    const analyze = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-meeting`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
      },
      body: JSON.stringify({ meetingId }),
    }).catch((e) => { console.error("recording-parts: análise não disparou", e); return null; });
    if (analyze && !analyze.ok) console.error("recording-parts: análise", analyze.status, await analyze.text());

    await removeParts(ctx.admin, ctx.userId, meetingId);
    return json(req, { ok: true, finished: true, parts: names.length });
  } catch (error) {
    if (error instanceof HttpError) return json(req, { error: error.message, code: error.code }, error.status);
    console.error("recording-parts error:", error);
    return json(req, { error: error instanceof Error ? error.message : "Erro desconhecido" }, 500);
  }
});
