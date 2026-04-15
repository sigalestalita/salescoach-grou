import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client for auth validation
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin client for operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { links, meeting_type, seller_id } = await req.json();

    if (!links || !Array.isArray(links) || links.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum link fornecido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const effectiveSellerId = seller_id || user.id;
    const results: { link: string; meeting_id?: string; title?: string; status: string; error?: string }[] = [];

    for (const link of links) {
      const trimmed = (link as string).trim();
      if (!trimmed) continue;

      // Extract a title from the link
      let title = "Gravação importada";
      const fileIdMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (fileIdMatch) {
        title = `Gravação ${fileIdMatch[1].substring(0, 8)}`;
      }

      try {
        // Create meeting
        const { data: meeting, error: insertError } = await supabaseAdmin
          .from("meetings")
          .insert({
            title,
            seller_id: effectiveSellerId,
            youtube_url: trimmed,
            meeting_type: meeting_type || "empresa",
            status: "enviado",
          })
          .select("id, title")
          .single();

        if (insertError) throw insertError;

        // Trigger analysis
        const analyzeRes = await fetch(`${supabaseUrl}/functions/v1/analyze-meeting`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
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

    return new Response(JSON.stringify({ success: true, results, total: results.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Bulk import error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
