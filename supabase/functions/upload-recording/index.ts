import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate user JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse multipart form
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || "Gravação via Extensão";
    const meetingType = (formData.get("meeting_type") as string) || "empresa";
    const leadName = (formData.get("lead_name") as string) || null;
    const leadCompany = (formData.get("lead_company") as string) || null;
    const leadEmail = (formData.get("lead_email") as string) || null;

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

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
      return new Response(JSON.stringify({ error: "Failed to upload file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's team_id
    const { data: profile } = await adminClient
      .from("profiles")
      .select("team_id")
      .eq("user_id", user.id)
      .single();

    // Create meeting record
    const { data: meeting, error: meetingError } = await adminClient
      .from("meetings")
      .insert({
        title,
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

    if (meetingError || !meeting) {
      console.error("Meeting creation error:", meetingError);
      return new Response(JSON.stringify({ error: "Failed to create meeting" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trigger analysis pipeline
    try {
      const analyzeRes = await fetch(`${supabaseUrl}/functions/v1/analyze-meeting`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ meetingId: meeting.id }),
      });

      if (!analyzeRes.ok) {
        console.error("Failed to trigger analysis:", await analyzeRes.text());
      }
    } catch (err) {
      console.error("Error triggering analysis:", err);
    }

    return new Response(
      JSON.stringify({
        success: true,
        meetingId: meeting.id,
        message: "Recording uploaded successfully. Analysis will start automatically.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("upload-recording error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
