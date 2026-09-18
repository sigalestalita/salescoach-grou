// Transcrição de uma fala curta (um turno do modo de treino por voz).
//
// O navegador grava o áudio com MediaRecorder e manda aqui em base64; a
// transcrição é feita pelo AssemblyAI, o mesmo serviço que já transcreve as
// reuniões de verdade. Antes isso dependia do reconhecimento de fala embutido
// no navegador, que só funciona no Chrome do Google — em Arc, Brave, Vivaldi,
// Firefox e Safari falhava com erro de rede.

import { json, preflight } from "../_shared/cors.ts";
import { assertQuota, getCaller, HttpError, logUsage } from "../_shared/tenant.ts";

const ASSEMBLY_KEY = Deno.env.get("ASSEMBLYAI_API_KEY");
const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // ~8 MB: muito acima de um turno de fala
const POLL_INTERVAL_MS = 700;
const POLL_ATTEMPTS = 60; // ~42 s de teto para uma fala curta

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (!ASSEMBLY_KEY) throw new HttpError(500, "ASSEMBLYAI_API_KEY não configurada");

    const ctx = await getCaller(req);
    const { sessionId, audioBase64, durationSeconds } = await req.json();

    if (!audioBase64) throw new HttpError(400, "Áudio ausente");

    // A fala precisa pertencer a um treino em andamento de quem está chamando.
    if (sessionId) {
      const { data: session } = await ctx.admin
        .from("roleplay_sessions")
        .select("id, user_id, status")
        .eq("id", sessionId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
      if (!session || session.user_id !== ctx.userId) throw new HttpError(404, "Sessão de treino não encontrada");
      if (session.status !== "em_andamento") throw new HttpError(400, "Este treino já foi encerrado");
    }

    const minutes = Math.max(0.1, Math.round(((Number(durationSeconds) || 10) / 60) * 100) / 100);
    await assertQuota(ctx.admin, ctx.orgId, "transcricao", minutes);

    const audio = base64ToBytes(audioBase64);
    if (audio.byteLength === 0) throw new HttpError(400, "Áudio vazio");
    if (audio.byteLength > MAX_AUDIO_BYTES) throw new HttpError(413, "Áudio longo demais para um turno de treino");

    // 1. Sobe o áudio para o AssemblyAI
    const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: { Authorization: ASSEMBLY_KEY, "Content-Type": "application/octet-stream" },
      body: audio,
    });
    if (!uploadRes.ok) {
      console.error("AssemblyAI upload falhou:", uploadRes.status, await uploadRes.text());
      throw new HttpError(502, "Não foi possível enviar o áudio para transcrição");
    }
    const { upload_url } = await uploadRes.json();

    // 2. Pede a transcrição, com idioma fixo — detecção automática é pouco
    //    confiável em poucos segundos de fala.
    const startRes = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: { Authorization: ASSEMBLY_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ audio_url: upload_url, language_code: "pt" }),
    });
    if (!startRes.ok) {
      console.error("AssemblyAI transcript falhou:", startRes.status, await startRes.text());
      throw new HttpError(502, "Não foi possível iniciar a transcrição");
    }
    const { id: transcriptId } = await startRes.json();

    // 3. Aguarda o resultado
    let text = "";
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { Authorization: ASSEMBLY_KEY },
      });
      const data = await pollRes.json();
      if (data.status === "completed") {
        text = (data.text ?? "").trim();
        break;
      }
      if (data.status === "error") {
        console.error("AssemblyAI erro:", data.error);
        throw new HttpError(502, "A transcrição falhou");
      }
    }

    if (!text) {
      return json(req, { text: "", empty: true });
    }

    await logUsage(ctx.admin, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      operation: "transcricao",
      provider: "assemblyai",
      model: "assemblyai/default",
      quantity: minutes,
      unit: "minutos",
    });

    return json(req, { text });
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    console.error("transcribe-utterance error:", e);
    return json(req, { error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
