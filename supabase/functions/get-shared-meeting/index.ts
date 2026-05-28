import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: meeting, error: mErr } = await admin
      .from("meetings")
      .select("*")
      .eq("share_token", token)
      .maybeSingle();

    if (mErr || !meeting) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: analysis }, { data: transcription }, { data: highlights }, { data: seller }] = await Promise.all([
      admin.from("analysis_results").select("*").eq("meeting_id", meeting.id).maybeSingle(),
      admin.from("transcriptions").select("*").eq("meeting_id", meeting.id).maybeSingle(),
      admin.from("highlights").select("*").eq("meeting_id", meeting.id).order("timestamp_start", { ascending: true }),
      admin.from("profiles").select("full_name").eq("user_id", meeting.seller_id).maybeSingle(),
    ]);

    let mediaUrl: string | null = null;
    if (meeting.file_url) {
      const { data: signed } = await admin.storage
        .from("meeting-files")
        .createSignedUrl(meeting.file_url, 60 * 60 * 6);
      mediaUrl = signed?.signedUrl ?? null;
    }

    return new Response(
      JSON.stringify({ meeting, analysis, transcription, highlights: highlights ?? [], mediaUrl, seller }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("get-shared-meeting error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
