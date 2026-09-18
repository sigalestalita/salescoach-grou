// Leitura pública de uma reunião compartilhada por link.
//
// O compartilhamento agora é explícito: só responde se a reunião estiver com
// share_enabled, dentro da validade e não revogada. Antes, qualquer reunião
// respondia — todas nascem com share_token — entregando transcrição integral e
// URL assinada da mídia a quem tivesse o link, sem prazo nem revogação.

import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { json, preflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return json(req, { error: "Missing token" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: meeting, error: mErr } = await admin
      .from("meetings")
      .select("*")
      .eq("share_token", token)
      .maybeSingle();

    if (mErr || !meeting) {
      return json(req, { error: "Not found" }, 404);
    }

    if (!meeting.share_enabled || meeting.share_revoked_at) {
      return json(req, { error: "Este link de compartilhamento não está ativo." }, 403);
    }

    if (meeting.share_expires_at && new Date(meeting.share_expires_at) < new Date()) {
      return json(req, { error: "Este link de compartilhamento expirou." }, 410);
    }

    // O compartilhamento externo pode ser desligado por organização.
    const { data: settings } = await admin
      .from("org_settings")
      .select("sharing_enabled")
      .eq("org_id", meeting.org_id)
      .maybeSingle();

    if (settings && settings.sharing_enabled === false) {
      return json(req, { error: "Compartilhamento externo desativado para esta conta." }, 403);
    }

    const { data: org } = await admin
      .from("organizations")
      .select("status")
      .eq("id", meeting.org_id)
      .maybeSingle();

    if (!org || org.status === "canceled" || org.status === "suspended") {
      return json(req, { error: "Conta inativa." }, 403);
    }

    const [{ data: analysis }, { data: transcription }, { data: highlights }, { data: seller }, { data: branding }] =
      await Promise.all([
        admin.from("analysis_results").select("*").eq("meeting_id", meeting.id).maybeSingle(),
        admin.from("transcriptions").select("*").eq("meeting_id", meeting.id).maybeSingle(),
        admin.from("highlights").select("*").eq("meeting_id", meeting.id).order("timestamp_start", { ascending: true }),
        admin.from("profiles").select("full_name").eq("user_id", meeting.seller_id).maybeSingle(),
        admin.from("organization_branding").select("product_name, logo_url, primary_hsl, primary_fg_hsl, accent_hsl, sidebar_hsl")
          .eq("org_id", meeting.org_id).maybeSingle(),
      ]);

    let mediaUrl: string | null = null;
    if (meeting.file_url) {
      const { data: signed } = await admin.storage
        .from("meeting-files")
        .createSignedUrl(meeting.file_url, 60 * 60 * 6);
      mediaUrl = signed?.signedUrl ?? null;
    } else if (meeting.youtube_url && /\.(mp4|webm|m4a|mp3|ogg)(\?.*)?$/i.test(meeting.youtube_url)) {
      // Link direto para o arquivo de mídia: toca no player da página pública.
      mediaUrl = meeting.youtube_url;
    }

    await admin.from("audit_log").insert({
      org_id: meeting.org_id,
      action: "meeting.shared_view",
      entity: "meeting",
      entity_id: meeting.id,
      metadata: { user_agent: req.headers.get("user-agent") ?? null },
    });

    return json(req, {
      meeting,
      analysis,
      transcription,
      highlights: highlights ?? [],
      mediaUrl,
      seller,
      branding,
    });
  } catch (e) {
    console.error("get-shared-meeting error", e);
    return json(req, { error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
