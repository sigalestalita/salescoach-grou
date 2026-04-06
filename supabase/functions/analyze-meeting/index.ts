import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { meetingId } = await req.json();
    if (!meetingId) {
      return new Response(JSON.stringify({ error: "meetingId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch meeting
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!meeting.file_url) {
      return new Response(JSON.stringify({ error: "No audio file attached" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to transcrevendo
    await supabase.from("meetings").update({ status: "transcrevendo" }).eq("id", meetingId);

    // Download audio from storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from("meeting-files")
      .download(meeting.file_url);

    if (fileError || !fileData) {
      await supabase.from("meetings").update({ status: "erro" }).eq("id", meetingId);
      return new Response(JSON.stringify({ error: "Failed to download file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Transcribe with Whisper
    const fileName = meeting.file_url.split("/").pop() || "audio.mp3";
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
      await supabase.from("meetings").update({ status: "erro" }).eq("id", meetingId);
      return new Response(JSON.stringify({ error: "Transcription failed", details: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const whisperResult = await whisperRes.json();
    const transcript = whisperResult.text;
    const durationSeconds = Math.round(whisperResult.duration || 0);

    // Save transcription
    await supabase.from("transcriptions").insert({
      meeting_id: meetingId,
      full_text: transcript,
      language: "pt-BR",
    });

    // Update duration
    await supabase.from("meetings").update({
      status: "analisando",
      duration_seconds: durationSeconds,
    }).eq("id", meetingId);

    // Analyze with Lovable AI
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
  "bant_score": {
    "budget": <0-25>,
    "authority": <0-25>,
    "need": <0-25>,
    "timeline": <0-25>
  },
  "meddic_score": {
    "metrics": <0-17>,
    "economic_buyer": <0-17>,
    "decision_criteria": <0-17>,
    "decision_process": <0-17>,
    "identify_pain": <0-17>,
    "champion": <0-17>
  },
  "spin_score": {
    "situacao": <0-25>,
    "problema": <0-25>,
    "implicacao": <0-25>,
    "necessidade": <0-25>
  },
  "talk_ratio": {
    "seller": <porcentagem 0-100>,
    "lead": <porcentagem 0-100>
  },
  "conversation_metrics": {
    "total_questions": <número>,
    "open_questions": <número>,
    "objections_handled": <número>
  },
  "insights": {
    "positives": ["o que foi bem feito na reunião"],
    "improvements": ["o que faltou ou pode melhorar"],
    "key_moments": ["momentos-chave da conversa"]
  },
  "sales_coach": {
    "next_steps": ["próximos passos recomendados"],
    "suggestions": ["sugestões práticas para o vendedor"],
    "scripts": ["frases/scripts recomendados para follow-up"]
  },
  "highlights": [
    {
      "type": "<objecao|sinal_compra|momento_chave|dor|necessidade>",
      "text": "trecho relevante da conversa",
      "speaker": "<vendedor|lead>"
    }
  ]
}

Analise com profundidade. Seja específico nas sugestões. Scores devem refletir o que foi realmente discutido na reunião.`;

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
      const errText = await aiRes.text();
      console.error("AI analysis error:", aiRes.status, errText);
      await supabase.from("meetings").update({ status: "erro" }).eq("id", meetingId);

      const status = aiRes.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiRes.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || "";

    // Parse JSON from response (strip markdown fences if present)
    let analysisData;
    try {
      const jsonStr = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysisData = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", rawContent);
      await supabase.from("meetings").update({ status: "erro" }).eq("id", meetingId);
      return new Response(JSON.stringify({ error: "Failed to parse analysis" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save analysis results
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

    // Save highlights
    if (analysisData.highlights && Array.isArray(analysisData.highlights)) {
      const highlightRows = analysisData.highlights.map((h: any) => ({
        meeting_id: meetingId,
        highlight_type: h.type,
        text: h.text,
        speaker: h.speaker || null,
      }));
      if (highlightRows.length > 0) {
        await supabase.from("highlights").insert(highlightRows);
      }
    }

    // Update meeting with final status
    await supabase.from("meetings").update({
      status: "completo",
      overall_score: analysisData.overall_score,
      temperature: analysisData.temperature,
    }).eq("id", meetingId);

    return new Response(JSON.stringify({ success: true }), {
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
