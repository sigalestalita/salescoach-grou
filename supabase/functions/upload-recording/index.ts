import { json, preflight } from "../_shared/cors.ts";
import { assertQuota, getCaller, HttpError } from "../_shared/tenant.ts";

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

    // Parse multipart form
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || "Gravação via Extensão";
    // Tipo de reunião é configurado por organização; sem indicação, usa o
    // primeiro tipo ativo da própria organização.
    let meetingType = (formData.get("meeting_type") as string) || null;
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
    const leadName = (formData.get("lead_name") as string) || null;
    const leadCompany = (formData.get("lead_company") as string) || null;
    const leadEmail = (formData.get("lead_email") as string) || null;
    const existingMeetingId = (formData.get("meeting_id") as string) || null;

    if (!file) {
      return json(req, { error: "No file provided" }, 400);
    }

    const adminClient = ctx.admin;

    // Upload file to storage
    const fileName = `${user.id}/${Date.now()}-${file.name}`;
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

    const profile = { team_id: ctx.teamId };

    // Create OR update meeting record (when extension pre-created it for live mode)
    let meeting: { id: string } | null = null;
    let meetingError: unknown = null;
    if (existingMeetingId) {
      const upd = await adminClient
        .from("meetings")
        .update({
          file_url: fileName,
          file_type: "webm",
          status: "enviado",
        })
        .eq("id", existingMeetingId)
        .eq("seller_id", user.id)
        .eq("org_id", orgId)
        .select("id")
        .single();
      meeting = upd.data;
      meetingError = upd.error;
    } else {
      const ins = await adminClient
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
          file_url: fileName,
          file_type: "webm",
          status: "enviado",
          meeting_date: new Date().toISOString(),
        })
        .select("id")
        .single();
      meeting = ins.data;
      meetingError = ins.error;
    }

    if (meetingError || !meeting) {
      console.error("Meeting creation error:", meetingError);
      return json(req, { error: "Failed to create meeting" }, 500);
    }

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
