import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractGoogleDriveFileId(url: string): string | null {
  const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match1) return match1[1];
  const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2) return match2[1];
  return null;
}

async function downloadFromGoogleDrive(fileId: string): Promise<Blob> {
  const candidates = [
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`,
  ];

  for (const url of candidates) {
    console.log("Trying Google Drive URL:", url);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) continue;

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return await res.blob();

    const html = await res.text();
    const actionMatch = html.match(/action="(https:\/\/drive\.usercontent\.google\.com\/download[^"]+)"/);
    if (actionMatch) {
      const directUrl = actionMatch[1].replace(/&amp;/g, "&");
      const directRes = await fetch(directUrl, { redirect: "follow" });
      if (directRes.ok) {
        const directCt = directRes.headers.get("content-type") || "";
        if (!directCt.includes("text/html")) return await directRes.blob();
      }
    }
  }

  throw new Error("Não foi possível baixar o arquivo do Google Drive. Verifique se está compartilhado como 'Qualquer pessoa com o link'.");
}

async function transcribeWithWhisper(fileData: Blob, fileName: string, openaiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", new File([fileData], fileName));
  formData.append("model", "whisper-1");
  formData.append("language", "pt");
  formData.append("response_format", "verbose_json");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: formData,
  });

  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    console.error("Whisper error:", errText);
    throw new Error(`Transcription failed: ${errText}`);
  }

  const whisperResult = await whisperRes.json();
  return whisperResult.text;
}

/**
 * Main processing logic — runs in background via EdgeRuntime.waitUntil
 */
async function processeMeeting(meetingId: string, manualTranscript: string | null) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings").select("*").eq("id", meetingId).single();

  if (meetingError || !meeting) {
    console.error("Meeting not found:", meetingId);
    return;
  }

  let transcript = "";

  try {
    if (manualTranscript && manualTranscript.trim().length > 0) {
      transcript = manualTranscript.trim();
    } else if (meeting.file_url) {
      await supabase.from("meetings").update({ status: "baixando" }).eq("id", meetingId);

      const { data: fileData, error: fileError } = await supabase.storage
        .from("meeting-files").download(meeting.file_url);

      if (fileError || !fileData) {
        await supabase.from("meetings").update({ status: "erro" }).eq("id", meetingId);
        return;
      }

      const fileName = meeting.file_url.split("/").pop() || "audio.mp3";
      transcript = await transcribeWithWhisper(fileData, fileName, openaiKey);
    } else if (meeting.youtube_url) {
      await supabase.from("meetings").update({ status: "transcrevendo" }).eq("id", meetingId);

      const driveFileId = extractGoogleDriveFileId(meeting.youtube_url);
      let fileBlob: Blob;
      let fileName: string;

      if (driveFileId) {
        fileBlob = await downloadFromGoogleDrive(driveFileId);
        fileName = "audio_drive.mp4";
      } else {
        const res = await fetch(meeting.youtube_url, { redirect: "follow" });
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        fileBlob = await res.blob();
        fileName = "audio.mp4";
      }

      transcript = await transcribeWithWhisper(fileBlob, fileName, openaiKey);
    } else {
      await supabase.from("meetings").update({ status: "erro" }).eq("id", meetingId);
      return;
    }

    // Save transcription
    await supabase.from("transcriptions").insert({
      meeting_id: meetingId, full_text: transcript, language: "pt-BR",
    });

    await supabase.from("meetings").update({ status: "analisando" }).eq("id", meetingId);

    // Analyze with AI
    const analysisPrompt = `Você é um especialista em vendas B2B. Analise a transcrição abaixo de uma reunião comercial e retorne uma análise estruturada.

TRANSCRIÇÃO:
${transcript}

CONTEXTO:
- Vendedor está conversando com o lead: ${meeting.lead_name || "desconhecido"} da empresa ${meeting.lead_company || "desconhecida"}
- Título da reunião: ${meeting.title}

RETORNE um JSON com EXATAMENTE esta estrutura (sem markdown, apenas JSON puro):
{
  "overall_score": <número de 0 a 100>,
  "temperature": "<frio|morno|quente>",
  "bant_score": { "budget": <0-25>, "authority": <0-25>, "need": <0-25>, "timeline": <0-25> },
  "meddic_score": { "metrics": <0-17>, "economic_buyer": <0-17>, "decision_criteria": <0-17>, "decision_process": <0-17>, "identify_pain": <0-17>, "champion": <0-17> },
  "spin_score": { "situacao": <0-25>, "problema": <0-25>, "implicacao": <0-25>, "necessidade": <0-25> },
  "talk_ratio": { "seller": <0-100>, "lead": <0-100> },
  "conversation_metrics": { "total_questions": <número>, "open_questions": <número>, "objections_handled": <número> },
  "insights": { "positives": ["..."], "improvements": ["..."], "key_moments": ["..."] },
  "sales_coach": { "next_steps": ["..."], "suggestions": ["..."], "scripts": ["..."] },
  "highlights": [{ "type": "<objecao|sinal_compra|momento_chave|dor|necessidade>", "text": "...", "speaker": "<vendedor|lead>" }]
}

Analise com profundidade. Seja específico nas sugestões.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um analista de vendas B2B experiente. Responda APENAS com JSON válido, sem markdown." },
          { role: "user", content: analysisPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      console.error("AI error:", aiRes.status, await aiRes.text());
      await supabase.from("meetings").update({ status: "erro" }).eq("id", meetingId);
      return;
    }

    const aiResult = await aiRes.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || "";

    let analysisData;
    try {
      const jsonStr = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysisData = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", rawContent);
      await supabase.from("meetings").update({ status: "erro" }).eq("id", meetingId);
      return;
    }

    await supabase.from("analysis_results").insert({
      meeting_id: meetingId,
      overall_score: analysisData.overall_score,
      temperature: analysisData.temperature,
      bant_score: analysisData.bant_score,
      meddic_score: analysisData.meddic_score,
      spin_score: analysisData.spin_score,
      talk_ratio: analysisData.talk_ratio,
      conversation_metrics: analysisData.conversation_metrics,
      insights: analysisData.insights,
      sales_coach: analysisData.sales_coach,
      raw_analysis: analysisData,
      model_used: "google/gemini-2.5-flash",
    });

    if (analysisData.highlights && Array.isArray(analysisData.highlights)) {
      const rows = analysisData.highlights.map((h: any) => ({
        meeting_id: meetingId,
        highlight_type: h.type,
        text: h.text,
        speaker: h.speaker || null,
      }));
      if (rows.length > 0) await supabase.from("highlights").insert(rows);
    }

    await supabase.from("meetings").update({
      status: "completo",
      overall_score: analysisData.overall_score,
      temperature: analysisData.temperature,
    }).eq("id", meetingId);

    console.log("Meeting processing complete:", meetingId);
  } catch (error) {
    console.error("Processing error:", error);
    await supabase.from("meetings").update({ status: "erro" }).eq("id", meetingId);
  }
}

// ---- Handler: validate input, return immediately, process in background ----

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { meetingId, manualTranscript } = await req.json();
    if (!meetingId) {
      return new Response(JSON.stringify({ error: "meetingId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Quick validation
    const { data: meeting } = await supabase
      .from("meetings").select("id, status").eq("id", meetingId).single();

    if (!meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to processing
    await supabase.from("meetings").update({ status: "transcrevendo" }).eq("id", meetingId);

    // Process in background — does NOT block the response
    EdgeRuntime.waitUntil(
      processeMeeting(meetingId, manualTranscript || null).catch((err) => {
        console.error("Background processing failed:", err);
        supabase.from("meetings").update({ status: "erro" }).eq("id", meetingId);
      })
    );

    return new Response(JSON.stringify({ success: true, message: "Processing started" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("analyze-meeting error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
