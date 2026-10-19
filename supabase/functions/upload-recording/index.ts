import { json, preflight } from "../_shared/cors.ts";
import { assertQuota, getCaller, HttpError } from "../_shared/tenant.ts";
import { removeParts } from "../_shared/recording-parts.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const ctx = await getCaller(req);
    const user = { id: ctx.userId };
    const orgId = ctx.orgId;
    await assertQuota(ctx.admin, orgId, "analise", 1);

    // Dois jeitos de chegar:
    // - JSON { path, ... }: a extensão (1.10.3+) já subiu o arquivo direto no
    //   Storage (upload retomável) e só registra a reunião. Vídeos longos não
    //   passam pela memória da função (antes estouravam: status 546).
    // - multipart com "file": versões antigas da extensão.
    const isJson = (req.headers.get("content-type") ?? "").includes("application/json");
    const body: Record<string, unknown> = isJson ? await req.json().catch(() => ({})) : {};
    const formData = isJson ? null : await req.formData();
    const campo = (k: string): string | null => {
      const v = isJson ? body[k] : formData!.get(k);
      return typeof v === "string" ? v : null;
    };
    const file = formData ? formData.get("file") as File | null : null;
    const pathEnviado = isJson ? campo("path") : null;
    const title = campo("title") || "Gravação via Extensão";
    // Tipo de reunião é configurado por organização; sem indicação, usa o
    // primeiro tipo ativo da própria organização.
    let meetingType = campo("meeting_type") || null;
    {
      const { data: orgTypes } = await ctx.admin
        .from("meeting_types")
        .select("key")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("sort_order");
      const validKeys = (orgTypes ?? []).map((t: { key: string }) => t.key);
      if (!meetingType || !validKeys.includes(meetingType)) {
        meetingType = validKeys[0] ?? null;
      }
    }
    const leadName = campo("lead_name") || null;
    const leadCompany = campo("lead_company") || null;
    const leadEmail = campo("lead_email") || null;
    const existingMeetingId = campo("meeting_id") || null;
    // Vindos da agenda do vendedor, quando conectada (extensão).
    const meetingUrl = (campo("meeting_url") || "").slice(0, 2000) || null;
    const calendarEventId = (campo("calendar_event_id") || "").slice(0, 300) || null;
    let attendees: unknown = null;
    try {
      const raw = campo("attendees");
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        attendees = parsed.slice(0, 30).filter((a) => a && typeof a.email === "string").map((a) => ({
          name: typeof a.name === "string" ? a.name.slice(0, 200) : null,
          email: a.email.slice(0, 320),
          externo: !!a.externo,
        }));
      }
    } catch { /* participantes são opcionais */ }

    const telaCampo = campo("tela");
    const adminClient = ctx.admin;
    let fileName: string;
    let gravouTela: boolean | null;

    if (pathEnviado !== null) {
      // O arquivo tem de estar na pasta do próprio vendedor e existir.
      const partes = pathEnviado.split("/");
      if (partes.length !== 2 || partes[0] !== user.id || !/^[\w.-]{1,200}$/.test(partes[1])) {
        return json(req, { error: "Caminho de arquivo inválido" }, 400);
      }
      const { data: achados } = await adminClient.storage.from("meeting-files").list(user.id, { search: partes[1], limit: 5 });
      if (!achados?.some((o: { name: string }) => o.name === partes[1])) {
        return json(req, { error: "Arquivo não encontrado no armazenamento" }, 400);
      }
      fileName = pathEnviado;
      gravouTela = telaCampo === "1" ? true : telaCampo === "0" ? false : null;
    } else {
      if (!file) {
        return json(req, { error: "No file provided" }, 400);
      }
      // "1"/"0" vindo da extensão; sem o campo, decide pelo tipo do arquivo.
      gravouTela = telaCampo === "1" ? true : telaCampo === "0" ? false
        : file.type ? file.type.startsWith("video/") : null;

      // Upload file to storage
      fileName = `${user.id}/${Date.now()}-${file.name}`;
      const fileBuffer = await file.arrayBuffer();

      const { error: uploadError } = await adminClient.storage
        .from("meeting-files")
        .upload(fileName, fileBuffer, {
          contentType: file.type || "video/webm",
          upsert: false,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return json(req, { error: "Failed to upload file" }, 500);
      }
    }

    const profile = { team_id: ctx.teamId };

    // Create OR update meeting record (when extension pre-created it for live mode)
    // gravou_tela vai à parte: se a migração ainda não chegou ao banco, a
    // reunião é gravada sem ela (nunca perder a gravação por um campo extra).
    const extra = gravouTela === null ? {} : { gravou_tela: gravouTela };
    const salvar = async (comExtra: boolean) => {
      const campos = comExtra ? extra : {};
      if (existingMeetingId) {
        return await adminClient
          .from("meetings")
          .update({ file_url: fileName, file_type: "webm", status: "enviado", ...campos })
          .eq("id", existingMeetingId)
          .eq("seller_id", user.id)
          .eq("org_id", orgId)
          .select("id")
          .single();
      }
      return await adminClient
        .from("meetings")
        .insert({
          title,
          org_id: orgId,
          seller_id: user.id,
          team_id: profile?.team_id || null,
          meeting_type: meetingType,
          lead_name: leadName,
          lead_company: leadCompany,
          lead_email: leadEmail,
          meeting_url: meetingUrl,
          calendar_event_id: calendarEventId,
          attendees,
          file_url: fileName,
          file_type: "webm",
          status: "enviado",
          meeting_date: new Date().toISOString(),
          ...campos,
        })
        .select("id")
        .single();
    };
    let res = await salvar(true);
    if (res.error && /gravou_tela/.test(res.error.message ?? "")) {
      console.warn("upload-recording: coluna gravou_tela ausente; salvando sem ela.");
      res = await salvar(false);
    }
    const meeting: { id: string } | null = res.data;
    const meetingError: unknown = res.error;

    if (meetingError || !meeting) {
      console.error("Meeting creation error:", meetingError);
      return json(req, { error: "Failed to create meeting" }, 500);
    }

    // A gravação principal chegou: a cópia do áudio em partes não é mais
    // necessária (ver recording-parts).
    if (existingMeetingId) await removeParts(adminClient, user.id, meeting.id);

    // Dispara o pipeline de análise como chamada interna.
    try {
      const analyzeRes = await fetch(`${supabaseUrl}/functions/v1/analyze-meeting`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
        },
        body: JSON.stringify({ meetingId: meeting.id }),
      });

      if (!analyzeRes.ok) {
        console.error("Failed to trigger analysis:", await analyzeRes.text());
      }
    } catch (err) {
      console.error("Error triggering analysis:", err);
    }

    return json(req, {
      success: true,
      meetingId: meeting.id,
      message: "Recording uploaded successfully. Analysis will start automatically.",
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return json(req, { error: error.message, code: error.code }, error.status);
    }
    console.error("upload-recording error:", error);
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
