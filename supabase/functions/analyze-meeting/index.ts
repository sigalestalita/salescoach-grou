import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { json, preflight } from "../_shared/cors.ts";
import {
  adminClient,
  assertQuota,
  getCaller,
  isInternalCall,
  HttpError,
  logUsage,
} from "../_shared/tenant.ts";
import {
  buildAnalysisPrompt,
  fetchKnowledgeContext,
  loadMeetingTypeContext,
  analysisSystemMessage,
  loadTemplate,
  methodologySnapshot,
} from "../_shared/analysis-template.ts";

const ANALYSIS_MODEL = Deno.env.get("ANALYSIS_MODEL") ?? "google/gemini-2.5-flash";

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

/**
 * Validates whether a Google Drive file is publicly accessible without downloading it.
 * Uses a Range request (first 1KB) to inspect Content-Type and detect HTML confirmation pages.
 * Returns the URL to use, or throws with a clear user-facing message.
 */
async function validateGoogleDriveUrl(fileId: string): Promise<string> {
  const url = getGoogleDriveDirectUrl(fileId);
  console.log("Validating Google Drive URL:", url);

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Range: "bytes=0-1023",
  };

  const res = await fetch(url, { headers, redirect: "follow" });
  const contentType = res.headers.get("content-type") || "";
  const contentLength = res.headers.get("content-length") || "?";
  console.log(`Drive validation: status=${res.status} type=${contentType} length=${contentLength}`);

  if (res.status >= 400) {
    // drain body
    try { await res.arrayBuffer(); } catch { /* ignore */ }
    throw new Error(
      `Arquivo do Google Drive não está acessível (HTTP ${res.status}). Verifique se o link está compartilhado como "Qualquer pessoa com o link".`,
    );
  }

  if (contentType.includes("text/html")) {
    // It's the confirmation page — file is private or blocked.
    try { await res.arrayBuffer(); } catch { /* ignore */ }
    throw new Error(
      'Arquivo do Google Drive não está acessível publicamente. Abra o link, clique em "Compartilhar" e mude o acesso para "Qualquer pessoa com o link".',
    );
  }

  // Drain the small probe body so the connection is released.
  try { await res.arrayBuffer(); } catch { /* ignore */ }

  // Accept video/*, audio/*, application/octet-stream, or anything non-HTML with a body.
  const acceptable =
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/") ||
    contentType.includes("octet-stream") ||
    contentType.includes("mp4") ||
    contentType.includes("mpeg");

  if (!acceptable) {
    console.warn(`Drive content-type unusual but proceeding: ${contentType}`);
  }

  return url;
}

async function downloadFromGoogleDrive(fileId: string): Promise<Blob> {
  const url = getGoogleDriveDirectUrl(fileId);
  console.log("Downloading from Google Drive:", url);

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  let res = await fetch(url, { headers, redirect: "follow" });
  let blob = await res.blob();

  // If we got HTML back, it's the confirmation page — extract the real download link
  if (blob.type?.includes("text/html") || blob.size < 100000) {
    const text = await blob.text();
    if (text.includes("virus scan") || text.includes("confirm=") || text.includes("download_warning")) {
      console.log("Got Google Drive confirmation page, extracting real link...");
      // Try to find the confirmation form action or direct link
      const formMatch = text.match(/action="([^"]+)"/);
      const idMatch = text.match(/confirm=([^&"]+)/);
      
      let retryUrl: string;
      if (formMatch) {
        retryUrl = formMatch[1].replace(/&amp;/g, "&");
        if (!retryUrl.startsWith("http")) {
          retryUrl = `https://drive.usercontent.google.com${retryUrl}`;
        }
      } else if (idMatch) {
        retryUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${idMatch[1]}`;
      } else {
        // Last resort: try with uuid cookie approach
        retryUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
      }

      console.log("Retrying download with:", retryUrl);
      res = await fetch(retryUrl, { headers, redirect: "follow" });
      blob = await res.blob();

      if (blob.type?.includes("text/html")) {
        // Final fallback: try the /uc endpoint
        const ucUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
        console.log("Still HTML, trying /uc endpoint:", ucUrl);
        res = await fetch(ucUrl, { headers, redirect: "follow" });
        blob = await res.blob();

        if (blob.type?.includes("text/html")) {
          throw new Error(`Google Drive retornou HTML mesmo após tentativas de confirmação. O arquivo pode não estar compartilhado publicamente. File ID: ${fileId}`);
        }
      }
    }
  }

  console.log(`Google Drive download complete: ${blob.size} bytes, type: ${blob.type}`);
  return blob;
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

// ── Gravações .webm da extensão ─────────────────────────────────────────────
// Um .webm válido começa com o cabeçalho EBML (1A 45 DF A3). Versões antigas da
// extensão (até 1.6.0) podiam salvar pedaços de uma gravação anterior antes do
// cabeçalho, ou perder o cabeçalho: a AssemblyAI recusa o arquivo ("Transcoding
// failed ... application/octet-stream"). Se o cabeçalho estiver mais à frente,
// cortamos o lixo do início; se não existir, a gravação não tem conserto.
const EBML = [0x1a, 0x45, 0xdf, 0xa3];
const GRAVACAO_CORROMPIDA =
  "A gravação chegou corrompida e não pode ser transcrita. Isso acontecia na extensão até a versão 1.6.0: " +
  "baixe a versão mais recente na página Extensão, reinstale no Chrome e grave a próxima reunião novamente.";

// Acima disto, o arquivo não é baixado na função (ver arquivoGrande).
const LIMITE_DOWNLOAD = 40 * 1024 * 1024;

/** Arquivo do Storage grande demais para baixar na função, com a AssemblyAI disponível. */
async function arquivoGrande(supabase: any, path: string): Promise<boolean> {
  if (!Deno.env.get("ASSEMBLYAI_API_KEY")) return false;
  const i = path.lastIndexOf("/");
  const { data } = await supabase.storage.from("meeting-files")
    .list(path.slice(0, i), { search: path.slice(i + 1), limit: 5 });
  const obj = (data ?? []).find((o: { name: string }) => o.name === path.slice(i + 1));
  return Number(obj?.metadata?.size ?? 0) > LIMITE_DOWNLOAD;
}

/** Lê só os 4 primeiros bytes: o .webm da extensão tem de começar pelo cabeçalho EBML. */
async function comecaComEbml(url: string): Promise<boolean> {
  if (!/\.webm(\?|$)/i.test(url)) return true;
  const r = await fetch(url, { headers: { Range: "bytes=0-3" } });
  const b = new Uint8Array(await r.arrayBuffer()).slice(0, 4);
  return EBML.every((v, i) => b[i] === v);
}

async function repararWebm(blob: Blob): Promise<Blob | null> {
  const inicio = new Uint8Array(await blob.slice(0, 8 * 1024 * 1024).arrayBuffer());
  for (let i = 0; i + 3 < inicio.length; i++) {
    if (inicio[i] === EBML[0] && inicio[i + 1] === EBML[1] && inicio[i + 2] === EBML[2] && inicio[i + 3] === EBML[3]) {
      if (i > 0) console.log(`webm: cabeçalho EBML no byte ${i}, descartando o início`);
      return i === 0 ? blob : blob.slice(i, blob.size, "video/webm");
    }
  }
  return null;
}

function mensagemAmigavel(msg: string): string {
  if (/Transcoding failed|may be unsupported|octet-stream/i.test(msg)) return GRAVACAO_CORROMPIDA;
  if (/does not appear to contain audio|no spoken audio|audio duration/i.test(msg)) {
    return "Não encontramos áudio na gravação. Confira se o microfone e o áudio da aba estavam liberados para a extensão e grave novamente.";
  }
  return msg;
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

// ── Processamento ───────────────────────────────────────────────────────────

async function processMeeting(meetingId: string, manualTranscript: string | null) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = adminClient();

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings").select("*").eq("id", meetingId).single();

  if (meetingError || !meeting) {
    console.error("Meeting not found:", meetingId);
    return;
  }

  const orgId: string = meeting.org_id;
  let transcript = "";
  let speakers: any[] | null = null;

  try {
    if (manualTranscript && manualTranscript.trim().length > 0) {
      transcript = manualTranscript.trim();
    } else if (meeting.youtube_url) {
      await supabase.from("meetings").update({ status: "baixando" }).eq("id", meetingId);

      const assemblyKey = Deno.env.get("ASSEMBLYAI_API_KEY");
      if (!assemblyKey) {
        throw new Error("ASSEMBLYAI_API_KEY não configurada. Necessária para transcrever arquivos externos.");
      }

      const driveFileId = extractGoogleDriveFileId(meeting.youtube_url);
      let assemblyAudioUrl: string;

      if (driveFileId) {
        // Valida o acesso e entrega a URL direto para a AssemblyAI, que baixa o
        // arquivo nos servidores dela — evita carregar centenas de MB na função.
        assemblyAudioUrl = await validateGoogleDriveUrl(driveFileId);
        await supabase.from("meetings").update({ status: "transcrevendo" }).eq("id", meetingId);
      } else {
        await supabase.from("meetings").update({ status: "transcrevendo" }).eq("id", meetingId);
        assemblyAudioUrl = meeting.youtube_url;
      }

      const result = await transcribeWithAssemblyAI(assemblyAudioUrl);
      transcript = result.text;
      speakers = result.speakers;
    } else if (meeting.file_url && await arquivoGrande(supabase, meeting.file_url)) {
      // Vídeo longo: baixar aqui estoura a memória da função. A AssemblyAI
      // baixa direto do Storage por um link assinado (como no Google Drive).
      await supabase.from("meetings").update({ status: "transcrevendo" }).eq("id", meetingId);
      const { data: assinado, error: assinErr } = await supabase.storage
        .from("meeting-files").createSignedUrl(meeting.file_url, 6 * 3600);
      if (assinErr || !assinado?.signedUrl) throw new Error(`Link do arquivo não gerado: ${assinErr?.message ?? "sem URL"}`);
      if (!await comecaComEbml(assinado.signedUrl)) {
        await supabase.from("meetings").update({ status: "erro", error_message: GRAVACAO_CORROMPIDA }).eq("id", meetingId);
        return;
      }
      const result = await transcribeWithAssemblyAI(assinado.signedUrl);
      transcript = result.text;
      speakers = result.speakers;
    } else if (meeting.file_url) {
      await supabase.from("meetings").update({ status: "baixando" }).eq("id", meetingId);

      const { data: fileData, error: fileError } = await supabase.storage
        .from("meeting-files").download(meeting.file_url);

      if (fileError || !fileData) {
        console.error("Failed to download file:", fileError);
        await supabase.from("meetings").update({
          status: "erro",
          error_message: `Falha ao baixar o arquivo do storage: ${fileError?.message || "arquivo não encontrado"}`,
        }).eq("id", meetingId);
        return;
      }

      let audio: Blob = fileData;
      if (/\.webm$/i.test(meeting.file_url) || meeting.file_type === "webm") {
        const reparado = await repararWebm(fileData);
        if (!reparado) {
          await supabase.from("meetings").update({ status: "erro", error_message: GRAVACAO_CORROMPIDA }).eq("id", meetingId);
          return;
        }
        audio = reparado;
      }

      await supabase.from("meetings").update({ status: "transcrevendo" }).eq("id", meetingId);

      const assemblyKey = Deno.env.get("ASSEMBLYAI_API_KEY");
      if (assemblyKey) {
        const uploadUrl = await uploadToAssemblyAI(audio);
        const result = await transcribeWithAssemblyAI(uploadUrl);
        transcript = result.text;
        speakers = result.speakers;
      } else {
        const fileName = meeting.file_url.split("/").pop() || "audio.mp3";
        transcript = await transcribeWithGroq(audio, fileName);
      }

      await logUsage(supabase, {
        orgId,
        userId: meeting.seller_id,
        meetingId,
        operation: "storage",
        provider: "supabase",
        quantity: fileData.size ?? 0,
        unit: "bytes",
      });
    } else {
      await supabase.from("meetings").update({
        status: "erro",
        error_message: "Nenhum arquivo nem link foi fornecido para esta reunião.",
      }).eq("id", meetingId);
      return;
    }

    // Consumo de transcrição, em minutos.
    if (!manualTranscript) {
      await logUsage(supabase, {
        orgId,
        userId: meeting.seller_id,
        meetingId,
        operation: "transcricao",
        provider: Deno.env.get("ASSEMBLYAI_API_KEY") ? "assemblyai" : "groq/openai",
        model: Deno.env.get("ASSEMBLYAI_API_KEY") ? "universal-2" : "whisper",
        quantity: meeting.duration_seconds ? Math.ceil(meeting.duration_seconds / 60) : 0,
        unit: "minutos",
      });
    }

    await supabase.from("transcriptions").insert({
      meeting_id: meetingId,
      org_id: orgId,
      full_text: transcript,
      language: "pt-BR",
      speakers: speakers,
    });

    await supabase.from("meetings").update({ status: "analisando" }).eq("id", meetingId);

    // Template, tipo de reunião e base de conhecimento — tudo da organização
    // dona da reunião.
    const [template, knowledgeContext, meetingTypeContext] = await Promise.all([
      loadTemplate(supabase, orgId, meeting.meeting_type),
      fetchKnowledgeContext(supabase, orgId),
      loadMeetingTypeContext(supabase, orgId, meeting.meeting_type),
    ]);

    const { data: meetingTypeRow } = await supabase
      .from("meeting_types")
      .select("label")
      .eq("org_id", orgId)
      .eq("key", meeting.meeting_type ?? "")
      .maybeSingle();

    // Gravação de um clique (extensão) chega sem os dados do lead: a análise
    // os identifica pela conversa.
    const missingLead = !meeting.lead_name?.trim() || !meeting.lead_company?.trim();
    const leadInstruction = missingLead
      ? `\n\nInclua também no JSON o campo "lead_identificado": {"lead_nome": string | null, "lead_empresa": string | null}, ` +
        `com o nome da pessoa do lado do cliente e a empresa dela, como aparecem na conversa. ` +
        `Use null para o que não for dito com clareza; não invente.`
      : "";

    // Participantes da agenda, quando a reunião veio com eles: ajudam a saber
    // quem é quem na transcrição e de que empresa é o lead (pelo domínio).
    const attendeeList = Array.isArray(meeting.attendees) ? meeting.attendees as { name?: string | null; email?: string; externo?: boolean }[] : [];
    const attendeesContext = attendeeList.length
      ? `\n\nParticipantes do convite da agenda:\n` + attendeeList.slice(0, 30).map((a) =>
          `- ${a.name ? `${a.name} ` : ""}<${a.email}> (${a.externo ? "cliente / de fora" : "equipe da empresa"})`).join("\n")
      : "";

    const analysisPrompt = buildAnalysisPrompt({
      template,
      transcript,
      meetingTitle: meeting.title,
      meetingTypeLabel: meetingTypeRow?.label ?? meeting.meeting_type ?? null,
      meetingTypeContext,
      leadName: meeting.lead_name,
      leadCompany: meeting.lead_company,
      knowledgeContext,
      meetingDate: (meeting.meeting_date ?? meeting.created_at ?? "").slice(0, 10) || null,
    });

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        messages: [
          { role: "system", content: analysisSystemMessage(template) },
          { role: "user", content: analysisPrompt + attendeesContext + leadInstruction },
        ],
      }),
    });

    if (!aiRes.ok) {
      const aiErrText = await aiRes.text();
      console.error("AI error:", aiRes.status, aiErrText);
      await supabase.from("meetings").update({
        status: "erro",
        error_message: `Falha na análise por IA (HTTP ${aiRes.status}). Tente novamente em alguns minutos.`,
      }).eq("id", meetingId);
      return;
    }

    const aiResult = await aiRes.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || "";

    await logUsage(supabase, {
      orgId,
      userId: meeting.seller_id,
      meetingId,
      operation: "analise",
      provider: "lovable-gateway",
      model: ANALYSIS_MODEL,
      inputTokens: aiResult.usage?.prompt_tokens ?? 0,
      outputTokens: aiResult.usage?.completion_tokens ?? 0,
      quantity: 1,
      unit: "analise",
      estimatedCost:
        (aiResult.usage?.prompt_tokens ?? 0) * 0.0000003 +
        (aiResult.usage?.completion_tokens ?? 0) * 0.0000025,
    });

    let analysisData;
    try {
      const jsonStr = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysisData = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", rawContent);
      await supabase.from("meetings").update({
        status: "erro",
        error_message: "A IA retornou uma resposta inválida. Tente reprocessar.",
      }).eq("id", meetingId);
      return;
    }

    const { error: insertError } = await supabase.from("analysis_results").insert({
      meeting_id: meetingId,
      org_id: orgId,
      overall_score: analysisData.overall_score,
      temperature: analysisData.temperature,
      bant_score: analysisData.bant_score,
      // Playbook de atendimento não tem MEDDIC nem SPIN.
      meddic_score: template.mode === "playbook" ? null : analysisData.meddic_score,
      spin_score: template.mode === "playbook" ? null : analysisData.spin_score,
      playbook_result: template.mode === "playbook" ? analysisData.playbook ?? null : null,
      talk_ratio: analysisData.talk_ratio,
      conversation_metrics: analysisData.conversation_metrics,
      insights: analysisData.insights,
      sales_coach: analysisData.sales_coach,
      rag_results: analysisData.rag_results || null,
      raw_analysis: analysisData,
      methodology: methodologySnapshot(template),
      model_used: ANALYSIS_MODEL,
    });

    if (insertError) {
      console.error("Failed to insert analysis_results:", JSON.stringify(insertError));
      await supabase.from("meetings").update({
        status: "erro",
        error_message: `Falha ao salvar a análise no banco: ${insertError.message || "erro desconhecido"}`,
      }).eq("id", meetingId);
      return;
    }

    if (analysisData.highlights && Array.isArray(analysisData.highlights)) {
      const rows = analysisData.highlights.map((h: any) => ({
        meeting_id: meetingId,
        org_id: orgId,
        highlight_type: h.type,
        text: h.text,
        speaker: h.speaker || null,
      }));
      if (rows.length > 0) await supabase.from("highlights").insert(rows);
    }

    // Preenche só o que o vendedor deixou em branco.
    const leadFound = missingLead ? analysisData.lead_identificado : null;
    const cleanLead = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
    const leadPatch: Record<string, string> = {};
    if (leadFound && !meeting.lead_name?.trim() && cleanLead(leadFound.lead_nome)) leadPatch.lead_name = cleanLead(leadFound.lead_nome)!;
    if (leadFound && !meeting.lead_company?.trim() && cleanLead(leadFound.lead_empresa)) leadPatch.lead_company = cleanLead(leadFound.lead_empresa)!;

    const { error: updateError } = await supabase.from("meetings").update({
      status: "completo",
      overall_score: analysisData.overall_score,
      temperature: analysisData.temperature,
      error_message: null,
      ...leadPatch,
    }).eq("id", meetingId);

    if (updateError) {
      console.error("Failed to update meeting status:", JSON.stringify(updateError));
    }

    // Envio ao CRM do cliente, quando houver um conectado. Falha aqui não
    // afeta a análise: o envio fica na fila da crm-sync.
    try {
      const crmRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/crm-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
        },
        body: JSON.stringify({ meetingId }),
      });
      if (!crmRes.ok) console.error("crm-sync:", crmRes.status, await crmRes.text());
    } catch (err) {
      console.error("crm-sync indisponível:", err);
    }

    console.log("Meeting processing complete:", meetingId);
  } catch (error) {
    console.error("Processing error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido durante o processamento.";
    await supabase
      .from("meetings")
      .update({ status: "erro", error_message: mensagemAmigavel(errorMessage) })
      .eq("id", meetingId);
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    // Chamada interna (upload-recording, import-bulk-meetings) traz o segredo
    // compartilhado; chamada do app traz o token do usuário.
    const internal = isInternalCall(req);
    const ctx = internal ? null : await getCaller(req);
    const admin = ctx?.admin ?? adminClient();

    const { meetingId, manualTranscript } = await req.json();

    if (!meetingId) {
      return json(req, { error: "meetingId is required" }, 400);
    }

    const meetingQuery = admin
      .from("meetings")
      .select("id, status, seller_id, org_id")
      .eq("id", meetingId);

    // Do app, a reunião precisa ser da organização de quem chamou.
    const { data: meeting } = ctx
      ? await meetingQuery.eq("org_id", ctx.orgId).maybeSingle()
      : await meetingQuery.maybeSingle();

    if (!meeting) {
      return json(req, { error: "Reunião não encontrada" }, 404);
    }

    if (ctx && meeting.seller_id !== ctx.userId && ctx.role !== "admin") {
      return json(req, { error: "Sem permissão para processar esta reunião" }, 403);
    }

    await assertQuota(admin, meeting.org_id, "analise", 1);

    await admin.from("meetings").update({
      status: "transcrevendo",
      error_message: null,
    }).eq("id", meetingId);

    EdgeRuntime.waitUntil(
      processMeeting(meetingId, manualTranscript || null).catch((err) => {
        console.error("Background processing failed:", err);
        const msg = err instanceof Error ? err.message : "Erro inesperado no processamento.";
        adminClient().from("meetings").update({
          status: "erro",
          error_message: msg,
        }).eq("id", meetingId);
      })
    );

    return json(req, { success: true, message: "Processing started" });
  } catch (error) {
    if (error instanceof HttpError) {
      return json(req, { error: error.message, code: error.code }, error.status);
    }
    console.error("analyze-meeting error:", error);
    return json(req, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
