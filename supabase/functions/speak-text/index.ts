// Voz do lead no modo de treino, com síntese neural.
//
// A voz do navegador (speechSynthesis) usa o que o sistema operacional tem
// instalado. No Mac e nos navegadores fora o Chrome isso significa a Luciana,
// que soa robótica. Aqui a fala é gerada por um serviço neural e volta como
// áudio pronto para tocar. Sem chave configurada a função responde 501 e o
// navegador cai de volta na voz do sistema — nada quebra.
//
// Provedor: TTS_PROVIDER = elevenlabs | openai | gemini. Sem ele, usa a
// primeira chave que existir, nessa ordem.

import { corsHeaders, json, preflight } from "../_shared/cors.ts";
import { getCaller, HttpError, logUsage } from "../_shared/tenant.ts";

const ELEVEN_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

const MAX_CHARS = 700;

/** Vozes padrão por gênero, por provedor. Podem ser trocadas por env. */
const VOZES = {
  elevenlabs: {
    // Vozes multilíngues que falam português do Brasil sem sotaque estrangeiro.
    f: Deno.env.get("ELEVENLABS_VOICE_F") ?? "EXAVITQu4vr4xnSDxMaL", // Sarah
    m: Deno.env.get("ELEVENLABS_VOICE_M") ?? "onwK4e9ZLuTAKqWW03F9", // Daniel
  },
  openai: {
    f: Deno.env.get("OPENAI_VOICE_F") ?? "shimmer",
    m: Deno.env.get("OPENAI_VOICE_M") ?? "onyx",
  },
  gemini: {
    f: Deno.env.get("GEMINI_VOICE_F") ?? "Aoede",
    m: Deno.env.get("GEMINI_VOICE_M") ?? "Charon",
  },
};

function provedor(): "elevenlabs" | "openai" | "gemini" | null {
  const escolhido = (Deno.env.get("TTS_PROVIDER") ?? "").trim().toLowerCase();
  if (escolhido === "elevenlabs" && ELEVEN_KEY) return "elevenlabs";
  if (escolhido === "openai" && OPENAI_KEY) return "openai";
  if (escolhido === "gemini" && GEMINI_KEY) return "gemini";
  if (escolhido) return null; // pediram um provedor que não está configurado
  if (ELEVEN_KEY) return "elevenlabs";
  if (OPENAI_KEY) return "openai";
  if (GEMINI_KEY) return "gemini";
  return null;
}

/** WAV de 24 kHz mono a partir do PCM16 cru que o Gemini devolve. */
function pcmParaWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const escreve = (pos: number, txt: string) => { for (let i = 0; i < txt.length; i++) view.setUint8(pos + i, txt.charCodeAt(i)); };
  escreve(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  escreve(8, "WAVE");
  escreve(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  escreve(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  const out = new Uint8Array(44 + pcm.byteLength);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

async function falaElevenLabs(texto: string, genero: "f" | "m"): Promise<Response> {
  const voz = VOZES.elevenlabs[genero];
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}?output_format=mp3_22050_32`, {
    method: "POST",
    headers: { "xi-api-key": ELEVEN_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: texto,
      // Flash é o modelo de menor latência que fala português.
      model_id: Deno.env.get("ELEVENLABS_MODEL") ?? "eleven_flash_v2_5",
      language_code: "pt",
      voice_settings: { stability: 0.4, similarity_boost: 0.75, speed: 1.05 },
    }),
  });
  if (!r.ok) throw new HttpError(502, `ElevenLabs: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}

async function falaOpenAI(texto: string, genero: "f" | "m"): Promise<Response> {
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_TTS_MODEL") ?? "gpt-4o-mini-tts",
      voice: VOZES.openai[genero],
      input: texto,
      response_format: "mp3",
      instructions: "Fale em português do Brasil, em tom de conversa de telefone comercial: natural, sem locução, sem pressa.",
    }),
  });
  if (!r.ok) throw new HttpError(502, `OpenAI TTS: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r;
}

async function falaGemini(texto: string, genero: "f" | "m"): Promise<Uint8Array> {
  const modelo = Deno.env.get("GEMINI_TTS_MODEL") ?? "gemini-2.5-flash-preview-tts";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // O prefixo antes dos dois-pontos é instrução de estilo: o modelo fala só o que vem depois.
      contents: [{ parts: [{ text: `Em português do Brasil, em tom de conversa de telefone comercial: ${texto}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZES.gemini[genero] } } },
      },
    }),
  });
  if (!r.ok) throw new HttpError(502, `Gemini TTS: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const b64 = j?.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data)?.inlineData?.data;
  if (!b64) throw new HttpError(502, "Gemini TTS não devolveu áudio");
  const bin = atob(b64);
  const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
  return pcmParaWav(pcm);
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const qual = provedor();
    if (!qual) return json(req, { error: "tts_nao_configurado" }, 501);

    const ctx = await getCaller(req);
    const { text, gender } = await req.json();
    const texto = String(text ?? "").trim().slice(0, MAX_CHARS);
    if (!texto) throw new HttpError(400, "Texto vazio");
    const genero: "f" | "m" = gender === "male" ? "m" : "f";

    let corpo: BodyInit;
    let tipo: string;
    if (qual === "gemini") {
      corpo = await falaGemini(texto, genero);
      tipo = "audio/wav";
    } else {
      const r = qual === "elevenlabs" ? await falaElevenLabs(texto, genero) : await falaOpenAI(texto, genero);
      corpo = await r.arrayBuffer();
      tipo = "audio/mpeg";
    }

    // Custo de TTS é por caractere; registrar deixa isso visível no consumo.
    logUsage(ctx.admin, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      operation: "tts",
      provider: qual,
      model: qual,
      quantity: texto.length,
      unit: "caracteres",
    }).catch(() => { /* o log não pode atrasar a fala */ });

    return new Response(corpo, {
      headers: { ...corsHeaders(req), "Content-Type": tipo, "Cache-Control": "no-store", "X-Tts-Provider": qual },
    });
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.message, code: e.code }, e.status);
    console.error("speak-text error:", e);
    return json(req, { error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
