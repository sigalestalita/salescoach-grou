import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Google Drive helpers ──

function extractGoogleDriveFileId(url: string): string | null {
  const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match1) return match1[1];
  const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2) return match2[1];
  return null;
}

function getGoogleDriveDirectUrl(fileId: string): string {
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
}

// ── Transcription providers ──

async function transcribeWithAssemblyAI(audioUrl: string): Promise<{ text: string; speakers: any[] | null }> {
  const apiKey = Deno.env.get("ASSEMBLYAI_API_KEY")!;
  const headers = { Authorization: apiKey, "Content-Type": "application/json" };

  console.log("AssemblyAI: submitting URL for transcription:", audioUrl);

  const startRes = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers,
    body: JSON.stringify({
      audio_url: audioUrl,
      speech_models: ["universal-2"],
      speaker_labels: true,
      language_detection: true,
    }),
  });

  if (!startRes.ok) {
    const err = await startRes.text();
    throw new Error(`AssemblyAI start failed: ${err}`);
  }

  const { id: transcriptId } = await startRes.json();
  console.log("AssemblyAI: transcript ID", transcriptId, "— polling...");

  // Poll every 5s, max 30 min
  const maxAttempts = 360;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, { headers });
    const data = await pollRes.json();

    if (data.status === "completed") {
      console.log("AssemblyAI: transcription complete");
      const speakers = data.utterances?.map((u: any) => ({
        speaker: u.speaker,
        text: u.text,
        start: u.start,
        end: u.end,
      })) || null;
      return { text: data.text, speakers };
    }

    if (data.status === "error") {
      throw new Error(`AssemblyAI error: ${data.error}`);
    }
  }

  throw new Error("AssemblyAI: transcription timed out after 30 minutes");
}

async function uploadToAssemblyAI(fileData: Blob): Promise<string> {
  const apiKey = Deno.env.get("ASSEMBLYAI_API_KEY")!;
  console.log("Uploading file to AssemblyAI...");
  const res = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/octet-stream",
      "Transfer-Encoding": "chunked",
    },
    body: fileData,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AssemblyAI upload failed: ${err}`);
  }
  const { upload_url } = await res.json();
  console.log("AssemblyAI upload complete:", upload_url);
  return upload_url;
}

async function transcribeWithGroq(fileData: Blob, fileName: string): Promise<string> {
  const groqKey = Deno.env.get("GROQ_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  const useGroq = !!groqKey;
  const apiUrl = useGroq
    ? "https://api.groq.com/openai/v1/audio/transcriptions"
    : "https://api.openai.com/v1/audio/transcriptions";
  const apiKey = useGroq ? groqKey : openaiKey;
  const model = useGroq ? "whisper-large-v3-turbo" : "whisper-1";

  if (!apiKey) {
    throw new Error("No transcription API key configured (GROQ_API_KEY or OPENAI_API_KEY)");
  }

  console.log(`Transcribing with ${useGroq ? "Groq" : "OpenAI"} (${model})`);

  const formData = new FormData();
  formData.append("file", new File([fileData], fileName));
  formData.append("model", model);
  formData.append("language", "pt");
  formData.append("response_format", "verbose_json");

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Transcription failed (${useGroq ? "Groq" : "OpenAI"}): ${errText}`);
  }

  const result = await res.json();
  return result.text;
}

// ── Knowledge base helpers ──

async function fetchKnowledgeContext(supabase: any): Promise<string> {
  const [docsRes, itemsRes] = await Promise.all([
    supabase.from("knowledge_documents").select("title, category, extracted_content").not("extracted_content", "is", null),
    supabase.from("knowledge_items").select("name, item_type, category, description, metadata"),
  ]);

  const parts: string[] = [];

  if (docsRes.data && docsRes.data.length > 0) {
    parts.push("=== DOCUMENTOS DA BASE DE CONHECIMENTO ===");
    for (const doc of docsRes.data) {
      parts.push(`\n--- ${doc.title} (${doc.category || "sem categoria"}) ---`);
      // Limit each doc to ~2000 chars to avoid token overflow
      const content = doc.extracted_content?.substring(0, 2000) || "";
      parts.push(content);
    }
  }

  if (itemsRes.data && itemsRes.data.length > 0) {
    parts.push("\n=== ITENS DA BASE DE CONHECIMENTO ===");
    for (const item of itemsRes.data) {
      parts.push(`\n- ${item.name} (${item.item_type}/${item.category || "geral"}): ${item.description || ""}`);
      if (item.metadata) {
        parts.push(`  Metadata: ${JSON.stringify(item.metadata).substring(0, 500)}`);
      }
    }
  }

  return parts.join("\n");
}

// ── Main processing ──

async function processeMeeting(meetingId: string, manualTranscript: string | null) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings").select("*").eq("id", meetingId).single();

  if (meetingError || !meeting) {
    console.error("Meeting not found:", meetingId);
    return;
  }

  let transcript = "";
  let speakers: any[] | null = null;

  try {
    if (manualTranscript && manualTranscript.trim().length > 0) {
      transcript = manualTranscript.trim();
    } else if (meeting.youtube_url) {
      await supabase.from("meetings").update({ status: "baixando" }).eq("id", meetingId);

      const driveFileId = extractGoogleDriveFileId(meeting.youtube_url);
      const audioUrl = driveFileId
        ? getGoogleDriveDirectUrl(driveFileId)
        : meeting.youtube_url;

      await supabase.from("meetings").update({ status: "transcrevendo" }).eq("id", meetingId);

      const assemblyKey = Deno.env.get("ASSEMBLYAI_API_KEY");
      if (!assemblyKey) {
        throw new Error("ASSEMBLYAI_API_KEY não configurada. Necessária para transcrever arquivos externos.");
      }

      const result = await transcribeWithAssemblyAI(audioUrl);
      transcript = result.text;
      speakers = result.speakers;
    } else if (meeting.file_url) {
      await supabase.from("meetings").update({ status: "baixando" }).eq("id", meetingId);

      const { data: fileData, error: fileError } = await supabase.storage
        .from("meeting-files").download(meeting.file_url);

      if (fileError || !fileData) {
        console.error("Failed to download file:", fileError);
        await supabase.from("meetings").update({ status: "erro" }).eq("id", meetingId);
        return;
      }

      await supabase.from("meetings").update({ status: "transcrevendo" }).eq("id", meetingId);

      const assemblyKey = Deno.env.get("ASSEMBLYAI_API_KEY");
      if (assemblyKey) {
        // Upload file directly to AssemblyAI (handles any format including webm video)
        const uploadUrl = await uploadToAssemblyAI(fileData);
        const result = await transcribeWithAssemblyAI(uploadUrl);
        transcript = result.text;
        speakers = result.speakers;
      } else {
        // Fallback to Groq/OpenAI (only works with pure audio files)
        const fileName = meeting.file_url.split("/").pop() || "audio.mp3";
        transcript = await transcribeWithGroq(fileData, fileName);
      }
    } else {
      await supabase.from("meetings").update({ status: "erro" }).eq("id", meetingId);
      return;
    }

    // Save transcription
    await supabase.from("transcriptions").insert({
      meeting_id: meetingId,
      full_text: transcript,
      language: "pt-BR",
      speakers: speakers,
    });

    await supabase.from("meetings").update({ status: "analisando" }).eq("id", meetingId);

    // Fetch knowledge base context
    console.log("Fetching knowledge base context...");
    const knowledgeContext = await fetchKnowledgeContext(supabase);
    const hasKnowledge = knowledgeContext.trim().length > 0;
    console.log(`Knowledge base: ${hasKnowledge ? "found content" : "empty"}`);

    // Build analysis prompt with knowledge base
    // Add consulting-specific pricing context
    const consultoriaSection = meeting.meeting_type === "consultoria"
      ? `\nCONTEXTO DE PREÇOS PARA CONSULTORIA:
- Esta é uma reunião de CONSULTORIA. Use as tabelas "Créditos PDA - Consultoria" (para clientes existentes/recargas) e "Programa de Partners" (para novos clientes) ao avaliar propostas de valor e oportunidades.
- NÃO use a tabela de Licenças PDA para empresas neste contexto.
- Créditos PDA - Consultoria = recargas para consultores já clientes.
- Programa de Partners = entrada de novos consultores com pacotes de licenças (Bronze a Safira).
- Avalie se o vendedor apresentou a faixa correta do programa com base no perfil do prospect.\n`
      : "";

    const knowledgeSection = hasKnowledge
      ? `\nBASE DE CONHECIMENTO DA EMPRESA:
${knowledgeContext}

INSTRUÇÕES ADICIONAIS SOBRE A BASE DE CONHECIMENTO:
- Use a base de conhecimento acima para validar se o vendedor mencionou corretamente os produtos, serviços e diferenciais da empresa.
- Identifique oportunidades de cross-sell e upsell com base nos produtos/serviços disponíveis na base.
- Avalie a aderência do discurso comercial aos materiais e argumentos da base de conhecimento.
- No campo "rag_results" do JSON, inclua sua análise sobre o uso da base de conhecimento.\n`
      : "";

    const analysisPrompt = `Você é um especialista em vendas B2B. Analise a transcrição abaixo de uma reunião comercial e retorne uma análise estruturada.

TRANSCRIÇÃO:
${transcript}

CONTEXTO:
- Vendedor está conversando com o lead: ${meeting.lead_name || "desconhecido"} da empresa ${meeting.lead_company || "desconhecida"}
- Título da reunião: ${meeting.title}
- Tipo de reunião: ${meeting.meeting_type || "empresa"}
${consultoriaSection}${knowledgeSection}

CRITÉRIOS OBRIGATÓRIOS PARA CLASSIFICAÇÃO DE TEMPERATURA (baseado na metodologia NATO/BANT da empresa):

A temperatura DEVE ser classificada em uma das 5 categorias abaixo, usando EXATAMENTE estes valores:
- "muito_quente": Preenchem todos os requisitos NATO/BANT (venda imediata). Score BANT 4 critérios atendidos. Budget confirmado, decisor presente, necessidade clara e urgente, timeline < 30 dias.
- "quente": Preenchem todos os requisitos NATO/BANT (prontos para venda, com fechamento em até 90 dias). Score BANT 3-4 critérios. Budget provável, acesso ao decisor, necessidade validada, timeline < 90 dias.
- "morno": Têm necessidade, mas talvez não tenham orçamento ou urgência imediata (vão para nutrição). Score BANT 2-3 critérios. Budget incerto, influenciador identificado, dor reconhecida mas sem urgência, timeline 3-9 meses.
- "frio": Sem demanda clara definida, falta urgência e prioridade; prospect que pode aquecer com conteúdo a longo prazo. Score BANT 1-2 critérios. Sem orçamento definido, sem acesso ao decisor, dor genérica, timeline > 9 meses.
- "congelado": Não têm perfil para o nosso negócio (devem ser descartados). Score BANT 0-1 critério. Sem orçamento e sem previsão, sem acesso ao decisor, não reconhece problema, fora do radar (>12 meses).

RETORNE um JSON com EXATAMENTE esta estrutura (sem markdown, apenas JSON puro):
{
  "overall_score": <número de 0 a 100>,
  "overall_score_reason": "<explicação breve de 1-2 frases justificando o score geral>",
  "temperature": "<congelado|frio|morno|quente|muito_quente>",
  "temperature_reason": "<explicação breve de 1-2 frases justificando a temperatura com base nos critérios NATO/BANT acima>",
  "bant_score": { "budget": { "score": <0-25>, "reason": "<justificativa>" }, "authority": { "score": <0-25>, "reason": "<justificativa>" }, "need": { "score": <0-25>, "reason": "<justificativa>" }, "timeline": { "score": <0-25>, "reason": "<justificativa>" } },
  "meddic_score": { "metrics": { "score": <0-17>, "reason": "<justificativa>" }, "economic_buyer": { "score": <0-17>, "reason": "<justificativa>" }, "decision_criteria": { "score": <0-17>, "reason": "<justificativa>" }, "decision_process": { "score": <0-17>, "reason": "<justificativa>" }, "identify_pain": { "score": <0-17>, "reason": "<justificativa>" }, "champion": { "score": <0-17>, "reason": "<justificativa>" } },
  "spin_score": { "situacao": { "score": <0-25>, "reason": "<justificativa>" }, "problema": { "score": <0-25>, "reason": "<justificativa>" }, "implicacao": { "score": <0-25>, "reason": "<justificativa>" }, "necessidade": { "score": <0-25>, "reason": "<justificativa>" } },
  "talk_ratio": { "seller": <0-100>, "lead": <0-100>, "reason": "<justificativa sobre a proporção de fala>" },
  "conversation_metrics": { "total_questions": <número>, "open_questions": <número>, "objections_handled": <número> },
  "insights": { "positives": ["..."], "improvements": ["..."], "key_moments": ["..."] },
  "sales_coach": { "next_steps": ["..."], "suggestions": ["..."], "scripts": ["..."] },
  "highlights": [{ "type": "<objecao|sinal_compra|momento_chave|dor|necessidade>", "text": "...", "speaker": "<vendedor|lead>" }],
  "meeting_summary": {
    "company_name": "<nome da empresa do lead, se mencionado>",
    "participants": [{ "name": "<nome>", "role": "<cargo/função>" }],
    "company_size": "<número de colaboradores ou porte da empresa, se mencionado>",
    "identified_pains": ["<dor 1>", "<dor 2>", "..."],
    "products_presented": ["<produto/serviço apresentado 1>", "..."],
    "proposal_value": "<valor da proposta ou descrição da proposta comercial, se mencionado>",
    "solution_pain_match": [{ "pain": "<dor identificada>", "solution": "<solução do portfólio que endereça essa dor>" }]
  },
  "rag_results": { "knowledge_adherence_score": <0-100>, "products_mentioned": ["..."], "missed_opportunities": ["..."], "cross_sell_suggestions": ["..."], "discourse_alignment": "..." }
}

IMPORTANTE: 
- Para cada sub-métrica de BANT, MEDDIC e SPIN, inclua um objeto com "score" e "reason". A "reason" deve ser uma frase curta e específica baseada no que aconteceu (ou não) na reunião.
- A temperatura DEVE seguir rigorosamente os critérios NATO/BANT descritos acima. Cruze o score BANT com os critérios de qualificação para determinar a temperatura correta.
- Na justificativa da temperatura, mencione quantos critérios BANT foram atendidos e quais.

Analise com profundidade. Seja específico nas sugestões.${hasKnowledge ? " Use a base de conhecimento para enriquecer sua análise e preencher o campo rag_results com detalhes." : " Se não houver base de conhecimento disponível, preencha rag_results como null."}`;

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

    const { error: insertError } = await supabase.from("analysis_results").insert({
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
      rag_results: analysisData.rag_results || null,
      raw_analysis: analysisData,
      model_used: "google/gemini-2.5-flash",
    });

    if (insertError) {
      console.error("Failed to insert analysis_results:", JSON.stringify(insertError));
      await supabase.from("meetings").update({ status: "erro" }).eq("id", meetingId);
      return;
    }

    if (analysisData.highlights && Array.isArray(analysisData.highlights)) {
      const rows = analysisData.highlights.map((h: any) => ({
        meeting_id: meetingId,
        highlight_type: h.type,
        text: h.text,
        speaker: h.speaker || null,
      }));
      if (rows.length > 0) await supabase.from("highlights").insert(rows);
    }

    const { error: updateError } = await supabase.from("meetings").update({
      status: "completo",
      overall_score: analysisData.overall_score,
      temperature: analysisData.temperature,
    }).eq("id", meetingId);

    if (updateError) {
      console.error("Failed to update meeting status:", JSON.stringify(updateError));
    }

    console.log("Meeting processing complete:", meetingId);
  } catch (error) {
    console.error("Processing error:", error);
    await supabase.from("meetings").update({ status: "erro" }).eq("id", meetingId);
  }
}

// ── Handler ──

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

    const { data: meeting } = await supabase
      .from("meetings").select("id, status").eq("id", meetingId).single();

    if (!meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("meetings").update({ status: "transcrevendo" }).eq("id", meetingId);

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
